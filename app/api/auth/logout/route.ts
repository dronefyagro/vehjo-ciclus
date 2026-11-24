import { NextResponse } from "next/server";
import { rejectUnsafeMutation } from "../../../lib/api-guard";
import { expiredSessionCookie } from "../../../lib/auth";

export async function POST(request: Request) {
  const rejected = rejectUnsafeMutation(request, 1024);
  if (rejected) return rejected;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(expiredSessionCookie());
  return response;
}

