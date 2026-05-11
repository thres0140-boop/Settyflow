import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// One-shot cleanup: delete threads on this account whose last message is
// older than (account.createdAt - 1min). Useful right after connecting an
// IG account that had years of pre-existing DMs — those got backfilled
// before the connect-time cutoff existed and clutter the inbox.
//
// POST /api/accounts/:id/cleanup-old
// Returns { deletedThreads, keptThreads }.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const accountId = Number(id);
  const acc = await prisma.account.findUnique({ where: { id: accountId } });
  if (!acc) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const cutoff = new Date(acc.createdAt.getTime() - 60_000);

  // Find threads whose newest message is before the cutoff (or threads with
  // no messages at all, which are pure noise rows from listChats).
  const staleThreads = await prisma.thread.findMany({
    where: {
      accountId,
      OR: [
        { lastMessageAt: { lt: cutoff } },
        { lastMessageAt: null },
      ],
    },
    select: { id: true },
  });
  const staleIds = staleThreads.map((t) => t.id);

  if (staleIds.length === 0) {
    const total = await prisma.thread.count({ where: { accountId } });
    return NextResponse.json({ deletedThreads: 0, keptThreads: total });
  }

  await prisma.thread.deleteMany({ where: { id: { in: staleIds } } });

  const remaining = await prisma.thread.count({ where: { accountId } });
  return NextResponse.json({
    deletedThreads: staleIds.length,
    keptThreads: remaining,
    cutoff: cutoff.toISOString(),
  });
}
