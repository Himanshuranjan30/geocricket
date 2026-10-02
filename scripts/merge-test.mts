// Checks mergeGuest(): a guest's progress joining an account that already has a player (sign-in on a second device).
// Runs against a local PGlite copy, never production:
//   PGLITE_DIR=<dir> npx tsx --conditions=react-server scripts/merge-test.mts
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { mergeGuest } from "../src/lib/server";

if (process.env.DATABASE_URL) throw new Error("Refusing to run against DATABASE_URL: this writes test rows.");
const db = await getDb();
const { players, scores, guesses, owned, whoResults, whoGuesses, duelPlayers, whoChallenges } = schema;
let failed = 0;
const ok = (c: boolean, m: string) => { console.log(c ? "✓" : "✗", m); if (!c) failed++; };
const tag = Date.now().toString(36), A = `acct-${tag}`, G = `guest-${tag}`, D1 = `t1-${tag}`, D2 = `t2-${tag}`, C = `c:test-${tag}`, W = `w-${tag}`;
const g = (pid: string, date: string, idx: number, points: number) => ({ playerId: pid, date, idx, lat: 0, lng: 0, points, km: 1, ms: 1 });

// Account: day D1 (score 400), challenge C, legend:sachin, 100 XP, a profile.
await db.insert(players).values([{ id: A, userId: `u-${tag}`, xp: 100, handle: `acct${tag}`.slice(0, 16), avatar: "accttest-india", country: "IN" }, { id: G, xp: 50, handle: `guest_${tag}`, avatar: "guesttest-gold", country: "AU" }]);
await db.insert(scores).values([{ playerId: A, date: D1, total: 400, kmTotal: 1, ms: 1 }, { playerId: G, date: D1, total: 900, kmTotal: 1, ms: 1 }, { playerId: G, date: D2, total: 700, kmTotal: 1, ms: 1 }]);
await db.insert(guesses).values([g(A, D1, 0, 80), g(G, D1, 0, 99), g(G, D1, 1, 99), g(G, D2, 0, 70), g(G, D2, 1, 70)]);
await db.insert(owned).values([{ playerId: A, itemId: "legend:sachin", via: "level", atMs: 1 }, { playerId: G, itemId: "legend:sachin", via: "purchase", atMs: 2 }, { playerId: G, itemId: "legend:dhoni", via: "level", atMs: 3 }]);
await db.insert(whoResults).values([{ playerId: A, date: C, total: 100, steps: [0] }, { playerId: G, date: C, total: 300, steps: [0] }, { playerId: G, date: W, total: 240, steps: [0, 1, 2] }]);
await db.insert(whoGuesses).values([{ playerId: G, date: W, idx: 0, step: 0, pick: "x", correct: true, atMs: 1 }, { playerId: G, date: C, idx: 0, step: 0, pick: "x", correct: true, atMs: 1 }]);
await db.insert(duelPlayers).values({ duelId: `d-${tag}`, playerId: G, joinedMs: 1 });
await db.insert(whoChallenges).values({ slug: `test-${tag}`, title: "t", hostHandle: "h", hostPlayerId: G, hostKey: "k", puzzles: [], createdMs: 1 });

await mergeGuest(G, A);

const sc = await db.select().from(scores).where(eq(scores.playerId, A));
ok(sc.find((s) => s.date === D1)?.total === 400, "a day both played keeps the account's score (400, not the guest's 900)");
ok(sc.find((s) => s.date === D2)?.total === 700, "a day only the guest played moves over (700)");
const gs = await db.select().from(guesses).where(eq(guesses.playerId, A));
ok(gs.filter((x) => x.date === D1).length === 1 && gs.filter((x) => x.date === D1)[0].points === 80, "the account's day isn't mixed with the guest's balls");
ok(gs.filter((x) => x.date === D2).length === 2, "the guest's day moves with all its balls");
const ow = (await db.select().from(owned).where(eq(owned.playerId, A))).map((o) => o.itemId).sort();
ok(ow.join() === "legend:dhoni,legend:sachin", `owned legends merged without duplicates (${ow.join()})`);
const wr = await db.select().from(whoResults).where(eq(whoResults.playerId, A));
ok(wr.find((r) => r.date === C)?.total === 100 && wr.find((r) => r.date === W)?.total === 240, "Mystery/challenge results: account's kept, guest's new ones moved");
const wg = await db.select().from(whoGuesses).where(eq(whoGuesses.playerId, A));
ok(wg.some((x) => x.date === W) && !wg.some((x) => x.date === C), "Mystery guesses follow their results");
ok((await db.select().from(duelPlayers).where(eq(duelPlayers.playerId, A))).length === 1, "1v1 seat moves to the account");
ok((await db.select().from(whoChallenges).where(eq(whoChallenges.slug, `test-${tag}`)))[0].hostPlayerId === A, "a challenge the guest hosts stays theirs");
const [acct] = await db.select().from(players).where(eq(players.id, A));
ok(acct.xp === 150, `XP adds up (100 + 50 = ${acct.xp})`);
ok(acct.handle === `acct${tag}`.slice(0, 16) && acct.country === "IN", "the account keeps its own name and country");
ok((await db.select().from(players).where(eq(players.id, G))).length === 0, "the guest player is removed");
const left = (await Promise.all([scores, guesses, owned, whoResults, whoGuesses, duelPlayers].map((t) => db.select().from(t).where(eq(t.playerId, G))))).flat();
ok(left.length === 0, `nothing left on the guest (${left.length} rows)`);
await mergeGuest(G, A);
ok((await db.select().from(players).where(eq(players.id, A)))[0].xp === 150, "running it again changes nothing");

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
