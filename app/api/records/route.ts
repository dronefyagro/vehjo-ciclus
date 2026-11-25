import { NextResponse } from "next/server";
import { ensureFinancialClassificationsSheet, getAccessToken, SHEET_NAMES } from "../../lib/google-sheets";
import { FINANCIAL_CLASSIFICATIONS_SHEET } from "../../lib/financial-classifications";
import { INVOICE_ANALYSIS_HEADERS, INVOICE_ANALYSIS_SHEET } from "../../lib/invoice-analysis";
import { normalizeCells, normalizeRows, rejectUnsafeMutation, validSheetRowIndex } from "../../lib/api-guard";
import { getRequestSession } from "../../lib/auth";
import { canAccessSheet } from "../../lib/access-control";

const ACTIONS = ["create", "update", "delete", "bulk-create", "learn-bank-rules"] as const;
type RecordAction = typeof ACTIONS[number];

const column = (size: number) => {
  let result = "";
  for (let value = size; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
};

const completeFinancialPeriod = (sheet: string, values: string[]) => {
  if (sheet !== "Contas a Receber" && sheet !== "Contas a Pagar") return;
  const value = String(values[1] ?? "");
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/), br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!iso && !br) return;
  const year = iso?.[1] ?? br?.[3] ?? "", month = Number(iso?.[2] ?? br?.[2]);
  values[3] = year;
  values[4] = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"][month - 1] ?? "";
  values[16] = year;
};

const financialNumber = (input: unknown) => {
  const raw = String(input ?? "0").replace(/[^\d,.-]/g, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  return Math.abs(Number(normalized) || 0);
};

const financialDate = (input: unknown) => {
  const raw = String(input ?? "").trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  if (/^\d{5}$/.test(raw)) return new Date(Date.UTC(1899, 11, 30) + Number(raw) * 86400000).toISOString().slice(0, 10);
  return raw;
};

const normalizedFinancialKey = (row: string[]) => {
  const date = financialDate(row[1]);
  const value = financialNumber(row[14]).toFixed(2);
  const normalize = (item: unknown) => String(item ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
  const destination = normalize(row[13]);
  const counterparty = destination && destination !== "dronefy" ? destination : normalize(row[12]) || normalize(row[11]) || normalize(row[10]);
  return `${date}|${value}|${counterparty}`;
};

const ensureInvoiceAnalysisSheet = async (spreadsheetId: string, headers: Record<string, string>) => {
  const metadata = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, { headers });
  if (!metadata.ok) throw new Error("Não foi possível conferir a área de análise de faturas.");
  const info = await metadata.json() as { sheets?: Array<{ properties: { title: string } }> };
  if (info.sheets?.some((item) => item.properties.title === INVOICE_ANALYSIS_SHEET)) return;
  const create = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: INVOICE_ANALYSIS_SHEET, gridProperties: { rowCount: 5000, columnCount: INVOICE_ANALYSIS_HEADERS.length } } } }] }),
  });
  if (!create.ok) throw new Error("Não foi possível criar a área de análise de faturas.");
  const range = encodeURIComponent(`'${INVOICE_ANALYSIS_SHEET}'!A1:M1`);
  const write = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ values: [[...INVOICE_ANALYSIS_HEADERS]] }),
  });
  if (!write.ok) throw new Error("A área foi criada, mas os campos analíticos não puderam ser preparados.");
};

const syncCashFlow = async (spreadsheetId: string, headers: Record<string, string>) => {
  const params = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE" });
  params.append("ranges", "'Contas a Receber'!A1:Q10000");
  params.append("ranges", "'Contas a Pagar'!A1:Q10000");
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params}`, { headers });
  if (!response.ok) throw new Error("Não foi possível atualizar o fluxo de caixa.");
  const result = await response.json() as { valueRanges?: Array<{ values?: Array<Array<string | number>> }> };
  const receive = result.valueRanges?.[0]?.values ?? [];
  const payable = result.valueRanges?.[1]?.values ?? [];
  const header = (receive[0] ?? payable[0] ?? []).map(String);
  const records = [...receive.slice(1), ...payable.slice(1)].filter((row) => row.some((value) => value !== "" && value !== null));
  records.sort((a, b) => { const left = typeof a[1] === "number" ? a[1] : Date.parse(String(a[1] ?? "")) || 0; const right = typeof b[1] === "number" ? b[1] : Date.parse(String(b[1] ?? "")) || 0; return left - right || String(a[2] ?? "").localeCompare(String(b[2] ?? ""), "pt-BR"); });
  records.forEach((row, index) => { row[0] = index + 1; });
  const cashFlow = [header, ...records];
  const range = encodeURIComponent("'Fluxo de Caixa'!A:Q");
  const cleared = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`, { method: "POST", headers, body: "{}" });
  if (!cleared.ok) throw new Error("Não foi possível preparar o fluxo de caixa para atualização.");
  const write = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`, { method: "PUT", headers, body: JSON.stringify({ values: cashFlow }) });
  if (!write.ok) throw new Error("Não foi possível atualizar o fluxo de caixa.");
  return cashFlow.map((row) => row.map((value) => String(value ?? "")));
};

export async function POST(request: Request) {
  const rejected = rejectUnsafeMutation(request);
  if (rejected) return rejected;
  try {
    const payload = await request.json() as { action?: unknown; sheet?: unknown; rowIndex?: unknown; values?: unknown; rows?: unknown; rules?: unknown };
    const action = typeof payload.action === "string" && ACTIONS.includes(payload.action as RecordAction) ? payload.action as RecordAction : null;
    const sheet = typeof payload.sheet === "string" ? payload.sheet : "";
    const rowIndex = payload.rowIndex;
    const values = normalizeCells(payload.values);
    const rows = normalizeRows(payload.rows);
    const rules = Array.isArray(payload.rules) ? payload.rules : [];
    if (!action) return NextResponse.json({ error: "Operação inválida." }, { status: 400 });
    if (!SHEET_NAMES.includes(sheet as typeof SHEET_NAMES[number])) return NextResponse.json({ error: "Módulo inválido." }, { status: 400 });
    const session = getRequestSession(request);
    if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    const canLearnInternalRule = action === "learn-bank-rules" && session.role === "supervisor" && sheet === "Configurações";
    if (!canAccessSheet(session.role, sheet) && !canLearnInternalRule) return NextResponse.json({ error: "Seu perfil não possui permissão para alterar este módulo." }, { status: 403 });
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    if (!spreadsheetId) throw new Error("A fonte de dados não está configurada.");
    const token = await getAccessToken();
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    if (sheet === FINANCIAL_CLASSIFICATIONS_SHEET) await ensureFinancialClassificationsSheet(spreadsheetId, headers);
    if (sheet === INVOICE_ANALYSIS_SHEET) await ensureInvoiceAnalysisSheet(spreadsheetId, headers);

    if (action === "learn-bank-rules") {
      const validRules = rules.filter((value): value is { key: string; target: string; category: string; costRelation?: string; costBehavior?: string; origin?: string; destination?: string; bank?: string } => {
        if (!value || typeof value !== "object") return false;
        const rule = value as Record<string, unknown>;
        return [rule.key, rule.target, rule.category].every((item) => typeof item === "string" && item.length > 0 && item.length <= 500);
      }).slice(0, 500);
      if (!validRules.length) return NextResponse.json({ ok: true, learned: 0 });
      const learnedAt = new Date().toISOString();
      const learnedRows = validRules.map((rule) => ["Regra Bancária", rule.key, rule.target, rule.category, rule.costRelation ?? "", rule.costBehavior ?? "", rule.origin ?? "", rule.destination ?? "", rule.bank ?? "", learnedAt]);
      const range = encodeURIComponent("'Configurações'!A:J");
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", headers, body: JSON.stringify({ values: learnedRows }) });
      if (!response.ok) throw new Error("Os lançamentos foram conferidos, mas não foi possível salvar as novas regras de classificação.");
      return NextResponse.json({ ok: true, learned: learnedRows.length });
    }

    let generatedCode: string | undefined, imported: number | undefined, skipped = 0, importedRows: string[][] | undefined;
    if (action === "bulk-create") {
      if (!rows) return NextResponse.json({ error: "A importação deve conter entre 1 e 500 lançamentos válidos." }, { status: 400 });
      const financialSheet = sheet === "Contas a Receber" || sheet === "Contas a Pagar";
      const invoiceSheet = sheet === "Notas Fiscais";
      const codeRange = encodeURIComponent(`'${sheet}'!A2:${financialSheet ? "Q" : invoiceSheet ? "Z" : "A"}`);
      const codeResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${codeRange}`, { headers });
      if (!codeResponse.ok) throw new Error("Não foi possível conferir os códigos e duplicidades existentes.");
      const codeData = await codeResponse.json() as { values?: string[][] };
      const highestCode = (codeData.values ?? []).reduce((highest, row) => { const digits = String(row[0] ?? "").match(/\d+/g)?.join(""); return Math.max(highest, digits ? Number(digits) : 0); }, 0);
      const existingKeys = financialSheet ? new Set((codeData.values ?? []).map((row) => normalizedFinancialKey(row.map(String)))) : new Set<string>();
      const invoiceKey = (row: string[]) => {
        const raw = String(row[7] || row[1] || "").trim().toLocaleLowerCase("pt-BR");
        const digits = raw.replace(/\D/g, "");
        return digits.length === 44 || digits.length === 50 ? digits : raw.normalize("NFD").replace(/[\u0300-\u036f\s.-]/g, "");
      };
      const existingInvoiceKeys = invoiceSheet ? new Set((codeData.values ?? []).map((row) => invoiceKey(row.map(String))).filter(Boolean)) : new Set<string>();
      const submittedRows = rows.map((source, index) => {
        const submitted = [...source];
        submitted[0] = String(highestCode + index + 1);
        if (sheet === "Contas a Pagar") submitted[14] = String(financialNumber(submitted[14]));
        completeFinancialPeriod(sheet, submitted);
        return submitted;
      }).filter((row) => {
        if (financialSheet) {
          const key = normalizedFinancialKey(row);
          if (existingKeys.has(key)) { skipped += 1; return false; }
          existingKeys.add(key);
        }
        if (invoiceSheet) {
          const key = invoiceKey(row);
          if (key && existingInvoiceKeys.has(key)) { skipped += 1; return false; }
          if (key) existingInvoiceKeys.add(key);
        }
        return true;
      });
      imported = submittedRows.length;
      importedRows = submittedRows;
      if (submittedRows.length) {
        const range = encodeURIComponent(`'${sheet}'!A:Z`);
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", headers, body: JSON.stringify({ values: submittedRows }) });
        if (!response.ok) throw new Error("Não foi possível importar os lançamentos.");
      }
    } else if (action === "create") {
      if (!values) return NextResponse.json({ error: "Dados do cadastro inválidos." }, { status: 400 });
      const submittedValues = [...values];
      let existingCodeCount = 0;
      if (sheet !== "Configurações") {
        const codeRange = encodeURIComponent(`'${sheet}'!A2:A`);
        const codeResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${codeRange}`, { headers });
        if (!codeResponse.ok) throw new Error("Não foi possível gerar o próximo código com segurança.");
        const codeData = await codeResponse.json() as { values?: string[][] };
        existingCodeCount = codeData.values?.length ?? 0;
        const highestCode = (codeData.values ?? []).reduce((highest, row) => { const digits = String(row[0] ?? "").match(/\d+/g)?.join(""); return Math.max(highest, digits ? Number(digits) : 0); }, 0);
        generatedCode = String(highestCode + 1);
        submittedValues[0] = generatedCode;
      }
      if (sheet === "Contratos") {
        const targetRow = existingCodeCount + 2;
        submittedValues[7] = String(submittedValues[7] ?? "").replace(/^R\$\s*/, "");
        submittedValues[8] = String(submittedValues[8] ?? "").replace(/^R\$\s*/, "");
        submittedValues[9] = `=IF(A${targetRow}="";"";H${targetRow}*I${targetRow})`;
        submittedValues[10] = `=IF(A${targetRow}="";"";G${targetRow}-TODAY())`;
      }
      if (sheet === "Contas a Pagar") submittedValues[14] = String(financialNumber(submittedValues[14]));
      completeFinancialPeriod(sheet, submittedValues);
      const range = encodeURIComponent(`'${sheet}'!A:Z`);
      const inputOption = sheet === "Contratos" ? "USER_ENTERED" : "RAW";
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=${inputOption}&insertDataOption=INSERT_ROWS`, { method: "POST", headers, body: JSON.stringify({ values: [submittedValues] }) });
      if (!response.ok) throw new Error("Não foi possível salvar o cadastro.");
    } else if (action === "update" && validSheetRowIndex(rowIndex) && values) {
      const submittedValues = [...values];
      if (sheet === "Contratos") {
        submittedValues[7] = String(submittedValues[7] ?? "").replace(/^R\$\s*/, "");
        submittedValues[8] = String(submittedValues[8] ?? "").replace(/^R\$\s*/, "");
        submittedValues[9] = `=IF(A${rowIndex}="";"";H${rowIndex}*I${rowIndex})`;
        submittedValues[10] = `=IF(A${rowIndex}="";"";G${rowIndex}-TODAY())`;
      }
      if (sheet === "Contas a Pagar") submittedValues[14] = String(financialNumber(submittedValues[14]));
      completeFinancialPeriod(sheet, submittedValues);
      const range = encodeURIComponent(`'${sheet}'!A${rowIndex}:${column(submittedValues.length)}${rowIndex}`);
      const inputOption = sheet === "Contratos" ? "USER_ENTERED" : "RAW";
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=${inputOption}`, { method: "PUT", headers, body: JSON.stringify({ values: [submittedValues] }) });
      if (!response.ok) throw new Error("Não foi possível atualizar o cadastro.");
    } else if (action === "delete" && validSheetRowIndex(rowIndex)) {
      const metadata = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, { headers });
      if (!metadata.ok) throw new Error("Não foi possível conferir a aba antes da exclusão.");
      const info = await metadata.json() as { sheets?: Array<{ properties: { sheetId: number; title: string } }> };
      const sheetId = info.sheets?.find((item) => item.properties.title === sheet)?.properties.sheetId;
      if (sheetId === undefined) throw new Error("A aba não foi encontrada.");
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, { method: "POST", headers, body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex - 1, endIndex: rowIndex } } }] }) });
      if (!response.ok) throw new Error("Não foi possível excluir o cadastro.");
    } else return NextResponse.json({ error: "Operação inválida." }, { status: 400 });
    const cashFlow = sheet === "Contas a Receber" || sheet === "Contas a Pagar" ? await syncCashFlow(spreadsheetId, headers) : undefined;
    return NextResponse.json({ ok: true, code: generatedCode, imported, skipped, duplicates: skipped, rows: importedRows, cashFlow });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao concluir a operação." }, { status: 500 });
  }
}
