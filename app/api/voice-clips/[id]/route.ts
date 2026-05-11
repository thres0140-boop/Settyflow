import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { removeStored, buildVoiceKey } from "@/lib/storage";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const clip = await prisma.voiceClip.findUnique({
    where: { id: parseInt(id) },
  });
  if (!clip) return NextResponse.json({ ok: true });

  await removeStored({
    key: buildVoiceKey(clip.accountId, clip.filename),
    url: clip.url,
  });
  await prisma.voiceClip.delete({ where: { id: clip.id } });
  return NextResponse.json({ ok: true });
}
