// Thin wrapper around Unipile REST API.
// Docs: https://developer.unipile.com/

const dsn = () => (process.env.UNIPILE_DSN ?? "").trim();
const key = () => (process.env.UNIPILE_API_KEY ?? "").trim();

export const unipileConfigured = () => Boolean(dsn() && key());

const base = () => `https://${dsn()}/api/v1`;

function headers(extra: Record<string, string> = {}) {
  return {
    "X-API-KEY": key(),
    accept: "application/json",
    ...extra,
  };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      ...headers(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      `Unipile ${path} failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`,
    );
    (err as any).status = res.status;
    (err as any).body = json;
    throw err;
  }
  return json as T;
}

// --- Hosted auth -------------------------------------------------------

export async function createHostedAuthLink(opts: {
  appUrl: string;
  callbackId: string; // anything you want echoed back; we'll use a uuid or "new"
  notifyUrl: string;
}) {
  const expiresOn = new Date(Date.now() + 60 * 60 * 1000)
    .toISOString()
    .replace(/(\.\d{3})Z$/, ".000Z");

  const data = await call<{
    url?: string;
    hosted_url?: string;
    link?: string;
  }>("/hosted/accounts/link", {
    method: "POST",
    body: JSON.stringify({
      type: "create",
      providers: ["INSTAGRAM"],
      api_url: `https://${dsn()}`,
      expiresOn,
      name: opts.callbackId,
      success_redirect_url: `${opts.appUrl}/api/unipile/callback?status=success`,
      failure_redirect_url: `${opts.appUrl}/api/unipile/callback?status=failure`,
      notify_url: opts.notifyUrl,
    }),
  });
  return data.url ?? data.hosted_url ?? data.link ?? null;
}

// --- Accounts ----------------------------------------------------------

export interface UnipileAccount {
  id: string;
  provider?: string;
  name?: string;
  username?: string;
  profile_picture_url?: string;
  status?: string;
}

export async function listAccounts() {
  return call<{ items?: UnipileAccount[]; accounts?: UnipileAccount[] }>(
    "/accounts?limit=100",
  );
}

export async function getAccount(accountId: string) {
  return call<UnipileAccount>(`/accounts/${accountId}`);
}

export async function deleteAccount(accountId: string) {
  return call<{ ok: boolean }>(`/accounts/${accountId}`, { method: "DELETE" });
}

// --- Chats / messages -------------------------------------------------

export async function listChats(accountId: string, limit = 50) {
  return call<{ items?: any[]; chats?: any[] }>(
    `/chats?account_id=${encodeURIComponent(accountId)}&limit=${limit}`,
  );
}

export async function getChatMessages(
  chatId: string,
  accountId: string,
  limit = 50,
) {
  return call<{ items?: any[]; messages?: any[] }>(
    `/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}&account_id=${encodeURIComponent(accountId)}`,
  );
}

export interface UnipileAttendee {
  id: string;
  provider_id?: string;
  name?: string;
  picture_url?: string;
  profile_url?: string;
  is_self?: number;
}

export async function getChatAttendees(chatId: string, accountId: string) {
  return call<{ items?: UnipileAttendee[] }>(
    `/chats/${encodeURIComponent(chatId)}/attendees?account_id=${encodeURIComponent(accountId)}`,
  );
}

export async function sendChatMessage(
  chatId: string,
  accountId: string,
  text: string,
  replyToUnipileMsgId?: string | null,
) {
  // Unipile's own SDK sends this endpoint as multipart/form-data, not JSON.
  // Their support confirmed quote_id is the correct param for native replies,
  // and empirically the server only honors it through the multipart path.
  const fd = new FormData();
  fd.append("text", text);
  fd.append("account_id", accountId);
  if (replyToUnipileMsgId) {
    fd.append("quote_id", replyToUnipileMsgId);
  }

  const res = await fetch(`${base()}/chats/${encodeURIComponent(chatId)}/messages`, {
    method: "POST",
    headers: { "X-API-KEY": key(), accept: "application/json" },
    body: fd,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Unipile send failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return json;
}

// Send a file (voice note, image, etc) into a chat.
// Per Unipile docs:
//   - Instagram voice notes: `attachment` (singular), .m4a preferred
//   - WhatsApp/LinkedIn voice: `voice_message`
// We default to `attachment` since all our threads are IG.
export async function sendChatAttachment(opts: {
  chatId: string;
  accountId: string;
  filename: string;
  contentType: string;
  bytes: Buffer | Uint8Array;
  text?: string;
  asVoice?: boolean;
  field?: "attachment" | "attachments" | "voice_message";
}) {
  const fd = new FormData();
  fd.append("account_id", opts.accountId);
  if (opts.text != null && opts.text !== "") fd.append("text", opts.text);

  const blob = new Blob([new Uint8Array(opts.bytes)], { type: opts.contentType });
  // Valid Unipile fields are: voice_message, video_message, attachments (plural).
  // `attachment` (singular) is rejected with 400 "Unexpected field".
  const field = opts.field ?? (opts.asVoice ? "voice_message" : "attachments");
  fd.append(field, blob, opts.filename);

  const res = await fetch(
    `${base()}/chats/${encodeURIComponent(opts.chatId)}/messages`,
    {
      method: "POST",
      headers: { "X-API-KEY": key(), accept: "application/json" },
      body: fd,
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Unipile attachment send failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return json;
}

// Normalize Unipile send responses — id can be a string or array of strings (for multi-msg sends)
export function extractMsgId(result: any): string | null {
  const v = result?.id ?? result?.message_id ?? result?.message_ids ?? null;
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === "string" ? v : null;
}
