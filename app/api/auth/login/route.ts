import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));
  const ownerEmail = process.env.OWNER_EMAIL;
  const ownerPassword = process.env.OWNER_PASSWORD;

  if (!ownerEmail || !ownerPassword) {
    return NextResponse.json(
      { error: "owner_not_configured" },
      { status: 500 },
    );
  }

  const emailOk = typeof email === "string" && email.toLowerCase() === ownerEmail.toLowerCase();
  const passOk = typeof password === "string" && password === ownerPassword;

  if (!emailOk || !passOk) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  await createSession({ sub: ownerEmail, name: process.env.OWNER_NAME ?? "Setter" });
  return NextResponse.json({ ok: true });
}
