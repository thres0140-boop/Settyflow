import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/saved-replies?accountId=X
// Returns templates scoped to that account + any global (accountId=null) ones.
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("accountId");
  const where = accountId
    ? { OR: [{ accountId: parseInt(accountId) }, { accountId: null }] }
    : {};

  const items = await prisma.savedReply.findMany({
    where,
    orderBy: [{ accountId: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ items });
}

// POST { accountId?: number|null, label: string, body: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.label || !body.body) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }
  const item = await prisma.savedReply.create({
    data: {
      accountId: body.accountId ?? null,
      label: String(body.label).slice(0, 80),
      body: String(body.body),
    },
  });
  return NextResponse.json({ item });
}
