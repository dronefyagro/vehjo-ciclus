import { NextResponse } from "next/server";

export const runtime = "nodejs";

type BankTransaction = {
  id: string;
  bankId: string;
  date: string;
  description: string;
  value: number;
  direction: "credit" | "debit";
  selected: boolean;
};

const normalize = (value = "") => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");

const isoDate = (value = "") => {
  const clean = value.trim();
  const compact = clean.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const iso = clean.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (!br) return "";
  const year = br[3].length === 2 ? `20${br[3]}` : br[3];
  return `${year}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
};

const money = (source = "") => {
  const negative = /^\s*-/.test(source) || /^\s*\(.*\)\s*$/.test(source);
  let value = source.replace(/[^\d,.-]/g, "").replace(/^-/, "");
  const comma = value.lastIndexOf(","), dot = value.lastIndexOf(".");
  if (comma > dot) value = value.replace(/\./g, "").replace(",", ".");
  else if (dot > comma && comma >= 0) value = value.replace(/,/g, "");
  else if (comma >= 0) value = value.replace(",", ".");
  const parsed = Number(value);
  return Number.isFinite(parsed) ? (negative ? -Math.abs(parsed) : parsed) : 0;
};

const decodeEntities = (value: string) => value.replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim();

const parseOfx = (text: string, fileName: string) => {
  const tag = (source: string, name: string) => source.match(new RegExp(`<${name}>\\s*([^<\\r\\n]+)`, "i"))?.[1]?.trim() ?? "";
  const bank = tag(text, "BANKID") || "Banco";
  const account = tag(text, "ACCTID");
  const accountLabel = account ? `${bank} · conta final ${account.replace(/\D/g, "").slice(-4) || account.slice(-4)}` : bank;
  const transactions: BankTransaction[] = [];
  const blocks = text.match(/<STMTTRN>[\s\S]*?(?:<\/STMTTRN>|(?=<STMTTRN>|<LEDGERBAL>|<AVAILBAL>|<\/BANKTRANLIST>))/gi) ?? [];
  for (const block of blocks) {
    const rawValue = money(tag(block, "TRNAMT"));
    const date = isoDate(tag(block, "DTPOSTED"));
    if (!date || !rawValue) continue;
    const bankId = tag(block, "FITID") || `${date}-${transactions.length + 1}`;
    const description = decodeEntities([tag(block, "NAME"), tag(block, "MEMO")].filter(Boolean).join(" · ")) || "Movimentação bancária";
    transactions.push({ id: `${bankId}|${date}|${rawValue}`, bankId, date, description, value: Math.abs(rawValue), direction: rawValue > 0 ? "credit" : "debit", selected: true });
  }
  return { fileName, accountLabel, format: "OFX", transactions };
};

const csvRows = (text: string) => {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiters = [";", ",", "\t"];
  const delimiter = delimiters.sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { row.push(field.trim()); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim()); field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
};

const parseCsv = (text: string, fileName: string) => {
  const rows = csvRows(text);
  const headers = (rows[0] ?? []).map(normalize);
  const find = (patterns: RegExp[]) => headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
  const dateIndex = find([/^data/, /^date/, /dtposted/]);
  const descriptionIndex = find([/descricao/, /historico/, /^memo$/, /^name$/, /estabelecimento/, /lancamento/]);
  const valueIndex = find([/^valor$/, /^amount$/, /trnamt/, /valor.*lancamento/]);
  const creditIndex = find([/credito/, /entrada/, /recebimento/]);
  const debitIndex = find([/debito/, /saida/, /pagamento/]);
  const typeIndex = find([/^tipo$/, /natureza/, /credito.*debito/]);
  const idIndex = find([/^id$/, /fitid/, /documento/, /numero/]);
  const accountIndex = find([/conta corrente/, /^conta$/, /account/]);
  if (dateIndex < 0 || (valueIndex < 0 && creditIndex < 0 && debitIndex < 0)) throw new Error("O CSV precisa conter uma coluna de data e uma coluna de valor, crédito ou débito.");
  const transactions: BankTransaction[] = [];
  for (const source of rows.slice(1)) {
    const date = isoDate(source[dateIndex] ?? "");
    let rawValue = valueIndex >= 0 ? money(source[valueIndex]) : 0;
    if (!rawValue && creditIndex >= 0) rawValue = Math.abs(money(source[creditIndex]));
    if (!rawValue && debitIndex >= 0) rawValue = -Math.abs(money(source[debitIndex]));
    const type = normalize(source[typeIndex] ?? "");
    if (rawValue > 0 && /debito|saida|pagamento|d$/.test(type)) rawValue = -rawValue;
    if (rawValue < 0 && /credito|entrada|recebimento|c$/.test(type)) rawValue = Math.abs(rawValue);
    if (!date || !rawValue) continue;
    const description = (source[descriptionIndex] ?? "").trim() || "Movimentação bancária";
    const bankId = (source[idIndex] ?? "").trim() || `${date}-${transactions.length + 1}`;
    transactions.push({ id: `${bankId}|${date}|${rawValue}`, bankId, date, description, value: Math.abs(rawValue), direction: rawValue > 0 ? "credit" : "debit", selected: true });
  }
  const account = rows.slice(1).map((row) => row[accountIndex]).find(Boolean);
  return { fileName, accountLabel: account || fileName.replace(/\.[^.]+$/, ""), format: "CSV", transactions };
};

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione um extrato bancário." }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "O extrato deve ter no máximo 5 MB." }, { status: 413 });
    const extension = file.name.split(".").pop()?.toLocaleLowerCase("pt-BR");
    if (!extension || !["ofx", "csv", "txt"].includes(extension)) return NextResponse.json({ error: "Use um extrato nos formatos OFX ou CSV." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text = new TextDecoder("utf-8").decode(bytes);
    if (text.includes("�")) text = new TextDecoder("windows-1252").decode(bytes);
    const analysis = extension === "ofx" || /<OFX[>\s]/i.test(text) ? parseOfx(text, file.name) : parseCsv(text.replace(/^\uFEFF/, ""), file.name);
    if (!analysis.transactions.length) return NextResponse.json({ error: "Nenhuma movimentação financeira foi reconhecida neste extrato." }, { status: 422 });
    const credits = analysis.transactions.filter((item) => item.direction === "credit").reduce((sum, item) => sum + item.value, 0);
    const debits = analysis.transactions.filter((item) => item.direction === "debit").reduce((sum, item) => sum + item.value, 0);
    return NextResponse.json({ ...analysis, credits: Number(credits.toFixed(2)), debits: Number(debits.toFixed(2)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível interpretar o extrato." }, { status: 500 });
  }
}
