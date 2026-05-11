import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      unipileAccountId: true,
      handle: true,
      displayName: true,
      profilePicUrl: true,
      color: true,
      status: true,
      lastSyncedAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ accounts });
}

// Removes ONLY the local row (and its cascaded threads/messages). The Unipile
// session is intentionally left alone — Cenk shares some of these IG accounts
// with another app (ClientFlow), and tearing down the Unipile session here
// would break the other app's access. To fully disconnect, delete the
// account from the Unipile dashboard separately.
export async function DELETE(req: NextRequest) {
  const { id } = await req.json().catch(() => ({}));
  const account = await prisma.account.findUnique({ where: { id: Number(id) } });
  if (!account) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.account.delete({ where: { id: account.id } });
  return NextResponse.json({ ok: true });
}
