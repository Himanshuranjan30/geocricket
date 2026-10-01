// Crops every generated rig variant (public/rig2) to one fixed box around the figure and writes the served set
// (public/rig). The box is the same for all, so variants stay aligned and src/lib/rig.ts HEAD_BOX stays valid.
// Usage: node scripts/rig-crop.mjs [src] [dest]
import { mkdirSync, readdirSync } from "node:fs";
import sharp from "sharp";
const [src = "public/rig2", dest = "public/rig"] = process.argv.slice(2);
const BOX = { left: 125, top: 170, width: 372, height: 620 }; // 3:5, from the master's figure bounds + room for buns/long hair
mkdirSync(dest, { recursive: true });
for (const f of readdirSync(src).filter((f) => f.endsWith(".webp"))) {
  await sharp(`${src}/${f}`).extract(BOX).resize(600, 1000).webp({ quality: 90 }).toFile(`${dest}/${f}`);
}
console.log("cropped", readdirSync(src).length, "→", dest);
