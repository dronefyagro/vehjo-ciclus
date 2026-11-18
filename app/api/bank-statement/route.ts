import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const loadPdfReader = async () => {
  const { default: DOMMatrix } = await import("@thednp/dommatrix");
  const browserGlobals = globalThis as Record<string, unknown>;
  browserGlobals.DOMMatrix ??= DOMMatrix;
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  return import("pdfjs-dist/legacy/build/pdf.mjs");
};

type Movement = "credit" | "debit";
type Confidence = "Alta" | "Média" | "Baixa";
type LearnedRule = {
  key: string;
  target: string;
  category: string;
  costRelation?: string;
  costBehavior?: string;
  origin?: string;
  destination?: string;
};

type RawTransaction = {
  date: string;
  amount: number;
  movement: Movement;
  description: string;
  counterparty: string;
  document?: string;
  externalId?: string;
};

const normalize = (value = "") => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase();
const digits = (value = "") => value.replace(/\D/g, "");
const money = (value = "") => {
  const clean = value.replace(/R\$|\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const parsed = Number(clean.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const isoDate = (value: string) => {
  const br = value.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (br) return `${br[3].length === 2 ? `20${br[3]}` : br[3]}-${br[2]}-${br[1]}`;
  const ofx = value.match(/(\d{4})(\d{2})(\d{2})/);
  return ofx ? `${ofx[1]}-${ofx[2]}-${ofx[3]}` : "";
};
const ruleKey = (transaction: Pick<RawTransaction, "document" | "counterparty">) => {
  const document = digits(transaction.document);
  if (document.length >= 11) return `doc:${document}`;
  const name = normalize(transaction.counterparty)
    .replace(/\b(pix|ted|doc|pagamento|transferencia|recebido|enviado|compra|debito|credito|ltda|sa|me|eireli)\b/g, " ")
    .replace(/\s+/g, " ").trim();
  return `nome:${name.slice(0, 72)}`;
};
const detectBank = (text: string, fileName: string) => {
  const source = normalize(`${fileName} ${text.slice(0, 12000)}`);
  const banks: Array<[RegExp, string]> = [
    [/\bcora\b/, "Cora"], [/\bsicredi\b/, "Sicredi"], [/\bsicoob\b/, "Sicoob"], [/\bnubank\b|nu pagamentos/, "Nubank"],
    [/\bitau\b/, "Itaú"], [/\bsantander\b/, "Santander"], [/\bbradesco\b/, "Bradesco"], [/banco do brasil|\bbb\b/, "Banco do Brasil"],
    [/caixa economica|\bcaixa\b/, "Caixa"], [/banco inter|\binter\b/, "Inter"], [/mercado pago/, "Mercado Pago"], [/pagbank|pagseguro/, "PagBank"],
  ];
  return banks.find(([pattern]) => pattern.test(source))?.[1] ?? "Banco não identificado";
};

const tag = (block: string, name: string) => block.match(new RegExp(`<${name}>\\s*([^<\\r\\n]+)`, "i"))?.[1]?.trim() ?? "";
const parseOfx = (text: string): RawTransaction[] => [...text.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>))/gi)].map((match) => {
  const block = match[1];
  const signed = money(tag(block, "TRNAMT"));
  const name = tag(block, "NAME");
  const memo = tag(block, "MEMO");
  const description = [name, memo].filter(Boolean).join(" · ");
  const document = description.match(/\b\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}\b|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)?.[0];
  return { date: isoDate(tag(block, "DTPOSTED")), amount: Math.abs(signed), movement: (signed >= 0 ? "credit" : "debit") as Movement, description, counterparty: name || memo || "Não identificado", document, externalId: tag(block, "FITID") };
}).filter((item) => item.date && item.amount);

const parseCsvLine = (line: string, delimiter: string) => {
  const cells: string[] = []; let current = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') { current += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { cells.push(current.trim()); current = ""; }
    else current += char;
  }
  cells.push(current.trim()); return cells;
};
const parseCsv = (text: string): RawTransaction[] => {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const delimiter = [";", "\t", ","].sort((a, b) => (lines[0].split(b).length - lines[0].split(a).length))[0];
  const headers = parseCsvLine(lines[0], delimiter).map(normalize);
  const find = (...names: RegExp[]) => headers.findIndex((header) => names.some((pattern) => pattern.test(header)));
  const dateIndex = find(/^data/, /date/), descriptionIndex = find(/descricao|historico|lancamento|estabelecimento|favorecido|memo|name/), documentIndex = find(/cpf|cnpj|documento/), idIndex = find(/^id$|identificador|fitid/);
  const valueIndex = find(/^valor$|amount|valor lancamento/), creditIndex = find(/credito|entrada|recebimento/), debitIndex = find(/debito|saida|pagamento/), typeIndex = find(/^tipo$|natureza|movimento/);
  if (dateIndex < 0 || (valueIndex < 0 && creditIndex < 0 && debitIndex < 0)) return [];
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line, delimiter); const credit = creditIndex >= 0 ? money(cells[creditIndex]) : 0; const debit = debitIndex >= 0 ? money(cells[debitIndex]) : 0; const signed = valueIndex >= 0 ? money(cells[valueIndex]) : credit || -Math.abs(debit);
    const type = normalize(cells[typeIndex] ?? ""); const movement: Movement = credit > 0 || signed > 0 || /credito|entrada|recebid/.test(type) ? "credit" : "debit";
    const description = cells[descriptionIndex] || "Não identificado";
    return { date: isoDate(cells[dateIndex]), amount: Math.abs(signed || debit), movement, description, counterparty: description, document: cells[documentIndex], externalId: cells[idIndex] } as RawTransaction;
  }).filter((item) => item.date && item.amount);
};

type PdfTextItem = { str?: string; transform?: number[]; width?: number };
const extractPdf = async (data: Uint8Array) => {
  const pdfjs = await loadPdfReader();
  const document = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber); const content = await page.getTextContent(); const lines: Array<{ y: number; items: Array<{ x: number; text: string }> }> = [];
    for (const raw of content.items as PdfTextItem[]) {
      const text = raw.str?.trim(); if (!text) continue; const x = raw.transform?.[4] ?? 0; const y = raw.transform?.[5] ?? 0;
      let line = lines.find((candidate) => Math.abs(candidate.y - y) < 2); if (!line) { line = { y, items: [] }; lines.push(line); } line.items.push({ x, text });
    }
    pages.push(lines.sort((a, b) => b.y - a.y).map((line) => line.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ")).join("\n"));
  }
  return { text: pages.join("\n"), pages: document.numPages };
};

const transactionKeywords = /pix|ted|doc|pagamento|transfer[eê]ncia|compra|d[eé]bito|cr[eé]dito|boleto|tarifa|tributo|imposto|saque/i;
const parsePdfBlocks = (text: string): RawTransaction[] => {
  let currentDate = "";
  const lineTransactions: RawTransaction[] = [];
  for (const line of text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    const datedBalance = line.match(/^(\d{2}\/\d{2}\/\d{4})\s*(?:\||\s).*saldo do dia/i);
    if (datedBalance) { currentDate = isoDate(datedBalance[1]); continue; }
    if (!currentDate || !transactionKeywords.test(line)) continue;
    const amountMatch = line.match(/([+-])\s*R\$\s*((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*$/i);
    if (!amountMatch) continue;
    const parts = line.split("|").map((value) => value.replace(/^…$|^\.\.\.$/, "").trim()).filter(Boolean);
    const transactionType = parts[0] ?? "Movimentação bancária";
    const document = line.match(/\b\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}\b|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)?.[0];
    const counterparty = parts.find((part, index) => index > 0 && /[A-Za-zÀ-ÿ]{3}/.test(part) && !/R\$/.test(part) && !/^\d{2}\.?\d{3}/.test(part)) ?? transactionType;
    lineTransactions.push({ date: currentDate, amount: Math.abs(money(amountMatch[2])), movement: amountMatch[1] === "+" ? "credit" : "debit", description: line, counterparty, document });
  }
  if (lineTransactions.length) return lineTransactions;
  const start = /(?:^|\n)(\d{2}\/\d{2}\/\d{4})(?=\s|\n)/g; const matches = [...text.matchAll(start)]; const transactions: RawTransaction[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const block = text.slice(matches[index].index!, matches[index + 1]?.index ?? text.length).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const joined = block.join(" · "); if (!transactionKeywords.test(joined) || /saldo (?:do dia|anterior|final)/i.test(joined) && !/pix|pagamento|transfer/i.test(joined)) continue;
    const amountMatches = [...joined.matchAll(/([+-])?\s*(?:R\$\s*)?((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})/g)];
    const amountMatch = amountMatches.find((item) => item[1]) ?? amountMatches[0]; if (!amountMatch) continue;
    const normalizedBlock = normalize(joined); const explicitSign = amountMatch[1];
    const movement: Movement = explicitSign === "+" || /pix recebido|transferencia recebida|credito|recebimento/.test(normalizedBlock) ? "credit" : "debit";
    const document = joined.match(/\b\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}\b|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)?.[0];
    const ignored = /^(\d{2}\/\d{2}\/\d{4}|pix|ted|doc|pagamento|transfer[eê]ncia|compra|d[eé]bito|cr[eé]dito|boleto|tarifa|valor|saldo|ag[eê]ncia|conta)/i;
    const candidates = block.filter((line) => !ignored.test(line) && !/R\$|\d{1,3}(?:\.\d{3})*,\d{2}/.test(line) && line.length > 2);
    const counterparty = candidates.find((line) => /[A-Za-zÀ-ÿ]{3}/.test(line)) ?? block.find((line) => /[A-Za-zÀ-ÿ]{3}/.test(line) && !ignored.test(line)) ?? "Não identificado";
    transactions.push({ date: isoDate(matches[index][1]), amount: Math.abs(money(amountMatch[2])), movement, description: joined.slice(0, 420), counterparty, document });
  }
  if (transactions.length) return transactions;
  const inline = /(?:^|\n)\s*(\d{2}\/\d{2}\/\d{4})\s+(.{3,160}?)\s+([+-])?\s*(?:R\$\s*)?([\d.]+,\d{2})(?=\s*(?:\n|$))/g;
  return [...text.matchAll(inline)].map((match) => ({ date: isoDate(match[1]), amount: Math.abs(money(match[4])), movement: match[3] === "+" || /recebid|credito/i.test(match[2]) ? "credit" : "debit", description: match[2].trim(), counterparty: match[2].trim() }));
};

const categorySuggestion = (transaction: RawTransaction) => {
  const value = normalize(`${transaction.counterparty} ${transaction.description}`);
  const rules: Array<[RegExp, string, string, string]> = [
    [/posto|combustivel|gasolina|etanol|diesel/, "Combustível", "Direto", "Variável"],
    [/cemig|energia|eletric/, "Energia elétrica", "Indireto", "Fixo"], [/agua|saneamento|copasa/, "Água e saneamento", "Indireto", "Fixo"],
    [/telecom|internet|telefon|claro|vivo|tim\b/, "Internet e telecomunicações", "Indireto", "Fixo"],
    [/hotel|pousada|restaurante|churrasc|lanch|aliment/, "Viagens e alimentação", "Indireto", "Variável"],
    [/uber|99app|expresso|passagem|azul|gol\b|latam|transport/, "Transporte e viagens", "Indireto", "Variável"],
    [/fazenda|ministerio|darf|das\b|imposto|tribut/, "Impostos e tributos", "Indireto", "Fixo"],
    [/conselho|crea|cfta|anuidade|tarifa/, "Taxas e anuidades", "Indireto", "Fixo"],
    [/parafuso|ferrament|material|supermercado|papelaria/, "Materiais e suprimentos", "Direto", "Variável"],
    [/software|tecnologia|vindi|google|microsoft|adobe|canva|vercel/, "Serviços financeiros/tecnologia", "Indireto", "Fixo"],
  ];
  return rules.find(([pattern]) => pattern.test(value));
};
const classify = (transaction: RawTransaction, accountLabel: string, companyDocument: string, learnedRules: Map<string, LearnedRule>) => {
  const key = ruleKey(transaction); const learned = learnedRules.get(key); const text = normalize(`${transaction.counterparty} ${transaction.description}`); const ownDocument = digits(companyDocument); const counterpartyDocument = digits(transaction.document);
  const isInternal = ownDocument.length >= 11 && ownDocument === counterpartyDocument || /mesma titularidade|entre contas|transferencia interna/.test(text);
  const isSettlement = /pagamento (?:da )?fatura|cora scfi|administradora.*cartao/.test(text);
  const automatic = categorySuggestion(transaction);
  const defaultTarget = isInternal || isSettlement ? "Transferências" : transaction.movement === "credit" ? "Contas a Receber" : "Contas a Pagar";
  const target = learned?.target || defaultTarget;
  const category = learned?.category || (isInternal ? "Transferência interna" : isSettlement ? "Pagamento de fatura" : transaction.movement === "credit" ? "Receita a conciliar" : automatic?.[1] || "Pendente de classificação");
  const origin = learned?.origin || (transaction.movement === "credit" ? transaction.counterparty : accountLabel);
  const destination = learned?.destination || (transaction.movement === "credit" ? accountLabel : transaction.counterparty);
  const confidence: Confidence = learned || isInternal || isSettlement || automatic
    ? "Alta"
    : transaction.movement === "credit" || counterpartyDocument.length === 14
      ? "Média"
      : "Baixa";
  return { ...transaction, id: transaction.externalId || `${transaction.date}|${transaction.movement}|${transaction.amount.toFixed(2)}|${key}`, ruleKey: key, target, category, costRelation: learned?.costRelation || automatic?.[2] || "Indireto", costBehavior: learned?.costBehavior || automatic?.[3] || "Variável", origin, destination, confidence, suggestionSource: learned ? "Regra aprendida" : isInternal || isSettlement || automatic ? "Regra automática" : "Revisão necessária", selected: confidence !== "Baixa" };
};

export async function POST(request: Request) {
  try {
    const form = await request.formData(); const file = form.get("file"); if (!(file instanceof File)) return NextResponse.json({ error: "Selecione um extrato bancário." }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "O extrato deve ter no máximo 15 MB." }, { status: 400 });
    const extension = file.name.split(".").pop()?.toLowerCase() ?? ""; const allowed = ["pdf", "ofx", "qfx", "csv", "txt"];
    if (!allowed.includes(extension)) return NextResponse.json({ error: "Use um extrato em PDF, OFX, QFX, CSV ou TXT." }, { status: 400 });
    const learnedRules = new Map<string, LearnedRule>();
    try { for (const rule of JSON.parse(String(form.get("rules") || "[]")) as LearnedRule[]) if (rule.key) learnedRules.set(rule.key, rule); } catch { /* regras inválidas são ignoradas com segurança */ }
    const bytes = new Uint8Array(await file.arrayBuffer()); let text = ""; let pages = 0; let transactions: RawTransaction[] = []; let parser = "";
    if (extension === "pdf") { const extracted = await extractPdf(bytes); text = extracted.text; pages = extracted.pages; transactions = parsePdfBlocks(text); parser = "PDF adaptativo"; }
    else { text = new TextDecoder("utf-8").decode(bytes); if (/OFX|STMTTRN/i.test(text) || extension === "ofx" || extension === "qfx") { transactions = parseOfx(text); parser = "OFX/QFX"; } else { transactions = parseCsv(text); parser = "CSV/TXT adaptativo"; } }
    if (!transactions.length) return NextResponse.json({ error: "Não foi possível reconhecer movimentações neste formato. Verifique se o PDF possui texto selecionável ou exporte o extrato em OFX/CSV." }, { status: 422 });
    const bank = detectBank(text, file.name); const companyDocument = text.match(/(?:CNPJ|CPF)[^\d]{0,12}(\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i)?.[1] ?? "";
    const account = text.match(/(?:conta|account)[^\d]{0,10}([\d.-]{4,})/i)?.[1] ?? ""; const accountLabel = [bank, account ? `Conta ${account}` : ""].filter(Boolean).join(" · ");
    const externalIds = new Set<string>();
    const unique = transactions.filter((transaction) => { if (!transaction.externalId) return true; if (externalIds.has(transaction.externalId)) return false; externalIds.add(transaction.externalId); return true; });
    const classified = unique.map((transaction, index) => { const result = classify(transaction, accountLabel, companyDocument, learnedRules); return { ...result, id: transaction.externalId || `${result.id}|${index + 1}` }; });
    return NextResponse.json({ fileName: file.name, bank, account, accountLabel, companyDocument, parser, pages, transactions: classified, totals: { credits: classified.filter((item) => item.movement === "credit").reduce((sum, item) => sum + item.amount, 0), debits: classified.filter((item) => item.movement === "debit").reduce((sum, item) => sum + item.amount, 0) }, confidence: { high: classified.filter((item) => item.confidence === "Alta").length, medium: classified.filter((item) => item.confidence === "Média").length, low: classified.filter((item) => item.confidence === "Baixa").length } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível interpretar o extrato." }, { status: 500 });
  }
}
