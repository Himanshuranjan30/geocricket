// Checks that every legend stands in one place across its six full-body frames (neutral + 5 moods): the head centre,
// the head top and the feet baseline should match the neutral frame. Prints the worst drift; exits 1 over tolerance.
// Usage: npx tsx scripts/legend-moods-check.mts [--tolerance=4]
import { readdirSync } from "node:fs";
import sharp from "sharp";
import { measure } from "./legend-moods-align.mts";

const FRAMES = ["full", "full-happy", "full-celebrate", "full-sad", "full-shocked", "full-nervous"];
const tol = Number(process.argv.find((a) => a.startsWith("--tolerance="))?.slice(12) ?? 4);
let worst = { dx: 0, dy: 0, dh: 0, at: "" }, bad = 0;
for (const id of readdirSync("public/legends").sort()) {
  const fits = [];
  for (const f of FRAMES) {
    try { const { data, info } = await sharp(`public/legends/${id}/${f}.webp`).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); fits.push({ f, ...measure(data, info.width, info.height) }); } catch { /* missing */ }
  }
  if (fits.length < FRAMES.length) continue;
  const [base] = fits;
  const dx = Math.max(...fits.map((x) => Math.abs(x.headX - base.headX))), dy = Math.max(...fits.map((x) => Math.abs(x.bottom - base.bottom))), dh = Math.max(...fits.map((x) => Math.abs(x.head - base.head)));
  if (dx > worst.dx) worst = { ...worst, dx, at: `${id} (head x)` };
  if (dy > worst.dy) worst.dy = dy;
  if (dh > worst.dh) worst.dh = dh;
  if (dx > tol || dy > tol) { bad++; if (bad <= 12) console.log(`✗ ${id.padEnd(13)} head x ±${dx}px  feet ±${dy}px  head top ±${dh}px`); }
}
console.log(`worst: head centre ±${worst.dx}px (${worst.at}), feet ±${worst.dy}px, head top ±${worst.dh}px · ${bad} legends over ±${tol}px`);
process.exit(bad ? 1 : 0);
