// Builds the home-screen pose set for each legend so the character stands in one place and only the pose changes:
//   public/legends/<id>/pose-idle.webp, pose-<mood>.webp (600×1000, transparent)
// pose-idle is the neutral render (full.webp) with headroom above it, so a raised bat never clips. Each mood frame is
// registered to it: scale and horizontal position by matching the FACE (the one thing that's identical in every pose:
// grey-level template match over a range of scales), and the feet pinned to the same baseline.
// Pure re-layout, no generation. Sources: full.webp + full-<mood>.webp (or --from=<dir> for the mood originals).
// Usage: npx tsx scripts/legend-moods-align.mts [--from=<dir>] [id ...]
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

export const MOODS = ["happy", "celebrate", "sad", "shocked", "nervous"];
export const W = 600, H = 1000;
export const HEADROOM = 0.82; // the neutral figure fills 82% of the frame height: room for bats and arms raised above the head

type Img = { a: Uint8Array; g: Uint8Array; w: number; h: number };
/** Alpha and grey channels at the given size. */
async function load(input: string | Buffer, w?: number, h?: number): Promise<Img> {
  let s = sharp(input).ensureAlpha();
  if (w && h) s = s.resize(w, h, { fit: "fill" });
  const { data, info } = await s.raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height, a = new Uint8Array(n), g = new Uint8Array(n);
  for (let i = 0; i < n; i++) { a[i] = data[i * 4 + 3]; g[i] = (data[i * 4] * 3 + data[i * 4 + 1] * 6 + data[i * 4 + 2]) / 10; }
  return { a, g, w: info.width, h: info.height };
}
export function feet(m: Img) { for (let y = m.h - 1; y >= 0; y--) for (let x = 0; x < m.w; x++) if (m.a[y * m.w + x] > 80) return y; return -1; }
function topRow(m: Img) { for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.a[y * m.w + x] > 80) return y; return -1; }
/** The face box of the neutral render: from just under the crown down 13% of the figure, ±10% of the width around the
 * body's centre line (median x of the torso band). Hair tops and buns are skipped: the box starts 3% below the crown. */
export function faceBox(m: Img) {
  const top = topRow(m), bot = feet(m), xs: number[] = [];
  for (let y = Math.round(top + (bot - top) * 0.35); y <= Math.round(top + (bot - top) * 0.6); y += 2) for (let x = 0; x < m.w; x++) if (m.a[y * m.w + x] > 80) xs.push(x);
  const cx = xs.sort((p, q) => p - q)[xs.length >> 1] ?? m.w / 2;
  let crown = top; // crown over the centre line (a raised bat or arm off to the side is ignored)
  outer: for (let y = top; y < bot; y++) for (let x = Math.max(0, Math.round(cx - m.w * 0.08)); x <= Math.min(m.w - 1, Math.round(cx + m.w * 0.08)); x++) if (m.a[y * m.w + x] > 80) { crown = y; break outer; }
  const fh = bot - crown, y0 = Math.round(crown + fh * 0.03), y1 = Math.round(crown + fh * 0.16);
  const half = Math.round(m.w * 0.1);
  return { x0: Math.max(0, Math.round(cx - half)), x1: Math.min(m.w - 1, Math.round(cx + half)), y0, y1, cx, crown };
}
/** Normalised cross-correlation of the template (grey, only where opaque) against the image at offset (ox, oy). */
function ncc(t: Img, box: { x0: number; x1: number; y0: number; y1: number }, f: Img, ox: number, oy: number) {
  let n = 0, st = 0, sf = 0, stt = 0, sff = 0, stf = 0;
  for (let y = box.y0; y <= box.y1; y += 2) for (let x = box.x0; x <= box.x1; x += 2) {
    const ti = y * t.w + x; if (t.a[ti] < 128) continue;
    const fx = x + ox, fy = y + oy; if (fx < 0 || fy < 0 || fx >= f.w || fy >= f.h) { n++; stt += t.g[ti] * t.g[ti]; st += t.g[ti]; continue; }
    const fi = fy * f.w + fx, tv = t.g[ti], fv = f.a[fi] < 128 ? 0 : f.g[fi];
    n++; st += tv; sf += fv; stt += tv * tv; sff += fv * fv; stf += tv * fv;
  }
  if (n < 50) return -1;
  const cov = stf - (st * sf) / n, vt = stt - (st * st) / n, vf = sff - (sf * sf) / n;
  return vt > 0 && vf > 0 ? cov / Math.sqrt(vt * vf) : -1;
}
/** Place a mood frame on the neutral one: scale so feet→crown height matches, head centre over the same x, feet on the
 * same baseline. Returns where to draw it and a check of how well the faces then line up (normalised correlation). */
async function place(base: Img, box: ReturnType<typeof faceBox>, baseFeet: number, src: string, k: number) {
  const meta = await sharp(src).metadata();
  const f1 = await load(src, Math.round(meta.width! * k), Math.round(meta.height! * k));
  const fb = faceBox(f1), ff = feet(f1);
  const s = Math.min(1.3, Math.max(0.8, (baseFeet - box.crown) / Math.max(1, ff - fb.crown)));
  const sw = Math.round(f1.w * s), sh = Math.round(f1.h * s);
  const left = Math.round(box.cx - fb.cx * s), top = Math.round(baseFeet - ff * s);
  const f = await load(src, sw, sh);
  return { s, sw, sh, left, top, face: ncc(base, box, f, -left, -top) };
}
/** Face agreement and drift of a finished 600×1000 frame against the neutral one. */
export async function check(baseImg: Img, frame: Img) {
  const b = faceBox(baseImg), f = faceBox(frame);
  return { face: ncc(baseImg, b, frame, 0, 0), dx: Math.abs(f.cx - b.cx), dy: Math.abs(feet(frame) - feet(baseImg)), crown: f.crown - b.crown };
}

if (process.argv[1]?.endsWith("legend-moods-align.mts")) {
  const from = process.argv.find((a) => a.startsWith("--from="))?.slice(7);
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const ids = args.length ? args : readdirSync("public/legends").filter((id) => existsSync(`public/legends/${id}/full.webp`) && MOODS.every((m) => existsSync(`public/legends/${id}/full-${m}.webp`)));
  for (const id of ids) {
    // pose-idle: the neutral render scaled to HEADROOM, feet 1% above the bottom, centred.
    const full = `public/legends/${id}/full.webp`, fm = await sharp(full).metadata();
    const k = HEADROOM, bw = Math.round(fm.width! * k), bh = Math.round(fm.height! * k);
    const bx = Math.round((W - bw) / 2), by = H - bh - Math.round(H * 0.01);
    const idle = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp(full).resize(bw, bh).toBuffer(), left: bx, top: by }]).png().toBuffer();
    writeFileSync(`public/legends/${id}/pose-idle.webp`, await sharp(idle).webp({ quality: 88 }).toBuffer());
    const base = await load(idle), box = faceBox(base), baseFeet = feet(base);
    const report: string[] = [];
    for (const m of MOODS) {
      const src = from && existsSync(`${from}/${id}/full-${m}.webp`) ? `${from}/${id}/full-${m}.webp` : `public/legends/${id}/full-${m}.webp`;
      const p = await place(base, box, baseFeet, src, k);
      const { sw, sh, left, top } = p;
      const scaled = await sharp(src).resize(sw, sh, { fit: "fill" }).toBuffer();
      const cl = Math.max(0, -left), ct = Math.max(0, -top);
      const width = Math.min(sw - cl, W - Math.max(0, left)), height = Math.min(sh - ct, H - Math.max(0, top));
      const piece = await sharp(scaled).extract({ left: cl, top: ct, width, height }).toBuffer();
      const out = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: piece, left: Math.max(0, left), top: Math.max(0, top) }]).webp({ quality: 88 }).toBuffer();
      writeFileSync(`public/legends/${id}/pose-${m}.webp`, out);
      const q = await check(base, await load(out));
      report.push(`${m}:×${p.s.toFixed(2)} face ${q.face.toFixed(2)} dx${q.dx}`);
    }
    console.log(`${id.padEnd(13)} ${report.join("  ")}`);
  }
}
