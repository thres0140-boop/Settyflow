import path from "path";
import { promises as fs } from "fs";
import { put, del } from "@vercel/blob";

// Two-mode storage abstraction:
//   - Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production on Vercel).
//   - Local disk under ./storage/ otherwise (dev).
//
// Each stored file has:
//   - key:  canonical identifier ("voice/1/abc.m4a") — saved as VoiceClip.filename
//   - url?: public URL when on Vercel Blob (used directly by <audio> tags),
//           null on local disk (the API route streams the bytes instead).

export interface StoredFile {
  key: string;
  url: string | null;
  sizeBytes: number;
}

const ROOT = path.join(process.cwd(), "storage");

const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

// ---- Public API -------------------------------------------------------

export async function writeStored(opts: {
  key: string;          // e.g. "voice/12/1234-abcd.m4a"
  bytes: Buffer;
  contentType: string;
}): Promise<StoredFile> {
  if (useBlob()) {
    const result = await put(opts.key, opts.bytes, {
      access: "public",
      contentType: opts.contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return { key: opts.key, url: result.url, sizeBytes: opts.bytes.length };
  }

  await ensureLocalDir(opts.key);
  await fs.writeFile(localPathForKey(opts.key), opts.bytes);
  return { key: opts.key, url: null, sizeBytes: opts.bytes.length };
}

export async function readStored(opts: {
  key: string;
  url: string | null;
}): Promise<Buffer> {
  if (opts.url) {
    // Blob path — fetch the public URL.
    const res = await fetch(opts.url);
    if (!res.ok) {
      throw new Error(`blob fetch failed: ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  // Local disk path.
  return fs.readFile(localPathForKey(opts.key));
}

export async function removeStored(opts: {
  key: string;
  url: string | null;
}): Promise<void> {
  if (opts.url) {
    try {
      await del(opts.url);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    await fs.unlink(localPathForKey(opts.key));
  } catch {
    /* ignore */
  }
}

// ---- Helpers (kept exported for backwards compat with old callers) ----

export function buildVoiceKey(accountId: number, filename: string) {
  return `voice/${accountId}/${filename}`;
}

// ---- Local-disk plumbing ---------------------------------------------

function localPathForKey(key: string) {
  return path.join(ROOT, ...key.split("/"));
}

async function ensureLocalDir(key: string) {
  const dir = path.dirname(localPathForKey(key));
  await fs.mkdir(dir, { recursive: true });
}

// ---- Legacy shims (still used elsewhere) ------------------------------

export async function ensureDir(...segments: string[]) {
  const dir = path.join(ROOT, ...segments);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function storagePath(...segments: string[]) {
  return path.join(ROOT, ...segments);
}

export async function writeFileFromBuffer(
  relativeParts: string[],
  filename: string,
  buf: Buffer,
) {
  const dir = await ensureDir(...relativeParts);
  const target = path.join(dir, filename);
  await fs.writeFile(target, buf);
  return target;
}

export async function readFileBytes(absPath: string) {
  return fs.readFile(absPath);
}

export async function removeFile(absPath: string) {
  try {
    await fs.unlink(absPath);
  } catch {
    /* ignore */
  }
}
