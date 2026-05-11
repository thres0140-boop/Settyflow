// One-off script: render public/icon.svg into the PWA PNG sizes.
// Run with `node scripts/build-icons.mjs`.

import sharp from "sharp";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = await readFile(path.join(root, "public/icon.svg"));

const sizes = [
  { size: 192, out: "public/icon-192.png" },
  { size: 512, out: "public/icon-512.png" },
  { size: 180, out: "public/apple-touch-icon.png" }, // iOS canonical
];

for (const { size, out } of sizes) {
  await sharp(svg).resize(size, size).png().toFile(path.join(root, out));
  console.log(`✔ ${out} (${size}x${size})`);
}
