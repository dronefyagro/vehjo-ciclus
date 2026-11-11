import { NextResponse } from "next/server";
import { getAccessToken, SHEET_NAMES } from "../../lib/google-sheets";

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
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`, { method: "POST", headers, body: "{}" });
  const write = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`, { method: "PUT", headers, body: JSON.stringify({ values: cashFlow }) });
  if (!write.ok) throw new Error("Não foi possível atualizar o fluxo de caixa.");
  return cashFlow.map((row) => row.map((value) => String(value ?? "")));
};

export async function POST(request: Request) {
  try {
    const { action, sheet, rowIndex, values } = await request.json() as { action: "create" | "update" | "delete"; sheet: string; rowIndex?: number; values?: string[] };
    if (!SHEET_NAMES.includes(sheet as typeof SHEET_NAMES[number])) return NextResponse.json({ error: "Módulo inválido." }, { status: 400 });
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    if (!spreadsheetId) throw new Error("A fonte de dados não está configurada.");
    const token = await getAccessToken();
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    let generatedCode: string | undefined;
    if (action === "create") {
      const submittedValues = [...(values ?? [])];
      let existingCodeCount = 0;
      if (sheet !== "Configurações") {
        const codeRange = encodeURIComponent(`'${sheet}'!A2:A10000`);
        const codeResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${codeRange}`, { headers });
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
      if (sheet === "Contas a Pagar") submittedValues[14] = String(Math.abs(Number(String(submittedValues[14] ?? "0").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0));
      completeFinancialPeriod(sheet, submittedValues);
      const range = encodeURIComponent(`'${sheet}'!A:Z`);
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { method: "POST", headers, body: JSON.stringify({ values: [submittedValues] }) });
      if (!response.ok) throw new Error("Não foi possível salvar o cadastro.");
    } else if (action === "update" && rowIndex && values) {
      const submittedValues = [...values];
      if (sheet === "Contratos") {
        submittedValues[7] = String(submittedValues[7] ?? "").replace(/^R\$\s*/, "");
        submittedValues[8] = String(submittedValues[8] ?? "").replace(/^R\$\s*/, "");
        submittedValues[9] = `=IF(A${rowIndex}="";"";H${rowIndex}*I${rowIndex})`;
        submittedValues[10] = `=IF(A${rowIndex}="";"";G${rowIndex}-TODAY())`;
      }
      if (sheet === "Contas a Pagar") submittedValues[14] = String(Math.abs(Number(String(submittedValues[14] ?? "0").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0));
      completeFinancialPeriod(sheet, submittedValues);
      const range = encodeURIComponent(`'${sheet}'!A${rowIndex}:${column(submittedValues.length)}${rowIndex}`);
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`, { method: "PUT", headers, body: JSON.stringify({ values: [submittedValues] }) });
      if (!response.ok) throw new Error("Não foi possível atualizar o cadastro.");
    } else if (action === "delete" && rowIndex) {
      const metadata = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, { headers });
      const info = await metadata.json() as { sheets?: Array<{ properties: { sheetId: number; title: string } }> };
      const sheetId = info.sheets?.find((item) => item.properties.title === sheet)?.properties.sheetId;
      if (sheetId === undefined) throw new Error("A aba não foi encontrada.");
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, { method: "POST", headers, body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex - 1, endIndex: rowIndex } } }] }) });
      if (!response.ok) throw new Error("Não foi possível excluir o cadastro.");
    } else return NextResponse.json({ error: "Operação inválida." }, { status: 400 });
    const cashFlow = sheet === "Contas a Receber" || sheet === "Contas a Pagar" ? await syncCashFlow(spreadsheetId, headers) : undefined;
    return NextResponse.json({ ok: true, code: generatedCode, cashFlow });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao concluir a operação." }, { status: 500 });
  }
}
