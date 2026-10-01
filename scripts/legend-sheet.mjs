// Contact sheet: one row per legend (6 moods + full body). Usage: node scripts/legend-sheet.mjs out.png
import sharp from "sharp";
import { existsSync, readdirSync } from "node:fs";
const M = ["idle", "happy", "celebrate", "shocked", "nervous", "sad", "full"], S = 160;
const ids = readdirSync("public/legends").filter((d) => existsSync(`public/legends/${d}/idle.webp`)).sort();
const tiles = [];
for (const [r, id] of ids.entries()) for (const [c, m] of M.entries()) {
  const f = `public/legends/${id}/${m}.webp`;
  if (existsSync(f)) tiles.push({ input: await sharp(f).resize(S, S, { fit: "contain", background: "#1E1760" }).png().toBuffer(), left: 120 + c * S, top: r * S });
  if (c === 0) tiles.push({ input: Buffer.from(`<svg width="120" height="${S}"><text x="8" y="${S / 2}" fill="white" font-size="16" font-family="sans-serif">${id}</text></svg>`), left: 0, top: r * S });
}
await sharp({ create: { width: 120 + M.length * S, height: ids.length * S, channels: 3, background: "#1E1760" } }).composite(tiles).png().toFile(process.argv[2]);
console.log(`${ids.length} legends`);
