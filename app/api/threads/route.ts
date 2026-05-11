import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/threads?accountId=&status=&q=&take=
// Default: unified inbox — all accounts, all statuses, sorted by most recent message
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const accountId = sp.get("accountId");
  const status = sp.get("status");
  const archived = sp.get("archived") === "true";
  const unanswered = sp.get("unanswered") === "true";
  const q = sp.get("q")?.toLowerCase();
  const take = Math.min(parseInt(sp.get("take") ?? "100"), 200);

  const threads = await prisma.thread.findMany({
    where: {
      archived,
      ...(accountId ? { accountId: parseInt(accountId) } : {}),
      ...(status ? { status } : {}),
      // "Unanswered" = the last message in the thread is from the lead,
      // meaning we haven't replied yet.
      ...(unanswered ? { lastMessageFromMe: false } : {}),
      ...(q
        ? {
            OR: [
              { leadName: { contains: q } },
              { leadHandle: { contains: q } },
              { lastMessagePreview: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take,
    include: {
      account: {
        select: {
          id: true,
          handle: true,
          displayName: true,
          profilePicUrl: true,
          color: true,
        },
      },
    },
  });

  return NextResponse.json({
    threads: threads.map((t) => ({
      id: t.id,
      account: t.account,
      leadName: t.leadName,
      leadHandle: t.leadHandle,
      leadProfilePic: t.leadProfilePic,
      status: t.status,
      unreadCount: t.unreadCount,
      lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: t.lastMessagePreview,
      lastMessageFromMe: t.lastMessageFromMe,
    })),
  });
}
