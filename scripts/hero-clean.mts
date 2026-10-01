// CLI: strip the olive ground shadow from public/hero/*. Usage: npx tsx scripts/hero-clean.mts
import { readdirSync } from "node:fs";
import sharp from "sharp";
import { cleanShadow } from "../src/lib/imageKey";
export { cleanShadow, keyed } from "../src/lib/imageKey";

if (process.argv[1]?.endsWith("hero-clean.mts")) {
  for (const f of readdirSync("public/hero")) {
    const out = await cleanShadow(`public/hero/${f}`);
    await sharp(out).toFile(`public/hero/${f}.tmp.webp`);
    await import("node:fs").then((fs) => fs.renameSync(`public/hero/${f}.tmp.webp`, `public/hero/${f}`));
    console.log("cleaned", f);
  }
}
