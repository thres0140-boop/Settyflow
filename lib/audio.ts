import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

// Possible ffmpeg locations across macOS/Linux setups
const FFMPEG_CANDIDATES = [
  process.env.FFMPEG_PATH,
  "ffmpeg",
  "/opt/homebrew/bin/ffmpeg",
  "/usr/local/bin/ffmpeg",
  "/usr/bin/ffmpeg",
].filter(Boolean) as string[];

let resolvedFfmpeg: string | null = null;

async function findFfmpeg(): Promise<string | null> {
  if (resolvedFfmpeg) return resolvedFfmpeg;
  for (const candidate of FFMPEG_CANDIDATES) {
    try {
      await new Promise<void>((resolve, reject) => {
        const p = spawn(candidate, ["-version"]);
        p.on("error", reject);
        p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
      });
      resolvedFfmpeg = candidate;
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

// Re-encodes any input audio to a "voice-note-friendly" m4a:
// AAC-LC, mono, 44.1 kHz, ~64 kbps, faststart so it plays inline on IG.
export async function normalizeVoiceNote(inputBytes: Buffer): Promise<Buffer> {
  const ffmpeg = await findFfmpeg();
  if (!ffmpeg) {
    throw new Error("ffmpeg_not_found");
  }

  const tmp = os.tmpdir();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inPath = path.join(tmp, `settyflow-in-${stamp}`);
  const outPath = path.join(tmp, `settyflow-out-${stamp}.m4a`);

  await fs.writeFile(inPath, inputBytes);

  try {
    await new Promise<void>((resolve, reject) => {
      const args = [
        "-y",
        "-i", inPath,
        "-vn",
        "-c:a", "aac",
        "-b:a", "64k",
        "-ar", "44100",
        "-ac", "1",
        "-movflags", "+faststart",
        outPath,
      ];
      const p = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      p.stderr.on("data", (chunk) => (stderr += chunk.toString()));
      p.on("error", reject);
      p.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-300)}`));
      });
    });

    return await fs.readFile(outPath);
  } finally {
    fs.unlink(inPath).catch(() => {});
    fs.unlink(outPath).catch(() => {});
  }
}
