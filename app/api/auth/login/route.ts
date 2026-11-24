import { NextResponse } from "next/server";
import { rejectUnsafeMutation } from "../../../lib/api-guard";
import { createSessionToken, sessionCookie } from "../../../lib/auth";
import { verifyPlatformUser } from "../../../lib/platform-users";

export async function POST(request: Request) {
  const rejected = rejectUnsafeMutation(request, 16 * 1024);
  if (rejected) return rejected;
  try {
    const input = await request.json() as { username?: unknown; password?: unknown };
    const username = typeof input.username === "string" ? input.username.trim() : "";
    const password = typeof input.password === "string" ? input.password : "";
    if (!username || !password || username.length > 100 || password.length > 200) return NextResponse.json({ error: "Informe usuário e senha válidos." }, { status: 400 });
    const user = await verifyPlatformUser(username, password);
    if (!user) return NextResponse.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
    const response = NextResponse.json({ ok: true, user });
    response.cookies.set(sessionCookie(createSessionToken(user)));
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível autenticar." }, { status: 500 });
  }
}

