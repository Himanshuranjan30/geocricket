// App icon candidates for GeoCricket. Usage: GOOGLE_ACCOUNT=you@x.com pnpm exec tsx scripts/logo-art.mts <outdir> [n]
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { image, pool } from "./genai.mts";

const out = process.argv[2]; const n = Number(process.argv[3] ?? 4);
const prompt = `Design a premium mobile game app icon for "GeoCricket", a daily cricket geography guessing game (like GeoGuessr, for cricket).
Concept: a glossy red leather cricket ball that is also a globe: the ball's white stitched seam wraps around it like the equator, with subtle
continents embossed on the leather, and a small bright location pin landing on it. Bold, simple, instantly readable at 48px.
Style: polished 3D-ish game icon, rich lighting, deep indigo-violet (#2A1F7A to #5B47C9) rounded-square background with a soft glow.
No text, no letters, no logos of real brands, no flags. Centered, square.`;
await pool(Array.from({ length: n }, (_, i) => i), 4, async (i: number) => {
  const img = await image(prompt);
  writeFileSync(`${out}/icon-${i}.png`, await sharp(img).resize(1024, 1024, { fit: "cover" }).png().toBuffer());
  console.log("✓", i);
});
