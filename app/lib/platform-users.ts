import "server-only";
import { promisify } from "node:util";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { getAccessToken } from "./google-sheets";
import { isUserRole, sha256Hex } from "./auth";
import { USER_RECORD_KIND, type SessionUser, type UserRole } from "./access-control";

const scrypt = promisify(scryptCallback);
const DEFAULT_USER = "dronefyagro";
const DEFAULT_PASSWORD_HASH = "8a47133053dbf9cc9d646ce48c2b7ca922ed9e72bef5304bd43c1517a375fdd9";

export type StoredPlatformUser = SessionUser & {
  salt: string;
  passwordHash: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  source: "bootstrap" | "sheets";
};

async function configurationRows() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!spreadsheetId) return [];
  const token = await getAccessToken();
  const range = encodeURIComponent("'Configurações'!A2:J5000");
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível consultar os usuários da plataforma.");
  const body = await response.json() as { values?: string[][] };
  return body.values ?? [];
}

export async function getPlatformUsers(): Promise<StoredPlatformUser[]> {
  const latest = new Map<string, StoredPlatformUser>();
  const storedRows = await configurationRows().catch(() => []);
  for (const row of storedRows) {
    if (row[0] !== USER_RECORD_KIND || !row[1] || !isUserRole(row[3])) continue;
    latest.set(row[1].toLocaleLowerCase("pt-BR"), {
      username: row[1], name: row[2] || row[1], role: row[3], salt: row[4] || "", passwordHash: row[5] || "",
      active: !/^inativo$/i.test(row[6] || "Ativo"), createdAt: row[7] || "", updatedAt: row[8] || "", source: "sheets",
    });
  }
  const bootstrapUsername = process.env.CICLUS_ACCESS_USER?.trim() || DEFAULT_USER;
  if (!latest.has(bootstrapUsername.toLocaleLowerCase("pt-BR"))) {
    latest.set(bootstrapUsername.toLocaleLowerCase("pt-BR"), {
      username: bootstrapUsername, name: "Dronefy Agro", role: "admin", salt: "", passwordHash: process.env.CICLUS_ADMIN_PASSWORD_SHA256?.trim().toLowerCase() || DEFAULT_PASSWORD_HASH,
      active: true, createdAt: "Conta inicial", updatedAt: "", source: "bootstrap",
    });
  }
  return [...latest.values()];
}

export async function verifyPlatformUser(username: string, password: string): Promise<SessionUser | null> {
  const bootstrapUsername = process.env.CICLUS_ACCESS_USER?.trim() || DEFAULT_USER;
  const recoveryHash = process.env.CICLUS_ADMIN_PASSWORD_SHA256?.trim().toLowerCase() || DEFAULT_PASSWORD_HASH;
  const recoverySupplied = Buffer.from(sha256Hex(password), "hex");
  const recoveryExpected = Buffer.from(recoveryHash, "hex");
  const requestedUsername = username.trim().toLocaleLowerCase("pt-BR");
  const recoveryUsernames = new Set([DEFAULT_USER, bootstrapUsername].map((value) => value.toLocaleLowerCase("pt-BR")));
  if (recoveryUsernames.has(requestedUsername) && recoverySupplied.length === recoveryExpected.length && timingSafeEqual(recoverySupplied, recoveryExpected)) {
    return { username: requestedUsername === DEFAULT_USER ? DEFAULT_USER : bootstrapUsername, name: "Dronefy Agro", role: "admin" };
  }
  const user = (await getPlatformUsers()).find((item) => item.username.toLocaleLowerCase("pt-BR") === username.trim().toLocaleLowerCase("pt-BR"));
  if (!user?.active || !user.passwordHash) return null;
  const suppliedHash = user.source === "bootstrap"
    ? Buffer.from(sha256Hex(password), "hex")
    : Buffer.from(await scrypt(password, user.salt, 64) as Buffer);
  const expectedHash = Buffer.from(user.passwordHash, "hex");
  if (suppliedHash.length !== expectedHash.length || !timingSafeEqual(suppliedHash, expectedHash)) return null;
  return { username: user.username, name: user.name, role: user.role };
}

export async function passwordCredentials(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64) as Buffer;
  return { salt, hash: hash.toString("hex") };
}

export async function appendPlatformUser(input: { username: string; name: string; role: UserRole; password: string; active?: boolean; createdAt?: string; actor: string }) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!spreadsheetId) throw new Error("A fonte de dados não está configurada.");
  const token = await getAccessToken();
  const credentials = await passwordCredentials(input.password);
  const now = new Date().toISOString();
  const row = [USER_RECORD_KIND, input.username.trim(), input.name.trim(), input.role, credentials.salt, credentials.hash, input.active === false ? "Inativo" : "Ativo", input.createdAt || now, now, input.actor];
  const range = encodeURIComponent("'Configurações'!A:J");
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ values: [row] }),
  });
  if (!response.ok) throw new Error("Não foi possível salvar o usuário.");
}

