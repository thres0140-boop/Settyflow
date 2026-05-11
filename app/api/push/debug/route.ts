import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Diagnostic endpoint — lists current push subscriptions so we can see which
// devices/browsers actually completed the subscribe flow.
export async function GET() {
  const subs = await prisma.pushSubscription.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userAgent: true,
      createdAt: true,
      lastUsed: true,
      endpoint: true,
    },
  });

  return NextResponse.json({
    count: subs.length,
    subs: subs.map((s) => ({
      id: s.id,
      // Show only the endpoint host so we can tell Apple/FCM apart without leaking the full URL
      endpointHost: (() => {
        try {
          return new URL(s.endpoint).host;
        } catch {
          return "?";
        }
      })(),
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastUsed: s.lastUsed,
    })),
  });
}
