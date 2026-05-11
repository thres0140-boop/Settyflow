import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeStored, removeStored } from "@/lib/storage";

// Upload a custom profile picture for a coach account.
// Unipile's IG account-list response doesn't reliably include the coach's
// own profile picture, so this gives users a guaranteed way to set one.
//
// POST /api/accounts/:id/avatar
//   body: multipart/form-data with `file` field (image/jpeg, image/png, image/webp)
// Returns: { ok: true, profilePicUrl }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const accountId = Number(id);
  const acc = await prisma.account.findUnique({ where: { id: accountId } });
  if (!acc) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size === 0 || file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: "bad_size", maxBytes: 5 * 1024 * 1024 },
      { status: 400 },
    );
  }
  const contentType = (file.type || "image/jpeg").toLowerCase();
  if (!/^image\/(jpe?g|png|webp|gif)$/.test(contentType)) {
    return NextResponse.json({ error: "bad_content_type" }, { status: 400 });
  }

  const ext = contentType.split("/")[1].replace("jpeg", "jpg");
  const key = `account-avatars/${acc.id}/${Date.now()}.${ext}`;

  const bytes = Buffer.from(await file.arrayBuffer());
  const stored = await writeStored({ key, bytes, contentType });

  // Best-effort cleanup of the previous avatar (only blob-side has a URL).
  if (acc.profilePicUrl && acc.profilePicUrl.startsWith("http")) {
    try {
      await removeStored({ key: "", url: acc.profilePicUrl });
    } catch {
      /* ignore */
    }
  }

  const profilePicUrl = stored.url ?? `/api/accounts/${acc.id}/avatar/file?k=${encodeURIComponent(stored.key)}`;
  await prisma.account.update({
    where: { id: acc.id },
    data: { profilePicUrl },
  });

  return NextResponse.json({ ok: true, profilePicUrl });
}
