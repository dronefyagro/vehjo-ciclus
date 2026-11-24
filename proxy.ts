import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "./app/lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

export function proxy(request: NextRequest) {
  if (PUBLIC_PATHS.has(request.nextUrl.pathname)) return NextResponse.next();
  const session = verifySessionToken(request.cookies.get("ciclus_session")?.value);
  if (session) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Sessão expirada ou acesso não autorizado." }, { status: 401 });
  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.svg|manifest\\.webmanifest|sw\\.js|ciclus-.*\\.svg|dronefy-logo\\.png).*)"],
};
