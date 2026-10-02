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
  // NAMELESS=1 describes the character without the real person's name: the model sometimes refuses named people
  // (IMAGE_OTHER), and the portrait already carries the likeness.
  const who = process.env.NAMELESS ? "this cartoon cricketer" : l.name;
  // A green kit (Bangladesh, Pakistan, South Africa) on a green screen loses its shirt to the keying and the green
  // clean-up: those are drawn on magenta, and only the green-screen ones get the green-spill pass.
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(l.kit.shirt.slice(i, i + 2), 16));
  const greenKit = g > r + 20 && g > b + 10;
  const [bgName, bgHex] = greenKit ? ["magenta", "#FF00FF"] : ["green", "#00FF00"];
  const prompt = `Image 1 is a portrait of ${process.env.NAMELESS ? "a cartoon cricketer" : `the cricketer ${l.name}`} in our game's art style. Image 2 is our full-body game character render (style, proportions, rendering quality and framing reference only).
Draw ${who} as a full-body character exactly in the style of image 2: slightly chibi proportions, confident relaxed stance, holding a plain unbranded bat vertically with its toe on the ground.
Keep his/her exact face, hair and facial hair from image 1, NO helmet so the face is visible. Wearing a plain long-sleeved cricket shirt in ${l.kit.shirt} with ${l.kit.trim} trim${l.number ? ` and the number ${l.number}` : " with no number or text on it"}, white trousers, white pads and gloves, spiked shoes.
The whole figure, head to shoes and the full bat, must fit with a wide empty margin, centred. Background: one flat solid pure ${bgName} ${bgHex}, no shadow, no ground, no text, no logos, crests, badges or flags.`;
  const img = await image([await png(face), await png("public/hero/india.webp"), { text: prompt }]);
  const cut = await keyed(img);
  writeFileSync(`public/legends/${l.id}/full.webp`, await sharp(greenKit ? cut : await cleanShadow(cut)).webp({ quality: 90 }).toBuffer());
  console.log(`✓ ${l.id}`);
}

const ids = process.argv.slice(2);
await pool(LEGENDS.filter((l) => (!ids.length || ids.includes(l.id)) && (process.env.FORCE || !existsSync(`public/legends/${l.id}/full.webp`))), 3, async (l: Legend) => {
  try { await make(l); } catch (e) { console.log(`✗ ${l.id}: ${(e as Error).message.slice(0, 160)}`); }
});

// Record which legends have a full-body render, so the home screen uses it.
writeFileSync("src/content/legend-full.json", JSON.stringify(readdirSync("public/legends").filter((id) => existsSync(`public/legends/${id}/full.webp`)).sort()));
