import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { levelOf } from "./level";
import { LEGEND_BY_ID, LEGENDS } from "./legends";

const { owned, players } = schema;

export async function playerLevel(pid: string) {
  const db = await getDb();
  const [row] = await db.select({ xp: players.xp }).from(players).where(eq(players.id, pid));
  return levelOf(row?.xp ?? 0).level;
}

export async function ownedItems(pid: string) {
  const db = await getDb();
  return new Set((await db.select({ id: owned.itemId }).from(owned).where(eq(owned.playerId, pid))).map((r) => r.id));
}

export async function grant(pid: string, itemId: string, via: "level" | "purchase" | "reward") {
  const db = await getDb();
  await db.insert(owned).values({ playerId: pid, itemId, via, atMs: Date.now() }).onConflictDoNothing();
}

/** Can this player wear legend `id`? Owned, or their level has reached it (then it's granted for good). */
export async function canWear(pid: string, id: string) {
  const l = LEGEND_BY_ID.get(id);
  if (!l) return false;
  const db = await getDb();
  const [row] = await db.select({ id: owned.itemId }).from(owned).where(and(eq(owned.playerId, pid), eq(owned.itemId, `legend:${id}`)));
  if (row) return true;
  if ((await playerLevel(pid)) >= l.level) { await grant(pid, `legend:${id}`, "level"); return true; }
  return false;
}

/** Every legend with this player's state, for the locker. */
export async function lockerFor(pid: string | null) {
  const db = await getDb();
  const [have, level, paid] = pid ? await Promise.all([ownedItems(pid), playerLevel(pid),
    db.select({ id: owned.itemId }).from(owned).where(and(eq(owned.playerId, pid), inArray(owned.via, ["purchase", "reward"])))]) : [new Set<string>(), 1, []];
  const bought = new Set(paid.map((r) => r.id)); // bought or won: what the home-screen switcher offers
  return {
    level,
    legends: LEGENDS.map((l) => ({ ...l, owned: have.has(`legend:${l.id}`) || level >= l.level, bought: bought.has(`legend:${l.id}`) })),
  };
}
