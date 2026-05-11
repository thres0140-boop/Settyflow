import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Diagnostic — returns the most recent messages with key fields visible so we
// can verify whether unipileMsgId / reply metadata are correctly stored.
export async function GET(req: NextRequest) {
  const take = Math.min(parseInt(req.nextUrl.searchParams.get("take") ?? "15"), 50);

  const msgs = await prisma.message.findMany({
    orderBy: { sentAt: "desc" },
    take,
    select: {
      id: true,
      threadId: true,
      direction: true,
      content: true,
      sentAt: true,
      unipileMsgId: true,
      replyToUnipileMsgId: true,
      replyToSnippet: true,
    },
  });

  return NextResponse.json({
    messages: msgs.map((m) => ({
      ...m,
      contentPreview: m.content.slice(0, 80),
      hasUnipileMsgId: Boolean(m.unipileMsgId),
      isReply: Boolean(m.replyToUnipileMsgId),
    })),
  });
}
