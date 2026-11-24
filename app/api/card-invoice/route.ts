import { NextResponse } from "next/server";
import { rejectUnsafeMutation } from "../../lib/api-guard";
import { getRequestSession } from "../../lib/auth";
import { canAccessModule } from "../../lib/access-control";
import { loadPdfReader } from "../../lib/pdf-reader";
export const runtime = "nodejs";
export const maxDuration = 60;

type PdfTextItem = { str?: string; hasEOL?: boolean };

const normalizeDate = (value: string, referenceYear: number) => {
  const parts = value.split("/").map(Number);
  if (parts.length < 2) return "";
  let year = parts[2] || referenceYear;
  if (year < 100) year += 2000;
  return `${year}-${String(parts[1]).padStart(2, "0")}-${String(parts[0]).padStart(2, "0")}`;
};

const monthNumbers: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

const normalizeInvoiceDate = (day: string, monthValue: string, explicitYear: string | undefined, dueDate: string) => {
  const month = /^\d+$/.test(monthValue) ? Number(monthValue) : monthNumbers[monthValue.slice(0, 3).toLocaleLowerCase("pt-BR")];
  if (!month) return "";
  let year = explicitYear ? Number(explicitYear) : Number(dueDate.slice(0, 4)) || new Date().getFullYear();
  if (year < 100) year += 2000;
  const dueMonth = Number(dueDate.slice(5, 7));
  if (!explicitYear && dueMonth && month > dueMonth) year -= 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
};

const parseMoney = (value: string) => {
  const parsed = Number(value.replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
};

const cleanMerchant = (value: string) => value
  .replace(/^.*?\b(?:presencial|online)\s+/i, "")
  .replace(/\s+Com\s+C\s+BRL\b.*$/i, "")
  .replace(/\s{2,}/g, " ")
  .replace(/\s+(?:parcela\s*)?\d{1,2}\s*[/]\s*\d{1,2}\s*$/i, "")
  .trim();

export async function POST(request: Request) {
  const rejected = rejectUnsafeMutation(request);
  if (rejected) return rejected;
  const session = getRequestSession(request);
  if (!session || !canAccessModule(session.role, "Análise de Faturas")) return NextResponse.json({ error: "Seu perfil não possui acesso à análise de faturas." }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione uma fatura em PDF." }, { status: 400 });
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "O arquivo deve estar no formato PDF." }, { status: 400 });
    if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "O PDF deve ter no máximo 4 MB." }, { status: 413 });

    const data = new Uint8Array(await file.arrayBuffer());
    const { getDocument } = await loadPdfReader();
    const document = await getDocument({ data, useSystemFonts: true }).promise;
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let text = "";
      for (const raw of content.items as PdfTextItem[]) {
        const item = raw.str?.trim();
        if (item) text += `${item} `;
        if (raw.hasEOL) text += "\n";
      }
      pageTexts.push(text);
    }
    const fullText = pageTexts.join("\n");
    const dueMatch = fullText.match(/(?:vencimento|data\s+de\s+vencimento)[^\d]{0,25}(\d{2}\/\d{2}\/\d{2,4})/i);
    const dueDate = dueMatch ? normalizeDate(dueMatch[1], new Date().getFullYear()) : "";
    const referenceYear = dueDate ? Number(dueDate.slice(0, 4)) : new Date().getFullYear();
    const cardMatch = fullText.match(/(?:cart[aã]o|final)\s*(?:n[º°o.]*)?\s*[*xX.-]*(\d{4})/i);
    const bankMatch = fullText.match(/\b(Nubank|Inter|Ita[uú]|Santander|Bradesco|Caixa|Banco\s+do\s+Brasil|Sicoob|Sicredi|C6|XP)\b/i);
    const invoiceLabel = [bankMatch?.[1], cardMatch ? `final ${cardMatch[1]}` : ""].filter(Boolean).join(" · ") || file.name.replace(/\.pdf$/i, "");

    const transactions: Array<{ id: string; date: string; merchant: string; value: number; installment: string; selected: boolean; confidence: "Alta" | "Média" }> = [];
    const seen = new Set<string>();
    for (const pageText of pageTexts) {
      const lines = pageText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
      const blocks: Array<{ day: string; month: string; year?: string; details: string }> = [];
      let current: { day: string; month: string; year?: string; details: string } | null = null;
      for (const line of lines) {
        const start = line.match(/^(\d{1,2})\/\s*(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|\d{1,2})(?:\/(\d{2,4}))?\s+(.+)$/i);
        if (start) {
          if (current) blocks.push(current);
          current = { day: start[1], month: start[2], year: start[3], details: start[4] };
        } else if (current && !/^(?:total\s+cart[aã]o|legenda:|\d+\s+de\s+\d+)\b/i.test(line)) {
          current.details += ` ${line}`;
        } else if (current) {
          blocks.push(current);
          current = null;
        }
      }
      if (current) blocks.push(current);

      for (const block of blocks) {
        const moneyMatches = [...block.details.matchAll(/R\$\s*(-?[\d.]+,\d{2})/gi)];
        const lastMoney = moneyMatches.at(-1);
        if (!lastMoney) continue;
        const rawMerchant = block.details.slice(0, lastMoney.index).replace(/^\d{2}:\d{2}\s+/, "");
        const merchant = cleanMerchant(rawMerchant);
        const value = parseMoney(lastMoney[1]);
        if (!merchant || !value || /pagamento|saldo\s+anterior|total\s+(?:da|desta)\s+fatura|fechamento|encargos|limite/i.test(merchant)) continue;
        const date = normalizeInvoiceDate(block.day, block.month, block.year, dueDate || `${referenceYear}-12-01`);
        const installmentMatch = rawMerchant.match(/(?:parcela\s*)?(\d{1,2})\s*[/]\s*(\d{1,2})/i);
        const installment = installmentMatch ? `${installmentMatch[1]}/${installmentMatch[2]}` : "";
        const key = `${date}|${merchant.toLocaleLowerCase("pt-BR")}|${value.toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        transactions.push({ id: key, date, merchant, value, installment, selected: true, confidence: "Alta" });
      }
    }

    if (!transactions.length) return NextResponse.json({ error: "Não foi possível reconhecer lançamentos neste modelo de PDF. Verifique se o arquivo possui texto selecionável ou utilize uma fatura sem senha." }, { status: 422 });
    const total = Number(transactions.reduce((sum, item) => sum + item.value, 0).toFixed(2));
    return NextResponse.json({ fileName: file.name, invoiceLabel, dueDate, pages: document.numPages, transactions, total });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível interpretar a fatura." }, { status: 500 });
  }
}
