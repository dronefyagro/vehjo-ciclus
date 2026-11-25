import { createSign } from "node:crypto";
import { INVOICE_ANALYSIS_HEADERS, INVOICE_ANALYSIS_SHEET } from "./invoice-analysis";
import {
  FINANCIAL_CLASSIFICATION_HEADERS,
  FINANCIAL_CLASSIFICATION_SEED,
  FINANCIAL_CLASSIFICATIONS_SHEET,
} from "./financial-classifications";

export type SheetRow = string[];

export type VehjoData = {
  connected: boolean;
  updatedAt: string;
  error?: string;
  sheets: Record<string, SheetRow[]>;
};

export const SHEET_NAMES = [
  "Clientes",
  "Fazendas",
  "Contratos",
  "Contas a Receber",
  "Contas a Pagar",
  "Contas Bancárias",
  FINANCIAL_CLASSIFICATIONS_SHEET,
  "Fornecedores",
  "Plano de Contas",
  "Orçamento",
  "Transferências",
  "Fluxo de Caixa",
  "Faturamento e DER",
  "Notas Fiscais",
  "Estoque",
  "Recursos Humanos",
  "Patrimônio",
  "Configurações",
  INVOICE_ANALYSIS_SHEET,
] as const;

const b64url = (value: string | Buffer) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

export async function getAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) {
    throw new Error("A conexão de dados ainda não foi configurada.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${b64url(signer.sign(privateKey))}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Não foi possível autenticar a conexão de dados.");
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

export async function ensureFinancialClassificationsSheet(
  spreadsheetId: string,
  headers: Record<string, string>,
) {
  const metadata = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers, cache: "no-store" },
  );
  if (!metadata.ok) throw new Error("Não foi possível conferir as classificações financeiras.");
  const info = (await metadata.json()) as {
    sheets?: Array<{ properties: { title: string } }>;
  };
  if (info.sheets?.some((item) => item.properties.title === FINANCIAL_CLASSIFICATIONS_SHEET)) return;

  const create = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        requests: [{
          addSheet: {
            properties: {
              title: FINANCIAL_CLASSIFICATIONS_SHEET,
              gridProperties: {
                rowCount: Math.max(1000, FINANCIAL_CLASSIFICATION_SEED.length + 100),
                columnCount: FINANCIAL_CLASSIFICATION_HEADERS.length,
                frozenRowCount: 1,
              },
            },
          },
        }],
      }),
    },
  );
  if (!create.ok) throw new Error("Não foi possível criar a área de classificações financeiras.");

  const lastColumn = String.fromCharCode(64 + FINANCIAL_CLASSIFICATION_HEADERS.length);
  const range = encodeURIComponent(`'${FINANCIAL_CLASSIFICATIONS_SHEET}'!A1:${lastColumn}${FINANCIAL_CLASSIFICATION_SEED.length + 1}`);
  const write = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        values: [[...FINANCIAL_CLASSIFICATION_HEADERS], ...FINANCIAL_CLASSIFICATION_SEED],
      }),
    },
  );
  if (!write.ok) throw new Error("A área foi criada, mas a base inicial não pôde ser registrada.");
}

export async function getVehjoData(): Promise<VehjoData> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!spreadsheetId) {
    return {
      connected: false,
      sheets: {},
      updatedAt: new Date().toISOString(),
      error: "A fonte de dados ainda não foi configurada.",
    };
  }

  try {
    const token = await getAccessToken();
    await ensureFinancialClassificationsSheet(spreadsheetId, {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    });
    const params = new URLSearchParams();
    const requiredSheets = SHEET_NAMES.filter((name) => name !== INVOICE_ANALYSIS_SHEET);
    for (const name of requiredSheets) params.append("ranges", `'${name}'!A1:Z5000`);
    params.set("majorDimension", "ROWS");
    params.set("valueRenderOption", "FORMATTED_VALUE");
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params}`,
      { headers: { authorization: `Bearer ${token}` }, next: { revalidate: 60 } },
    );
    if (!response.ok) throw new Error("A planilha não autorizou a leitura pela plataforma.");
    const body = (await response.json()) as {
      valueRanges?: Array<{ range: string; values?: SheetRow[] }>;
    };
    const sheets: Record<string, SheetRow[]> = {};
    requiredSheets.forEach((name, index) => {
      sheets[name] = body.valueRanges?.[index]?.values ?? [];
    });
    const analysisRange = encodeURIComponent(`'${INVOICE_ANALYSIS_SHEET}'!A1:M5000`);
    const analysisResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${analysisRange}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
      { headers: { authorization: `Bearer ${token}` }, next: { revalidate: 60 } },
    );
    if (analysisResponse.ok) {
      const analysis = await analysisResponse.json() as { values?: SheetRow[] };
      sheets[INVOICE_ANALYSIS_SHEET] = analysis.values?.length ? analysis.values : [[...INVOICE_ANALYSIS_HEADERS]];
    } else sheets[INVOICE_ANALYSIS_SHEET] = [[...INVOICE_ANALYSIS_HEADERS]];
    return { connected: true, sheets, updatedAt: new Date().toISOString() };
  } catch (error) {
    return {
      connected: false,
      sheets: {},
      updatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Falha ao ler a planilha.",
    };
  }
}
