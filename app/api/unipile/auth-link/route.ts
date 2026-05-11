import { NextResponse } from "next/server";
import { createHostedAuthLink, unipileConfigured } from "@/lib/unipile";
import { getAppUrl } from "@/lib/appUrl";

// POST → returns a Unipile-hosted URL the user visits to connect an IG account
export async function POST() {
  if (!unipileConfigured()) {
    return NextResponse.json(
      { error: "unipile_not_configured" },
      { status: 500 },
    );
  }

  const appUrl = getAppUrl();

  try {
    const url = await createHostedAuthLink({
      appUrl,
      callbackId: `connect-${Date.now()}`,
      notifyUrl: `${appUrl}/api/unipile/webhook`,
    });

    if (!url) {
      return NextResponse.json({ error: "no_url_returned" }, { status: 502 });
    }
    return NextResponse.json({ url });
  } catch (err: any) {
    console.error("[auth-link] error:", err);
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
