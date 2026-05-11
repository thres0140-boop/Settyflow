import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFileFromBuffer } from "@/lib/storage";
import { normalizeVoiceNote } from "@/lib/audio";

export const dynamic = "force-dynamic";

// GET /api/voice-clips?accountId=X
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("accountId");
  const items = await prisma.voiceClip.findMany({
    where: accountId ? { accountId: parseInt(accountId) } : {},
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      accountId: true,
      label: true,
      contentType: true,
      sizeBytes: true,
      durationMs: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ items });
}

// POST multipart: { file, accountId, label }
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const accountIdRaw = form.get("accountId");
  const label = form.get("label");

  if (!(file instanceof File) || !accountIdRaw || !label) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }
  const accountId = parseInt(String(accountIdRaw));
  if (Number.isNaN(accountId)) {
    return NextResponse.json({ error: "bad_accountId" }, { status: 400 });
  }

  const MAX_BYTES = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  const rawBuf: Buffer = Buffer.from(await file.arrayBuffer());

  // Re-encode to Instagram-compatible AAC m4a. If ffmpeg is missing, fall back
  // to storing the original so at least the feature works (won't play on IG).
  let storedBuf: Buffer = rawBuf;
  let ext = "m4a";
  let contentType = "audio/mp4";
  let normalized = false;
  try {
    storedBuf = await normalizeVoiceNote(rawBuf);
    normalized = true;
  } catch (e: any) {
    console.warn("[voice-clips] normalize failed, storing raw:", e?.message ?? e);
    ext = (file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? "m4a").toLowerCase();
    contentType = file.type || "audio/mp4";
  }

  const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await writeFileFromBuffer(["voice", String(accountId)], storedName, storedBuf);

  const item = await prisma.voiceClip.create({
    data: {
      accountId,
      label: String(label).slice(0, 80),
      filename: storedName,
      contentType,
      sizeBytes: storedBuf.length,
    },
  });

  return NextResponse.json({ item, normalized });
}
