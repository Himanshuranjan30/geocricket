// Generates the animated-avatar art for each legend from a reference photo you have rights to.
//   1. Put photos in content/legend-refs/<id>.jpg (clear, front-facing face; id from src/lib/legends.ts).
//   2. pnpm legend-art [id ...]      (all legends with a photo if no ids given)
// Output: public/legends/<id>/<mood>.webp, 512×512. The idle portrait is made from the photo; every other mood is made
// from that portrait, so the character stays consistent. Then set `art: true` on the legend in src/lib/legends.ts.
// Uses Gemini image generation on Vertex AI (project pitchmap-510208). Auth: gcloud ADC, or GOOGLE_OAUTH_TOKEN.
import { image, pool } from "./genai.mts";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { Toon } from "../src/components/Toon";
import { LEGENDS, type Legend } from "../src/lib/legends";

const STYLE = `Premium detailed caricature portrait for a cricket game avatar: the person must be instantly recognisable,
with their exact face shape, eyes, nose, jaw, eyebrows, hairline, hairstyle, facial hair, skin tone and age from the photo.
Clean bold dark outlines, rich cel shading, slightly enlarged head, warm friendly energy.
Framing and palette exactly like the format reference: head and shoulders, centred, on a circular deep-indigo badge.
Plain cricket shirt only. No logos, crests, badges, sponsor marks, watermark or text except the shirt number.`;

const MOODS: Record<string, string> = {
  happy: "smiling warmly, pleased",
  celebrate: "ecstatic, shouting in celebration with mouth wide open, fist raised",
  sad: "disappointed, eyes down, slight frown",
  shocked: "shocked, eyes wide, mouth open in an O",
  nervous: "nervous, biting lip, a bead of sweat on the forehead, glancing sideways",
};

// Crop to our round badge so stray background corners never show.
const CIRCLE = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><circle cx="256" cy="256" r="256"/></svg>');
const save = async (buf: Buffer, path: string) =>
  sharp(await sharp(buf).resize(512, 512, { fit: "cover" }).toBuffer()).composite([{ input: CIRCLE, blend: "dest-in" }]).webp({ quality: 88 }).toFile(path);

async function make(l: Legend) {
  const ref = ["jpg", "jpeg", "png", "webp"].map((e) => `content/legend-refs/${l.id}.${e}`).find(existsSync);
  if (!ref) { console.log(`- ${l.id}: no reference photo, skipped`); return; }
  const dir = `public/legends/${l.id}`; mkdirSync(dir, { recursive: true });
  const photo = { inlineData: { mimeType: ref.endsWith("png") ? "image/png" : ref.endsWith("webp") ? "image/webp" : "image/jpeg", data: readFileSync(ref).toString("base64") } };
  const kit = `wearing a cricket jersey in ${l.kit.shirt} with ${l.kit.trim} trim${l.number ? ` and the number ${l.number} small on the chest` : ", with no number or text anywhere on the shirt"}`;

  const svg = renderToStaticMarkup(createElement(Toon, { legend: { ...l, art: false }, size: 512 })).replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  const format = { inlineData: { mimeType: "image/png", data: (await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64") } };
  const prompt = `Image 1 is a photo of ${l.name}. Image 2 is our avatar FORMAT reference (frame, palette, outline weight only; ignore its face).
Draw ${l.name} from image 1, ${kit}. Calm, confident, friendly expression. ${STYLE}`;
  // A few candidates for the look you approve; the first is used unless you pick another (pnpm legend-art <id> --pick N).
  const pick = Number(process.argv.find((a) => a.startsWith("--pick="))?.slice(7) ?? 0);
  const n = Number(process.env.CANDIDATES ?? 1);
  let idle: Buffer | undefined;
  for (let i = 0; i < n; i++) {
    const img = await image([photo, format, { text: prompt }]);
    await save(img, `${dir}/candidate-${i}.webp`);
    if (i === pick) idle = img;
  }
  if (process.env.CANDIDATES_ONLY) { console.log(`✓ ${l.id}: ${n} candidates`); return; }
  await save(idle!, `${dir}/idle.webp`);
  const base = { inlineData: { mimeType: "image/png", data: (await sharp(idle!).png().toBuffer()).toString("base64") } };
  await Promise.all(Object.entries(MOODS).map(async ([mood, how]) => {
    const img = await image([base, { text: `Same character, same art style, same framing, same outfit and background. Change only the expression and pose: ${how}.` }]);
    await save(img, `${dir}/${mood}.webp`);
  }));
  console.log(`✓ ${l.id}`);
}

const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const todo = LEGENDS.filter((x) => !ids.length || ids.includes(x.id))
  .filter((x) => process.env.FORCE || !["idle", ...Object.keys(MOODS)].every((m) => existsSync(`public/legends/${x.id}/${m}.webp`)));
await pool(todo, 2, async (l: Legend) => {
  try { await make(l); } catch (e) { console.log(`✗ ${l.id}: ${(e as Error).message.slice(0, 200)}`); }
});

// Record which legends now have a full set of art, so the game uses it.
const done = readdirSync("public/legends").filter((id) => ["idle", ...Object.keys(MOODS)].every((m) => existsSync(`public/legends/${id}/${m}.webp`)));
writeFileSync("src/content/legend-art.json", JSON.stringify(done.sort()));
