import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readStored, buildVoiceKey } from "@/lib/storage";

// In prod (Vercel Blob): redirect to the public blob URL.
// In dev (local disk):   stream the bytes inline.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const clip = await prisma.voiceClip.findUnique({
    where: { id: parseInt(id) },
  });
  if (!clip) return new NextResponse("not found", { status: 404 });

  if (clip.url) {
    // Vercel Blob — let the browser load it directly.
    return NextResponse.redirect(clip.url, 302);
  }

  try {
    const bytes = await readStored({
      key: buildVoiceKey(clip.accountId, clip.filename),
      url: null,
    });
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": clip.contentType || "audio/mp4",
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("missing file", { status: 404 });
  }
}
