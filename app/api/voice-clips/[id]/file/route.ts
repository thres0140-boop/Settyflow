import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readFileBytes, storagePath } from "@/lib/storage";

// Streams the raw audio bytes so the browser can <audio src=…> them.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const clip = await prisma.voiceClip.findUnique({
    where: { id: parseInt(id) },
  });
  if (!clip) return new NextResponse("not found", { status: 404 });

  try {
    const bytes = await readFileBytes(
      storagePath("voice", String(clip.accountId), clip.filename),
    );
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
