import "server-only";
import { count, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";

const { groups, groupMembers } = schema;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L: easy to read out loud
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHABET[b % ALPHABET.length]).join("");

export async function groupByCode(code: string) {
  const db = await getDb();
  const [g] = await db.select().from(groups).where(eq(groups.code, code.toUpperCase()));
  return g ?? null;
}

export async function memberIds(groupId: string) {
  const db = await getDb();
  return new Set((await db.select({ id: groupMembers.playerId }).from(groupMembers).where(eq(groupMembers.groupId, groupId))).map((r) => r.id));
}

export async function myGroups(pid: string) {
  const db = await getDb();
  const mine = await db.select({ groupId: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.playerId, pid));
  if (!mine.length) return [];
  const ids = mine.map((m) => m.groupId);
  const rows = await db.select().from(groups).where(inArray(groups.id, ids));
  const counts = await db.select({ groupId: groupMembers.groupId, n: count() }).from(groupMembers).where(inArray(groupMembers.groupId, ids)).groupBy(groupMembers.groupId);
  const byId = new Map(counts.map((c) => [c.groupId, c.n]));
  return rows.map((g) => ({ code: g.code, name: g.name, members: byId.get(g.id) ?? 0, owner: g.createdBy === pid }));
}
