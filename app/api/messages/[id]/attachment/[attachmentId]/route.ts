import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { downloadAttachment } from "@/lib/unipile";

// Streams a message attachment (voice note, image) by id through our backend
// so the browser can play / render it. Unipile attachment URLs require API
// key auth, so we can't link to them directly from <audio>.
//
// GET /api/messages/:id/attachment/:attachmentId
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const { id, attachmentId } = await params;
  const messageId = Number(id);

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      account: { select: { unipileAccountId: true } },
    },
  });
  if (!message || !message.unipileMsgId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const { bytes, contentType } = await downloadAttachment({
      messageId: message.unipileMsgId,
      attachmentId,
      accountId: message.account.unipileAccountId,
    });
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        // Audio can be cached briefly — IDs are stable.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "fetch_failed", detail: String(e?.message ?? e) },
      { status: 502 },
    );
  }
}
