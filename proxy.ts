import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_USER = "dronefyagro";
const DEFAULT_PASSWORD_HASH = "adccdc4cf1ad2bb6af52d82f9f96465a0c84aa87a672f920a9f5d1411c4f3bfa";

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest();

function authorized(request: NextRequest): boolean {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return false;

  let credentials = "";
  try {
    credentials = Buffer.from(authorization.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }

  const separator = credentials.indexOf(":");
  if (separator < 1) return false;
  const suppliedUser = credentials.slice(0, separator);
  const suppliedPassword = credentials.slice(separator + 1);
  const expectedUser = process.env.CICLUS_ACCESS_USER?.trim() || DEFAULT_USER;
  const configuredHash = process.env.CICLUS_ACCESS_PASSWORD_SHA256?.trim().toLowerCase();
  const expectedHash = /^[a-f0-9]{64}$/.test(configuredHash ?? "") ? configuredHash! : DEFAULT_PASSWORD_HASH;

  return suppliedUser === expectedUser && timingSafeEqual(sha256(suppliedPassword), Buffer.from(expectedHash, "hex"));
}

export function proxy(request: NextRequest) {
  if (authorized(request)) return NextResponse.next();

  return new NextResponse("Autenticação necessária para acessar o VEJHO Ciclus.", {
    status: 401,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": "text/plain; charset=utf-8",
      "WWW-Authenticate": 'Basic realm="VEJHO Ciclus", charset="UTF-8"',
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.svg|manifest\\.webmanifest|sw\\.js|ciclus-.*\\.svg|dronefy-logo\\.png).*)"],
};
