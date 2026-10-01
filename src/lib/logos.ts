import "server-only";
import { readdirSync } from "node:fs";
import path from "node:path";

/** Tournament logos present in public/logos, keyed by slug (file name without extension). */
export function tournamentLogos(): Record<string, string> {
  try {
    return Object.fromEntries(
      readdirSync(path.join(process.cwd(), "public/logos"))
        .filter((f) => /\.(svg|png|webp)$/i.test(f))
        .map((f) => [f.replace(/\.[^.]+$/, ""), `/logos/${f}`]),
    );
  } catch {
    return {};
  }
}
