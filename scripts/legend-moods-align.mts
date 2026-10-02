// Re-fit each legend's mood images (full-<mood>.webp) to its neutral full-body render, so switching moods on the home
// figure never changes the character's size or where they stand. Generated poses come back at different scales and
// offsets (a raised bat shrinks the fit); this matches the standing height (feet to the top of the head, measured down
// the middle so a raised arm or bat beside the head doesn't count) and pins the feet to the same baseline and centre
// as full.webp. No image generation: pure re-layout. Re-run safe.
// Usage: npx tsx scripts/legend-moods-align.mts [id ...]
import { readdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const MOODS = ["happy", "celebrate", "sad", "shocked", "nervous"];
const W = 600, H = 1000;

type Fit = { bottom: number; head: number; cx: number };
/** Where the figure stands: its lowest opaque row (the feet), the centre of the legs, and the top of the head (the
 * highest opaque pixel in a narrow column over the body's centre). */
function measure(data: Buffer, w: number, h: number): Fit {
  const on = (x: number, y: number) => data[(y * w + x) * 4 + 3] > 60;
  let bottom = -1;
  for (let y = h - 1; y >= 0 && bottom < 0; y--) for (let x = 0; x < w; x++) if (on(x, y)) { bottom = y; break; }
  // Centre: median x of opaque pixels in the band just above the feet (shoes and lower pads).
  const xs: number[] = [];
  for (let y = Math.max(0, bottom - 120); y <= bottom; y += 4) for (let x = 0; x < w; x++) if (on(x, y)) xs.push(x);
  const cx = xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? w / 2;
  let head = bottom;
  for (let y = 0; y < bottom; y++) { let hit = false; for (let x = Math.max(0, Math.round(cx - w * 0.07)); x <= Math.min(w - 1, Math.round(cx + w * 0.07)); x++) if (on(x, y)) { hit = true; break; } if (hit) { head = y; break; } }
  return { bottom, head, cx };
}
async function raw(path: string) { const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; }

const ids = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync("public/legends").filter((id) => MOODS.every((m) => readdirSync(`public/legends/${id}`).includes(`full-${m}.webp`)));
for (const id of ids) {
  const b = await raw(`public/legends/${id}/full.webp`), base = measure(b.data, b.w, b.h);
  const report: string[] = [];
  for (const m of MOODS) {
    const path = `public/legends/${id}/full-${m}.webp`;
    const f = await raw(path), fit = measure(f.data, f.w, f.h);
    if (fit.bottom < 0 || fit.bottom - fit.head < 100) { report.push(`${m}:skip`); continue; }
    // Same standing height as the neutral pose; clamped so an odd measurement can't blow a frame up or shrink it away.
    const s = Math.min(1.3, Math.max(0.8, (base.bottom - base.head) / (fit.bottom - fit.head)));
    const scaled = await sharp(path).resize(Math.round(f.w * s), Math.round(f.h * s)).toBuffer();
    // Feet on the neutral pose's baseline, legs centred where the neutral pose's are.
    const left = Math.round(base.cx - fit.cx * s), topY = Math.round(base.bottom - fit.bottom * s);
    const crop = { left: Math.max(0, -left), top: Math.max(0, -topY) };
    const meta = await sharp(scaled).metadata();
    const width = Math.min(meta.width! - crop.left, W - Math.max(0, left)), height = Math.min(meta.height! - crop.top, H - Math.max(0, topY));
    const piece = await sharp(scaled).extract({ left: crop.left, top: crop.top, width, height }).toBuffer();
    const out = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: piece, left: Math.max(0, left), top: Math.max(0, topY) }]).webp({ quality: 88 }).toBuffer();
    writeFileSync(path, out);
    report.push(`${m}:${s.toFixed(2)}`);
  }
  console.log(`${id.padEnd(13)} ${report.join(" ")}`);
}
