import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.label === "string") data.label = body.label.slice(0, 80);
  if (typeof body.body === "string") data.body = body.body;
  const item = await prisma.savedReply.update({
    where: { id: parseInt(id) },
    data,
  });
  return NextResponse.json({ item });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.savedReply.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}
