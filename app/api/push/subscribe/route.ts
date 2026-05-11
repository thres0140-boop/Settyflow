import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface BrowserSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function POST(req: NextRequest) {
  const sub = (await req.json().catch(() => null)) as BrowserSub | null;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "bad_subscription" }, { status: 400 });
  }

  const ua = req.headers.get("user-agent");

  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: {
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: ua,
    },
    update: {
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: ua,
      lastUsed: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
