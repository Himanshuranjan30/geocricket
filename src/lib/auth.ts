import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb, schema } from "@/db";

export const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

async function create() {
  const db = await getDb();
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification } }),
    socialProviders: googleEnabled
      ? { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, prompt: "select_account" } }
      : {},
    session: { expiresIn: 60 * 60 * 24 * 365, cookieCache: { enabled: true, maxAge: 60 * 5 } }, // stay signed in for a year
    plugins: [nextCookies()],
  });
}

type Auth = Awaited<ReturnType<typeof create>>;
const g = globalThis as unknown as { __auth?: Promise<Auth> };
export const getAuth = () => (g.__auth ??= create());
