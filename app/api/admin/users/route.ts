import { NextResponse } from "next/server";
import { rejectUnsafeMutation } from "../../../lib/api-guard";
import { getRequestSession, isUserRole } from "../../../lib/auth";
import { appendPlatformUser, getPlatformUsers } from "../../../lib/platform-users";

export async function GET(request: Request) {
  if (getRequestSession(request)?.role !== "admin") return NextResponse.json({ error: "Apenas administradores podem gerenciar usuários." }, { status: 403 });
  const users = (await getPlatformUsers())
    .sort((left, right) => Number(right.active) - Number(left.active) || left.name.localeCompare(right.name, "pt-BR"))
    .map((user) => ({ username: user.username, name: user.name, role: user.role, active: user.active, createdAt: user.createdAt, updatedAt: user.updatedAt, source: user.source }));
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const rejected = rejectUnsafeMutation(request, 32 * 1024);
  if (rejected) return rejected;
  const session = getRequestSession(request);
  if (session?.role !== "admin") return NextResponse.json({ error: "Apenas administradores podem gerenciar usuários." }, { status: 403 });
  try {
    const input = await request.json() as { action?: unknown; username?: unknown; name?: unknown; role?: unknown; password?: unknown; active?: unknown };
    const action = input.action === "update" ? "update" : "create";
    const username = typeof input.username === "string" ? input.username.trim().toLocaleLowerCase("pt-BR") : "";
    const name = typeof input.name === "string" ? input.name.trim() : "";
    const password = typeof input.password === "string" ? input.password : "";
    if (!/^[a-zA-Z0-9._-]{3,50}$/.test(username) || !name || name.length > 100 || !isUserRole(input.role) || password.length > 200) return NextResponse.json({ error: "Preencha nome, perfil e um usuário válido." }, { status: 400 });
    if (password && password.length < 10) return NextResponse.json({ error: "A senha deve ter pelo menos 10 caracteres." }, { status: 400 });
    const platformUsers = await getPlatformUsers();
    const existing = platformUsers.find((item) => item.username.toLocaleLowerCase("pt-BR") === username);
    if (action === "create" && existing) return NextResponse.json({ error: "Este nome de usuário já está cadastrado. Use Editar acesso para alterá-lo." }, { status: 409 });
    if (action === "update" && !existing) return NextResponse.json({ error: "O usuário informado não foi encontrado." }, { status: 404 });
    if (action === "create" && !password) return NextResponse.json({ error: "Informe uma senha com pelo menos 10 caracteres." }, { status: 400 });
    const active = input.active !== false;
    if (existing?.username === session.username && (!active || input.role !== "admin")) return NextResponse.json({ error: "O administrador conectado não pode remover o próprio acesso administrativo." }, { status: 400 });
    const activeAdministrators = platformUsers.filter((user) => user.active && user.role === "admin");
    if (existing?.active && existing.role === "admin" && activeAdministrators.length === 1 && (!active || input.role !== "admin")) return NextResponse.json({ error: "A plataforma deve manter pelo menos um administrador ativo." }, { status: 400 });
    await appendPlatformUser({ username, name, role: input.role, password: password || undefined, active, createdAt: existing?.createdAt, actor: session.username, existing });
    return NextResponse.json({ ok: true, action });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar o usuário." }, { status: 500 });
  }
}

