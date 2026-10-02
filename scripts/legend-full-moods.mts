// Full-body art per mood for the home-screen figure, made from each legend's approved full-body render (same character,
// only the face and pose change). Output: public/legends/<id>/full-<mood>.webp; ids with all five go in
// src/content/legend-full-moods.json so the home figure uses them.
// Usage: GEMINI_API_KEY=… npx tsx --tsconfig tsconfig.json scripts/legend-full-moods.mts [id ...]   (FORCE=1 to redo)
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { LEGENDS, type Legend } from "../src/lib/legends";
import { image, pool } from "./genai.mts";
import { cleanShadow, keyed } from "./hero-clean.mts";

const MOODS: Record<string, string> = {
  happy: "a gentle, friendly smile, standing relaxed",
  celebrate: "ecstatic, shouting in celebration with mouth wide open, bat raised high in one hand",
  sad: "disappointed, head slightly down, eyes lowered, small frown, shoulders slumped",
  shocked: "shocked, eyes wide, mouth open in an O, leaning back slightly",
  nervous: "nervous, biting lip, a bead of sweat on the forehead, glancing sideways",
};

async function make(l: Legend) {
  const src = `public/legends/${l.id}/full.webp`;
  if (!existsSync(src)) { console.log(`- ${l.id}: no full-body render yet`); return; }
  // Green kits (Bangladesh, Pakistan, South Africa) are drawn on magenta, so keying never eats the shirt.
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(l.kit.shirt.slice(i, i + 2), 16));
  const greenKit = g > r + 20 && g > b + 10;
  const [bgName, bgHex, bg] = greenKit ? ["magenta", "#FF00FF", { r: 255, g: 0, b: 255 }] : ["green", "#00FF00", { r: 0, g: 255, b: 0 }];
  const base = { inlineData: { mimeType: "image/png", data: (await sharp(src).flatten({ background: bg }).png().toBuffer()).toString("base64") } };
  await Promise.all(Object.entries(MOODS).map(async ([mood, how]) => {
    const out = `public/legends/${l.id}/full-${mood}.webp`;
    if (existsSync(out) && !process.env.FORCE) return;
    const img = await image([base, { text: `Same cartoon cricketer, same art style, same proportions, same outfit, same bat, same size and framing (whole figure, head to shoes, with a wide margin). Change only the facial expression and body pose: ${how}. Background: one flat solid pure ${bgName} ${bgHex}, no shadow, no ground, no text, no logos.` }]);
    const cut = await keyed(img);
    writeFileSync(out, await sharp(greenKit ? cut : await cleanShadow(cut)).webp({ quality: 88 }).toBuffer());
  }));
  console.log(`✓ ${l.id}`);
}

const ids = process.argv.slice(2);
const todo = LEGENDS.filter((l) => (!ids.length || ids.includes(l.id)) && (process.env.FORCE || !Object.keys(MOODS).every((m) => existsSync(`public/legends/${l.id}/full-${m}.webp`))));
await pool(todo, 3, async (l: Legend) => { try { await make(l); } catch (e) { console.log(`✗ ${l.id}: ${(e as Error).message.slice(0, 160)}`); } });

const done = readdirSync("public/legends").filter((id) => Object.keys(MOODS).every((m) => existsSync(`public/legends/${id}/full-${m}.webp`)));
writeFileSync("src/content/legend-full-moods.json", JSON.stringify(done.sort()));
console.log(`full-body moods: ${done.length} legends`);
