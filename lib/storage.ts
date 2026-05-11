import path from "path";
import { promises as fs } from "fs";

// Local-disk storage for voice clips and future media.
// For Vercel deploy, swap this layer for Vercel Blob — the API surface stays the same.

const ROOT = path.join(process.cwd(), "storage");

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
