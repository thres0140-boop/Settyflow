import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/unipile";
import { getAppUrl } from "@/lib/appUrl";

// Unipile redirects users here after the hosted auth flow.
// Query params: status, account_id, name
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const accountId = searchParams.get("account_id");

  const appUrl = getAppUrl();

  if (status !== "success" || !accountId) {
    return NextResponse.redirect(`${appUrl}/accounts?connect=failed`);
  }

  // `GET /accounts/{id}` race-conditions with 404 right after connection,
  // but LIST works reliably — find ours in the list instead.
  let handle: string | null = null;
  let displayName: string | null = null;
  let profilePicUrl: string | null = null;

  try {
    const list: any = await listAccounts();
    const items: any[] = list.items ?? list.accounts ?? [];
    console.log(`[callback] looking for ${accountId} in ${items.length} accounts; ids=${items.map((a: any) => a.id).join(",")}`);
    const acc = items.find((a) => a?.id === accountId);
    if (acc) {
      handle =
        acc?.connection_params?.im?.username ??
        acc?.name ??
        null;
      displayName = acc?.name ?? handle;
      profilePicUrl =
        acc?.connection_params?.im?.picture_url ??
        acc?.profile_picture_url ??
        null;
      console.log(`[callback] matched: handle=${handle} displayName=${displayName}`);
    } else {
      console.warn(`[callback] account ${accountId} not in list response`);
    }
  } catch (e) {
    console.warn("[callback] listAccounts failed:", e);
  }

  await prisma.account.upsert({
    where: { unipileAccountId: accountId },
    create: {
      unipileAccountId: accountId,
      handle,
      displayName,
      profilePicUrl,
    },
    update: {
      handle: handle ?? undefined,
      displayName: displayName ?? undefined,
      profilePicUrl: profilePicUrl ?? undefined,
      status: "active",
    },
  });

  return NextResponse.redirect(`${appUrl}/accounts?connect=success`);
}
