import { createSign } from "node:crypto";

export type SheetRow = string[];

export type VehjoData = {
  connected: boolean;
  updatedAt: string;
  error?: string;
  sheets: Record<string, SheetRow[]>;
};

const SHEET_NAMES = [
  "Clientes",
  "Fazendas",
  "Contratos",
  "Contas a Receber",
  "Contas a Pagar",
  "Contas Bancárias",
  "Faturamento e DER",
  "Notas Fiscais",
  "Estoque",
  "Recursos Humanos",
  "Patrimônio",
  "Configurações",
] as const;

const b64url = (value: string | Buffer) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

async function getAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) {
    throw new Error("Credenciais do Google Sheets ainda não configuradas na Vercel.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
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
  if (!response.ok) throw new Error("Não foi possível autenticar no Google Sheets.");
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

export async function getVehjoData(): Promise<VehjoData> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!spreadsheetId) {
    return {
      connected: false,
      sheets: {},
      updatedAt: new Date().toISOString(),
      error: "Identificador do Google Sheets ainda não configurado na Vercel.",
    };
  }

  try {
    const token = await getAccessToken();
    const params = new URLSearchParams();
    for (const name of SHEET_NAMES) params.append("ranges", `'${name}'!A1:Z500`);
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
    SHEET_NAMES.forEach((name, index) => {
      sheets[name] = body.valueRanges?.[index]?.values ?? [];
    });
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

