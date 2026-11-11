import { NextResponse } from "next/server";
import { getAccessToken, SHEET_NAMES } from "../../lib/google-sheets";

const column = (size: number) => {
  let result = "";
  for (let value = size; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
};

export async function POST(request: Request) {
  try {
    const { action, sheet, rowIndex, values } = await request.json() as { action: "create" | "update" | "delete"; sheet: string; rowIndex?: number; values?: string[] };
    if (!SHEET_NAMES.includes(sheet as typeof SHEET_NAMES[number]) || sheet === "Configurações") return NextResponse.json({ error: "Módulo inválido." }, { status: 400 });
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    if (!spreadsheetId) throw new Error("A fonte de dados não está configurada.");
    const token = await getAccessToken();
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    let generatedCode: string | undefined;
    if (action === "create") {
      const codeRange = encodeURIComponent(`'${sheet}'!A2:A10000`);
      const codeResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${codeRange}`, { headers });
      const codeData = await codeResponse.json() as { values?: string[][] };
      const highestCode = (codeData.values ?? []).reduce((highest, row) => { const digits = String(row[0] ?? "").match(/\d+/g)?.join(""); return Math.max(highest, digits ? Number(digits) : 0); }, 0);
      generatedCode = String(highestCode + 1);
      const submittedValues = [...(values ?? [])];
      submittedValues[0] = generatedCode;
      const range = encodeURIComponent(`'${sheet}'!A:Z`);
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { method: "POST", headers, body: JSON.stringify({ values: [submittedValues] }) });
      if (!response.ok) throw new Error("Não foi possível salvar o cadastro.");
    } else if (action === "update" && rowIndex && values) {
      const range = encodeURIComponent(`'${sheet}'!A${rowIndex}:${column(values.length)}${rowIndex}`);
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`, { method: "PUT", headers, body: JSON.stringify({ values: [values] }) });
      if (!response.ok) throw new Error("Não foi possível atualizar o cadastro.");
    } else if (action === "delete" && rowIndex) {
      const metadata = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, { headers });
      const info = await metadata.json() as { sheets?: Array<{ properties: { sheetId: number; title: string } }> };
      const sheetId = info.sheets?.find((item) => item.properties.title === sheet)?.properties.sheetId;
      if (sheetId === undefined) throw new Error("A aba não foi encontrada.");
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, { method: "POST", headers, body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex - 1, endIndex: rowIndex } } }] }) });
      if (!response.ok) throw new Error("Não foi possível excluir o cadastro.");
    } else return NextResponse.json({ error: "Operação inválida." }, { status: 400 });
    return NextResponse.json({ ok: true, code: generatedCode });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao concluir a operação." }, { status: 500 });
  }
}
