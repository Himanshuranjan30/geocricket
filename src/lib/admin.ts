import "server-only";
import { sessionUser } from "./server";

/** Signed-in Google account listed in ADMIN_EMAILS (comma separated). */
export async function isAdmin() {
  const u = await sessionUser();
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !!u?.email && list.includes(u.email.toLowerCase());
}
