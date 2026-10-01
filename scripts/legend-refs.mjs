// Fetches each legend's lead Wikipedia photo (Wikimedia Commons) into content/legend-refs/, with licence and author in credits.json.
import { writeFileSync, existsSync } from "node:fs";
const UA = "Pitchmap/1.0 (avatar references; https://geocricket.app)";
const TITLES = { sachin: "Sachin Tendulkar", dhoni: "MS Dhoni", kohli: "Virat Kohli", rohit: "Rohit Sharma", kapil: "Kapil Dev", gavaskar: "Sunil Gavaskar",
  dravid: "Rahul Dravid", ganguly: "Sourav Ganguly", kumble: "Anil Kumble", sehwag: "Virender Sehwag", yuvraj: "Yuvraj Singh", bumrah: "Jasprit Bumrah",
  harbhajan: "Harbhajan Singh", mithali: "Mithali Raj", smriti: "Smriti Mandhana", warne: "Shane Warne", ponting: "Ricky Ponting", gilchrist: "Adam Gilchrist",
  mcgrath: "Glenn McGrath", perry: "Ellyse Perry", lara: "Brian Lara", richards: "Viv Richards", gayle: "Chris Gayle", wasim: "Wasim Akram", imran: "Imran Khan",
  shoaib: "Shoaib Akhtar", abd: "AB de Villiers", kallis: "Jacques Kallis", murali: "Muttiah Muralitharan", stokes: "Ben Stokes" };
const credits = {};
const strip = (h = "") => h.replace(/<[^>]+>/g, "").trim();
for (const [id, title] of Object.entries(TITLES)) {
  try {
    const q = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=name|thumbnail&pithumbsize=1024&titles=${encodeURIComponent(title)}`, { headers: { "User-Agent": UA } })).json();
    const page = Object.values(q.query.pages)[0];
    if (!page.pageimage || !page.thumbnail) { console.log(`✗ ${id}: no lead image`); continue; }
    const meta = await (await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles=File:${encodeURIComponent(page.pageimage)}`, { headers: { "User-Agent": UA } })).json();
    const m = Object.values(meta.query?.pages ?? {})[0]?.imageinfo?.[0]?.extmetadata ?? {};
    const ext = page.thumbnail.source.split(".").pop().toLowerCase().replace("jpeg", "jpg");
    const out = `content/legend-refs/${id}.${ext === "png" ? "png" : "jpg"}`;
    if (!existsSync(out)) writeFileSync(out, Buffer.from(await (await fetch(page.thumbnail.source, { headers: { "User-Agent": UA } })).arrayBuffer()));
    credits[id] = { file: page.pageimage, url: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(page.pageimage)}`, author: strip(m.Artist?.value), license: m.LicenseShortName?.value ?? "unknown" };
    console.log(`✓ ${id}: ${credits[id].license}`);
  } catch (e) { console.log(`✗ ${id}: ${e.message}`); }
  await new Promise((r) => setTimeout(r, 300));
}
writeFileSync("content/legend-refs/credits.json", JSON.stringify(credits, null, 2));
