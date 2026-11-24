import { NextResponse } from "next/server";
import { rejectUnsafeMutation } from "../../../lib/api-guard";
import { getRequestSession, isUserRole } from "../../../lib/auth";
import { appendPlatformUser, getPlatformUsers } from "../../../lib/platform-users";

export async function GET(request: Request) {
  if (getRequestSession(request)?.role !== "admin") return NextResponse.json({ error: "Apenas administradores podem gerenciar usuários." }, { status: 403 });
  const users = (await getPlatformUsers()).map((user) => ({ username: user.username, name: user.name, role: user.role, active: user.active, createdAt: user.createdAt, updatedAt: user.updatedAt, source: user.source }));
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const rejected = rejectUnsafeMutation(request, 32 * 1024);
  if (rejected) return rejected;
  const session = getRequestSession(request);
  if (session?.role !== "admin") return NextResponse.json({ error: "Apenas administradores podem gerenciar usuários." }, { status: 403 });
  try {
    const input = await request.json() as { username?: unknown; name?: unknown; role?: unknown; password?: unknown; active?: unknown };
    const username = typeof input.username === "string" ? input.username.trim() : "";
    const name = typeof input.name === "string" ? input.name.trim() : "";
    const password = typeof input.password === "string" ? input.password : "";
    if (!/^[a-zA-Z0-9._-]{3,50}$/.test(username) || !name || name.length > 100 || !isUserRole(input.role) || password.length < 10 || password.length > 200) return NextResponse.json({ error: "Preencha nome, perfil, usuário válido e senha com pelo menos 10 caracteres." }, { status: 400 });
    const existing = (await getPlatformUsers()).find((item) => item.username.toLocaleLowerCase("pt-BR") === username.toLocaleLowerCase("pt-BR"));
    await appendPlatformUser({ username, name, role: input.role, password, active: input.active !== false, createdAt: existing?.createdAt, actor: session.username });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar o usuário." }, { status: 500 });
  }
}

