import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteAccount as unipileDelete } from "@/lib/unipile";

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

export async function DELETE(req: NextRequest) {
  const { id } = await req.json().catch(() => ({}));
  const account = await prisma.account.findUnique({ where: { id: Number(id) } });
  if (!account) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    await unipileDelete(account.unipileAccountId);
  } catch (e) {
    console.warn("[accounts] unipile delete failed:", e);
  }

  await prisma.account.delete({ where: { id: account.id } });
  return NextResponse.json({ ok: true });
}
