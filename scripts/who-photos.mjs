// Fetches a portrait for every player in the Who's the Player? pool: the lead image of their English Wikipedia page,
// kept only when the page is about a cricketer and the image lives on Wikimedia Commons (freely licensed). Saves a
// small thumbnail to public/players/<id>.jpg and the author/licence to src/content/who-photos.json for the credits page.
// Usage: node scripts/who-photos.mjs   (re-run safe: existing photos are kept, missing ones retried)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const UA = "GeoCricket/1.0 (player portraits; https://geocricket.app)";
const OUT = "public/players", CREDITS = "src/content/who-photos.json";
mkdirSync(OUT, { recursive: true });
const { players } = JSON.parse(readFileSync("src/content/who.json", "utf8"));
const credits = existsSync(CREDITS) ? JSON.parse(readFileSync(CREDITS, "utf8")) : {};
const strip = (h = "") => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
async function get(url) {
  for (let t = 0; t < 4; t++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.ok) return r.json();
    await new Promise((res) => setTimeout(res, 1500 * (t + 1))); // rate-limited: back off and retry
  }
  throw new Error("Wikipedia kept refusing");
}

async function lead(title) {
  const q = await get(`https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages|description&piprop=name|thumbnail&pithumbsize=256&titles=${encodeURIComponent(title)}`);
  const page = Object.values(q.query?.pages ?? {})[0];
  return page && !("missing" in page) ? page : null;
}

async function one(p) {
  if (credits[p.id] && existsSync(`${OUT}/${p.id}.jpg`)) return "kept";
  // The plain name first, then the "(cricketer)" page that disambiguates common names.
  let page = null;
  const parts = p.name.split(/\s+/), short = parts.length > 2 ? `${parts[0]} ${parts.at(-1)}` : null; // Cricsheet's full names vs Wikipedia titles
  for (const title of [p.name, `${p.name} (cricketer)`, ...(short ? [short, `${short} (cricketer)`] : [])]) {
    const pg = await lead(title);
    if (pg && /cricket/i.test(pg.description ?? "")) { page = pg; break; }
  }
  if (!page?.pageimage || !page.thumbnail) return "no photo";
  const meta = await get(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles=File:${encodeURIComponent(page.pageimage)}`);
  const file = Object.values(meta.query?.pages ?? {})[0];
  const m = file?.imageinfo?.[0]?.extmetadata;
  if (!m || "missing" in file) return "not on Commons (skipped: may not be freely licensed)";
  const license = m.LicenseShortName?.value ?? "";
  if (!license || /fair use|non-free/i.test(license)) return `licence not free (${license})`;
  const img = await fetch(page.thumbnail.source, { headers: { "User-Agent": UA } });
  if (!img.ok) return `download ${img.status}`;
  writeFileSync(`${OUT}/${p.id}.jpg`, Buffer.from(await img.arrayBuffer()));
  credits[p.id] = { name: p.name, file: page.pageimage, url: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(page.pageimage)}`, author: strip(m.Artist?.value) || "unknown", license };
  return "ok";
}

const tally = {};
for (let i = 0; i < players.length; i += 2) {
  const batch = players.slice(i, i + 2);
  const res = await Promise.all(batch.map((p) => one(p).catch((e) => `error ${e.message}`)));
  res.forEach((r) => { const k = r.startsWith("licence") || r.startsWith("download") || r.startsWith("error") ? r.split(" ")[0] : r; tally[k] = (tally[k] ?? 0) + 1; });
  await new Promise((r) => setTimeout(r, 400));
}
writeFileSync(CREDITS, JSON.stringify(credits, null, 1));
console.log(`photos: ${Object.keys(credits).length}/${players.length}`, tally);
