import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { SessionUser, UserRole } from "./access-control";

const SESSION_COOKIE = "ciclus_session";
const SESSION_SECONDS = 8 * 60 * 60;
const DEVELOPMENT_SESSION_SECRET = "ciclus-development-session-only";

type SessionPayload = SessionUser & { expiresAt: number };

const sessionSecret = () => {
  const configured = process.env.CICLUS_SESSION_SECRET
    || process.env.GOOGLE_PRIVATE_KEY
    || process.env.CICLUS_ACCESS_PASSWORD_SHA256;
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return DEVELOPMENT_SESSION_SECRET;
  throw new Error("A chave de sessão da plataforma não está configurada.");
};

const encode = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const decode = (value: string) => Buffer.from(value, "base64url").toString("utf8");
const sign = (value: string) => createHmac("sha256", sessionSecret()).update(value).digest("base64url");

export function createSessionToken(user: SessionUser) {
  const payload = encode(JSON.stringify({ ...user, expiresAt: Date.now() + SESSION_SECONDS * 1000 } satisfies SessionPayload));
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token?: string | null): SessionUser | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const parsed = JSON.parse(decode(payload)) as Partial<SessionPayload>;
    if (!parsed.username || !parsed.name || !isUserRole(parsed.role) || !parsed.expiresAt || parsed.expiresAt <= Date.now()) return null;
    return { username: parsed.username, name: parsed.name, role: parsed.role };
  } catch {
    return null;
  }
}

export function isUserRole(value: unknown): value is UserRole {
  return value === "admin" || value === "supervisor" || value === "user";
}

export function getRequestSession(request: Request | NextRequest) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return verifySessionToken(match?.[1]);
}

export async function getServerSession() {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export function sessionCookie(token: string) {
  return { name: SESSION_COOKIE, value: token, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: SESSION_SECONDS };
}

export function expiredSessionCookie() {
  return { name: SESSION_COOKIE, value: "", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: 0 };
}

export const sha256Hex = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

