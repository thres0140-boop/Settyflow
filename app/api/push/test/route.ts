import { NextResponse } from "next/server";
import { sendPushToAll } from "@/lib/push-server";

// Fires a test push to every saved subscription.
// Hit from the browser via GET or POST to verify the pipeline end-to-end.
export async function GET() {
  return run();
}
export async function POST() {
  return run();
}

async function run() {
  try {
    await sendPushToAll({
      title: "Settyflow test",
      body: "If you see this, push notifications are working 🎉",
      icon: "/icon-192.png",
      url: "/inbox",
      tag: "settyflow-test",
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
