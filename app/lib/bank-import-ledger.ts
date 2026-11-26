export const BANK_IMPORT_LEDGER_SHEET = "Importações Bancárias";

export const BANK_IMPORT_LEDGER_HEADERS = [
  "Chave da Transação",
  "Banco",
  "Conta",
  "ID Bancário",
  "Data",
  "Movimento",
  "Valor",
  "Destino do Lançamento",
  "Arquivo de Origem",
  "Descrição",
  "Importado em",
] as const;

export type BankImportEntry = {
  transactionId: string;
  bank: string;
  account: string;
  date: string;
  movement: "credit" | "debit";
  value: number;
  target: string;
  fileName: string;
  description: string;
};

export async function ensureBankImportLedgerSheet(spreadsheetId: string, headers: Record<string, string>) {
  const metadata = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, { headers });
  if (!metadata.ok) throw new Error("Não foi possível conferir o histórico das importações bancárias.");
  const info = await metadata.json() as { sheets?: Array<{ properties: { title: string } }> };
  if (info.sheets?.some((item) => item.properties.title === BANK_IMPORT_LEDGER_SHEET)) return;

  const create = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: BANK_IMPORT_LEDGER_SHEET, hidden: true, gridProperties: { rowCount: 10000, columnCount: BANK_IMPORT_LEDGER_HEADERS.length, frozenRowCount: 1 } } } }] }),
  });
  if (!create.ok) throw new Error("Não foi possível criar o histórico protegido das importações bancárias.");
  const range = encodeURIComponent(`'${BANK_IMPORT_LEDGER_SHEET}'!A1:K1`);
  const write = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ values: [[...BANK_IMPORT_LEDGER_HEADERS]] }),
  });
  if (!write.ok) throw new Error("O histórico bancário foi criado, mas seus campos não puderam ser preparados.");
}
