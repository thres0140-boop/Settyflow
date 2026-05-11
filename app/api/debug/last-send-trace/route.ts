import { NextResponse } from "next/server";
import { getLastSendTrace } from "@/lib/sendTrace";

// Returns the full request + response trace of the most recent
// sendChatMessage call that included quote_id. Use this to grab literal
// evidence (cURL + Unipile response + post-send verify fetch) to paste
// into Unipile support tickets, without scrolling Vercel logs.
//
// Usage:
//   1. In the app, perform ONE quoted reply on any thread.
//   2. Open https://settyflow.vercel.app/api/debug/last-send-trace
//   3. Copy the JSON.
export async function GET() {
  const trace = getLastSendTrace();
  if (!trace) {
    return NextResponse.json(
      { ok: false, message: "No quoted send captured yet — perform one in the app, then refresh." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, trace }, {
    headers: { "Cache-Control": "no-store" },
  });
}
