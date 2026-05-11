import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listAccounts, unipileConfigured } from "@/lib/unipile";

// GET — list Unipile accounts not yet imported into Settyflow
// POST — import all unimported Unipile accounts of type INSTAGRAM
export async function GET() {
  if (!unipileConfigured()) {
    return NextResponse.json({ error: "unipile_not_configured" }, { status: 500 });
  }
  const list: any = await listAccounts();
  const items: any[] = list.items ?? list.accounts ?? [];
  const existing = await prisma.account.findMany({
    select: { unipileAccountId: true },
  });
  const existingIds = new Set(existing.map((e) => e.unipileAccountId));

  const candidates = items
    .filter((a) => a.type === "INSTAGRAM")
    .filter((a) => !existingIds.has(a.id))
    .map((a) => ({
      unipileAccountId: a.id,
      handle: a?.connection_params?.im?.username ?? a?.name ?? null,
      displayName: a?.name ?? null,
      status: a?.sources?.[0]?.status ?? "active",
    }));

  return NextResponse.json({ candidates });
}

export async function POST() {
  if (!unipileConfigured()) {
    return NextResponse.json({ error: "unipile_not_configured" }, { status: 500 });
  }
  const list: any = await listAccounts();
  const items: any[] = list.items ?? list.accounts ?? [];

  const palette = [
    "#6366f1", "#ec4899", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
    "#06b6d4", "#84cc16", "#f43f5e", "#0ea5e9",
  ];

  let created = 0;
  let updated = 0;

  for (const a of items) {
    if (a.type !== "INSTAGRAM") continue;

    const handle = a?.connection_params?.im?.username ?? a?.name ?? null;
    const displayName = a?.name ?? handle;
    const status = a?.sources?.[0]?.status === "OK" ? "active" : "error";

    const existing = await prisma.account.findUnique({
      where: { unipileAccountId: a.id },
    });

    if (existing) {
      // Fix up empty handle/displayName on prior empty rows
      await prisma.account.update({
        where: { id: existing.id },
        data: {
          handle: existing.handle ?? handle,
          displayName: existing.displayName ?? displayName,
          status,
        },
      });
      updated++;
    } else {
      const color = palette[(created + updated) % palette.length];
      await prisma.account.create({
        data: {
          unipileAccountId: a.id,
          handle,
          displayName,
          color,
          status,
        },
      });
      created++;
    }
  }

  return NextResponse.json({ imported: created, updated });
}
