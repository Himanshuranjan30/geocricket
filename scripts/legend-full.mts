// Full-body render of each legend for the home-screen globe, from their approved portrait (face) and the default
// batter render (style + pose). Output: public/legends/<id>/full.webp, transparent, feet at the bottom.
// Usage: GOOGLE_ACCOUNT=you@x.com pnpm exec tsx scripts/legend-full.mts [id ...]
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { LEGENDS, type Legend } from "../src/lib/legends";
import { image, pool } from "./genai.mts";
import { cleanShadow, keyed } from "./hero-clean.mts";

const png = async (path: string) => ({ inlineData: { mimeType: "image/png", data: (await sharp(path).flatten({ background: "#00FF00" }).png().toBuffer()).toString("base64") } });

async function make(l: Legend) {
  const face = `public/legends/${l.id}/idle.webp`;
  if (!existsSync(face)) { console.log(`- ${l.id}: no portrait yet`); return; }
  const prompt = `Image 1 is a portrait of the cricketer ${l.name} in our game's art style. Image 2 is our full-body game character render (style, proportions, rendering quality and framing reference only).
Draw ${l.name} as a full-body character exactly in the style of image 2: slightly chibi proportions, confident relaxed stance, holding a plain unbranded bat vertically with its toe on the ground.
Keep his/her exact face, hair and facial hair from image 1, NO helmet so the face is visible. Wearing a plain long-sleeved cricket shirt in ${l.kit.shirt} with ${l.kit.trim} trim${l.number ? ` and the number ${l.number}` : " with no number or text on it"}, white trousers, white pads and gloves, spiked shoes.
The whole figure, head to shoes and the full bat, must fit with a wide empty margin, centred. Background: one flat solid pure green #00FF00, no shadow, no ground, no text, no logos, crests, badges or flags.`;
  const img = await image([await png(face), await png("public/hero/india.webp"), { text: prompt }]);
  writeFileSync(`public/legends/${l.id}/full.webp`, await sharp(await cleanShadow(await keyed(img))).webp({ quality: 90 }).toBuffer());
  console.log(`✓ ${l.id}`);
}

const ids = process.argv.slice(2);
await pool(LEGENDS.filter((l) => (!ids.length || ids.includes(l.id)) && (process.env.FORCE || !existsSync(`public/legends/${l.id}/full.webp`))), 3, async (l: Legend) => {
  try { await make(l); } catch (e) { console.log(`✗ ${l.id}: ${(e as Error).message.slice(0, 160)}`); }
});

// Record which legends have a full-body render, so the home screen uses it.
writeFileSync("src/content/legend-full.json", JSON.stringify(readdirSync("public/legends").filter((id) => existsSync(`public/legends/${id}/full.webp`)).sort()));
