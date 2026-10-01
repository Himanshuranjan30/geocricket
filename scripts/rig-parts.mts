// Character engine art. One master full-body batter, then chains of one-change EDITS of it (master → skin → head →
// beard), so every variant keeps the exact pose and framing. Two flat marker colours are repainted in the browser
// (src/lib/kitPaint.ts): the shirt (and turban/hijab) in magenta #FF00FF → kit colour, hair and beard in blue #0000FF
// → hair colour. Frames are never trimmed, so all variants stay pixel-aligned (the avatar is a head crop of them).
// Usage: GOOGLE_ACCOUNT=you@x.com pnpm exec tsx --tsconfig tsconfig.json scripts/rig-parts.mts [outdir]
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { keyed } from "../src/lib/imageKey";
import { image, pool } from "./genai.mts";

const out = process.argv[2] ?? "public/rig";
mkdirSync(out, { recursive: true });
const png = (b: Buffer) => ({ inlineData: { mimeType: "image/png", data: b.toString("base64") } });
const onGreen = async (f: string) => sharp(f).flatten({ background: "#00FF00" }).png().toBuffer();
// Pad (never crop) whatever size the model returns to 3:5 on green, before keying: same geometry for every variant.
async function frame(buf: Buffer) {
  const { width: w = 0, height: h = 0 } = await sharp(buf).metadata();
  const W = Math.max(w, Math.round(h * 0.6)), H = Math.max(h, Math.round(W / 0.6));
  const x = Math.floor((W - w) / 2), y = Math.floor((H - h) / 2);
  return sharp(buf).extend({ left: x, right: W - w - x, top: y, bottom: H - h - y, background: "#00FF00" }).png().toBuffer();
}
// The whole figure must be in frame: transparent rows under the shoes and above the head.
async function framed(webp: Buffer) {
  const { data, info } = await sharp(webp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rowOpaque = (y: number) => { for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 20) return true; return false; };
  return !rowOpaque(info.height - 12) && !rowOpaque(8);
}
const render = async (parts: object[]) => keyed(await frame(await image(parts)), false);

const MASTER = `Premium mobile-game character render of a cartoon cricket batter, FULL BODY from the top of the head down to BELOW
THE SHOES: both shoes completely visible with clear empty space under them, and empty space above the head. Relaxed, confident
stance facing the viewer, holding a plain unbranded bat vertically with its toe on the ground beside the right foot. Slightly chibi
(big head), polished 3D cartoon style, soft shading, warm rim light — exactly the style of the reference image. NO helmet, NO cap.
Friendly neutral face, clean-shaven, medium brown skin, dark eyebrows. Short neat hair coloured flat pure blue #0000FF (a marker
colour that will be recoloured later). LONG-sleeved cricket shirt with a collar in flat pure magenta #FF00FF (marker colour), white
trousers, white pads and gloves, white spiked shoes. The figure fills about 85% of the image height, centred. Background: flat solid
pure green #00FF00, no shadow, no ground, no text, no logos.`;

const EDIT = (change: string) => `Edit this image. Change ONLY this: ${change}. Keep EVERYTHING else identical: exact same pose,
position, size and framing (whole body, both shoes visible), camera, lighting, LONG-sleeved magenta #FF00FF shirt (sleeves full
length to the wrists), bat, pads, gloves, shoes, background. Hair and any beard stay the flat blue #0000FF marker colour.
Do not move, crop or resize anything.`;

// "medium" is the master and came out fair; "wheat" sits between it and tan. (A "light" edit came out the same as the
// master and was dropped.)
const SKINS: Record<string, string | null> = { medium: null, wheat: "skin tone to a warm wheatish light-brown, noticeably darker than now but lighter than tan", tan: "skin tone to tan/light brown", brown: "skin tone to rich brown", deep: "skin tone to deep dark brown" };
const HEADS: Record<string, string | null> = {
  short: null,
  curly: "hair to short curly hair (still flat blue #0000FF)",
  long: "hair to shoulder-length straight hair (still flat blue #0000FF)",
  bun: "hair to hair tied in a neat top bun (still flat blue #0000FF)",
  bald: "hair to a very short shaved buzz cut (still flat blue #0000FF)",
  turban: "hair to a neat plain Sikh turban (patka style) in flat magenta #FF00FF covering the hair",
  hijab: "hair to a plain sports hijab in flat magenta #FF00FF covering the hair and neck only — the whole face stays visible",
};
const BEARD = "face to have a short, neat full beard in the same flat blue #0000FF marker colour";

const has = (n: string) => existsSync(`${out}/${n}.webp`);
const edit = async (from: string, change: string, name: string) => {
  if (has(name)) return;
  for (let t = 0; t < 3; t++) {
    try {
      const w = await render([png(await onGreen(`${out}/${from}.webp`)), { text: EDIT(change) }]);
      if (!(await framed(w)) && t < 2) { console.log("↻ cropped", name); continue; }
      writeFileSync(`${out}/${name}.webp`, w); console.log("✓", name); return;
    } catch (e) { console.log("✗", name, String(e).slice(0, 120)); }
  }
};

if (!has("medium-short-0")) {
  for (let t = 0; t < 2 && !has("medium-short-0"); t++) {
    const w = await render([png(await sharp(await onGreen("public/hero/india.webp")).extend({ top: 140, bottom: 200, left: 220, right: 220, background: "#00FF00" }).png().toBuffer()), { text: MASTER }]);
    writeFileSync(`/private/tmp/claude-502/master-try-${t}.webp`, w);
    if (await framed(w)) writeFileSync(`${out}/medium-short-0.webp`, w); else console.log("↻ master cropped, retrying");
  }
  console.log(has("medium-short-0") ? "✓ master" : "✗ master");
}
if (process.argv.includes("master")) process.exit(0);
// 1. skins, 2. heads on each skin, 3. beards on each (skin, head) — hijab has no beard variant.
await pool(Object.entries(SKINS).filter(([, c]) => c), 3, async ([s, c]) => edit("medium-short-0", c!, `${s}-short-0`));
const bases = Object.keys(SKINS).filter((s) => has(`${s}-short-0`));
await pool(bases.flatMap((s) => Object.entries(HEADS).filter(([, c]) => c).map(([h, c]) => [s, h, c!] as const)), 3, async ([s, h, c]) => edit(`${s}-short-0`, c, `${s}-${h}-0`));
await pool(bases.flatMap((s) => Object.keys(HEADS).filter((h) => h !== "hijab" && has(`${s}-${h}-0`)).map((h) => [s, h] as const)), 3, async ([s, h]) => edit(`${s}-${h}-0`, BEARD, `${s}-${h}-1`));
const all = bases.flatMap((s) => Object.keys(HEADS).flatMap((h) => h === "hijab" ? [`${s}-${h}-0`] : [`${s}-${h}-0`, `${s}-${h}-1`]));
console.log(`done: ${all.filter(has).length}/${all.length}; missing: ${all.filter((n) => !has(n)).join(" ") || "none"}`);
