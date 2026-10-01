// Applies a hand-written SQL migration (additive, idempotent) to the local PGlite or, with DATABASE_URL, to Neon.
// Usage: node scripts/migrate.mjs scripts/migrations/<file>.sql   ·   node --env-file=.env.neon scripts/migrate.mjs <file>
import { readFileSync } from "node:fs";
const statements = readFileSync(process.argv[2], "utf8").split(/;\s*$/m).map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean);
if (process.env.DATABASE_URL) {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);
  for (const s of statements) await sql.query(s);
} else {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(process.env.PGLITE_DIR ?? ".pglite");
  for (const s of statements) await db.query(s);
  await db.close();
}
console.log(`Applied ${statements.length} statements from ${process.argv[2]}`);
