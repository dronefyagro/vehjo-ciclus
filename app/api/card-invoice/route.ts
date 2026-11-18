import { NextResponse } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export const runtime = "nodejs";

type PdfTextItem = { str?: string; hasEOL?: boolean };

const normalizeDate = (value: string, referenceYear: number) => {
  const parts = value.split("/").map(Number);
  if (parts.length < 2) return "";
  let year = parts[2] || referenceYear;
  if (year < 100) year += 2000;
  return `${year}-${String(parts[1]).padStart(2, "0")}-${String(parts[0]).padStart(2, "0")}`;
};

const parseMoney = (value: string) => {
  const parsed = Number(value.replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
};

const cleanMerchant = (value: string) => value
  .replace(/\s{2,}/g, " ")
  .replace(/\s+(?:parcela\s*)?\d{1,2}\s*[\/]\s*\d{1,2}\s*$/i, "")
  .trim();

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione uma fatura em PDF." }, { status: 400 });
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "O arquivo deve estar no formato PDF." }, { status: 400 });
    if (file.size > 12 * 1024 * 1024) return NextResponse.json({ error: "O PDF deve ter no máximo 12 MB." }, { status: 400 });

    const data = new Uint8Array(await file.arrayBuffer());
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

    const linePattern = /(?:^|\n)\s*(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.{2,120}?)\s+(?:R\$\s*)?(-?[\d.]+,\d{2})(?=\s*(?:\n|$))/g;
    const transactions: Array<{ id: string; date: string; merchant: string; value: number; installment: string; selected: boolean; confidence: "Alta" | "Média" }> = [];
    const seen = new Set<string>();
    for (const pageText of pageTexts) {
      for (const match of pageText.matchAll(linePattern)) {
        const merchant = cleanMerchant(match[2]);
        const value = parseMoney(match[3]);
        if (!merchant || !value || /pagamento|saldo\s+anterior|total\s+da\s+fatura|encargos|limite/i.test(merchant)) continue;
        const date = normalizeDate(match[1], referenceYear);
        const installmentMatch = match[2].match(/(?:parcela\s*)?(\d{1,2})\s*[\/]\s*(\d{1,2})/i);
        const installment = installmentMatch ? `${installmentMatch[1]}/${installmentMatch[2]}` : "";
        const key = `${date}|${merchant.toLocaleLowerCase("pt-BR")}|${value.toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        transactions.push({ id: key, date, merchant, value, installment, selected: true, confidence: "Alta" });
      }
    }

    if (!transactions.length) return NextResponse.json({ error: "Não foi possível reconhecer lançamentos neste modelo de PDF. Verifique se o arquivo possui texto selecionável ou utilize uma fatura sem senha." }, { status: 422 });
    return NextResponse.json({ fileName: file.name, invoiceLabel, dueDate, pages: document.numPages, transactions, total: transactions.reduce((sum, item) => sum + item.value, 0) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível interpretar a fatura." }, { status: 500 });
  }
}
