// Premium full-body batter for the home screen, one per kit colour (helmeted, so it suits every player).
// Usage: pnpm hero-art [jersey ...]   Output: public/hero/<jersey>.webp (transparent background, 600×1000).
import { image, pool } from "./genai.mts";
import { cleanShadow, keyed } from "./hero-clean.mts";
import sharp from "sharp";
import { JERSEYS } from "../src/lib/avatar";

const prompt = (shirt: string) => `Premium mobile-game character render, full body, of a cartoon cricket batter standing upright in a relaxed, confident pose,
holding the bat vertically with its toe resting on the ground beside the right foot, facing the viewer, slightly chibi proportions (big head) like a polished Clash Royale / GeoGuessr avatar.
Wearing a completely plain cricket helmet (no badge, no emblem, no logo anywhere on it) with a steel face grille, a plain cricket shirt in colour #${shirt} with long sleeves, white trousers,
white batting pads and gloves, spiked shoes. Clean bold outlines, rich soft shading, warm rim light, very high quality.
The whole figure, helmet to shoes and the full bat, must fit inside the frame with a wide empty margin on every side, centred. Background: one perfectly flat solid pure green #00FF00 fill edge to edge, no gradient, no vignette, no shadow,
no ground, no text. Absolutely no logos, crests, badges, emblems or sponsor marks on the helmet, shirt, bat or pads.`;

const pick = process.argv.slice(2);
await pool(Object.entries(JERSEYS).filter(([k]) => !pick.length || pick.includes(k)), 5, async ([key, j]: [string, { shirt: string }]) => {
  try { await sharp(await cleanShadow(await keyed(await image(prompt(j.shirt))))).toFile(`public/hero/${key}.webp`); console.log(`✓ ${key}`); }
  catch (e) { console.log(`✗ ${key}: ${(e as Error).message.slice(0, 160)}`); }
});
