import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readFileBytes, storagePath } from "@/lib/storage";
import { sendChatAttachment, extractMsgId, unipileConfigured } from "@/lib/unipile";
import { emitRealtime } from "@/lib/realtime";

// POST /api/voice-clips/[id]/send  body: { threadId }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!unipileConfigured()) {
    return NextResponse.json({ error: "unipile_not_configured" }, { status: 500 });
  }

  const { id } = await params;
  const { threadId } = await req.json().catch(() => ({}));
  if (!threadId) {
    return NextResponse.json({ error: "missing_threadId" }, { status: 400 });
  }

  const clip = await prisma.voiceClip.findUnique({
    where: { id: parseInt(id) },
  });
  if (!clip) return NextResponse.json({ error: "clip_not_found" }, { status: 404 });

  const thread = await prisma.thread.findUnique({
    where: { id: Number(threadId) },
    include: { account: true },
  });
  if (!thread) return NextResponse.json({ error: "thread_not_found" }, { status: 404 });

  if (thread.accountId !== clip.accountId) {
    return NextResponse.json(
      { error: "account_mismatch", detail: "clip belongs to a different coach" },
      { status: 400 },
    );
  }

  let bytes: Buffer;
  try {
    bytes = await readFileBytes(
      storagePath("voice", String(clip.accountId), clip.filename),
    );
  } catch {
    return NextResponse.json({ error: "file_missing_on_disk" }, { status: 500 });
  }

  try {
    const result: any = await sendChatAttachment({
      chatId: thread.chatId,
      accountId: thread.account.unipileAccountId,
      filename: clip.filename,
      contentType: clip.contentType || "audio/mp4",
      bytes,
      asVoice: true,
    });

    const upId = extractMsgId(result);
    const now = new Date();

    const msg = await prisma.message.create({
      data: {
        threadId: thread.id,
        accountId: thread.accountId,
        unipileMsgId: upId,
        direction: "out",
        content: `🎤 ${clip.label}`,
        attachments: JSON.stringify([
          { kind: "voice", clipId: clip.id, label: clip.label },
        ]),
        sentAt: now,
      },
    });

    await prisma.thread.update({
      where: { id: thread.id },
      data: {
        lastMessageAt: now,
        lastMessagePreview: `🎤 ${clip.label}`,
        lastMessageFromMe: true,
      },
    });

    emitRealtime({
      type: "message.created",
      threadId: thread.id,
      accountId: thread.accountId,
      direction: "out",
      preview: `🎤 ${clip.label}`,
      leadName: thread.leadName,
      leadHandle: thread.leadHandle,
      leadProfilePic: thread.leadProfilePic,
      accountHandle: thread.account.handle,
      accountColor: thread.account.color,
    });

    return NextResponse.json({ message: msg });
  } catch (err: any) {
    console.error("[voice send] failed:", err);
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 502 },
    );
  }
}
