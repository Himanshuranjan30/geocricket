import * as schema from "./schema";

// Neon in production (DATABASE_URL set), embedded PGlite for local dev with zero setup.
async function create() {
  if (process.env.DATABASE_URL) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle(neon(process.env.DATABASE_URL), { schema });
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  return drizzle(new PGlite(process.env.PGLITE_DIR ?? ".pglite"), { schema });
}

type DB = Awaited<ReturnType<typeof create>>;
const g = globalThis as unknown as { __db?: Promise<DB> };
export const getDb = () => (g.__db ??= create());
export { schema };
