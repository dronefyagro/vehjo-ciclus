import { NextResponse } from "next/server";

const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_CELL_LENGTH = 2_000;
const MAX_COLUMNS = 26;

export function rejectUnsafeMutation(request: Request, maximumBytes = MAX_JSON_BYTES): NextResponse | null {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    return NextResponse.json({ error: "Origem da solicitação não autorizada." }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origem da solicitação não autorizada." }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maximumBytes) {
    return NextResponse.json({ error: "A solicitação excede o limite permitido." }, { status: 413 });
  }

  return null;
}

export function normalizeCells(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_COLUMNS) return null;
  const result: string[] = [];
  for (const value of input) {
    if (value !== null && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return null;
    const cell = String(value ?? "");
    if (cell.length > MAX_CELL_LENGTH) return null;
    result.push(cell);
  }
  return result;
}

export function normalizeRows(input: unknown, maximum = 500): string[][] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > maximum) return null;
  const rows = input.map(normalizeCells);
  return rows.every((row): row is string[] => row !== null) ? rows : null;
}

export function validSheetRowIndex(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 2 && Number(value) <= 100_000;
}
