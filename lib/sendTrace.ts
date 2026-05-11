// Single-slot in-memory buffer for the most recent Unipile send call.
// Populated by sendChatMessage in lib/unipile.ts, read by the
// /api/debug/last-send-trace endpoint so we can paste literal request +
// response evidence to Unipile support without trawling Vercel logs.

export interface SendTrace {
  capturedAt: string;
  request: {
    method: "POST";
    url: string;
    headers: Record<string, string>;
    multipartFields: Record<string, string>;
    curl: string;
  };
  response: {
    status: number;
    body: any;
  };
  verifyFetch?: {
    url: string;
    status: number;
    ourSentMessage:
      | {
          id: string | null;
          quoted: any;
          // Truncated full record for context
          raw: any;
        }
      | null;
  };
}

let lastTrace: SendTrace | null = null;

export function recordSendTrace(t: SendTrace) {
  lastTrace = t;
}

export function getLastSendTrace(): SendTrace | null {
  return lastTrace;
}
