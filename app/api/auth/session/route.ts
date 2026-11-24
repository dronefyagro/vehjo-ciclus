import { NextResponse } from "next/server";
import { getRequestSession } from "../../../lib/auth";

export async function GET(request: Request) {
  const user = getRequestSession(request);
  return user ? NextResponse.json({ user }) : NextResponse.json({ error: "Sessão não encontrada." }, { status: 401 });
}

