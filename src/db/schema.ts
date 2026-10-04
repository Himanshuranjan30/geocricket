import { sql } from "drizzle-orm";
import type { CupState } from "../lib/cup";
import type { LiveState } from "../lib/live";
import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const questions = pgTable("questions", {
  id: text("id").primaryKey(), // slug, also the SEO page path
  text: text("text").notNull(),
  answer: text("answer").notNull(), // e.g. "Kingsmead, Durban"
  when: text("when_text").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  scaleKm: integer("scale_km").notNull(),
  story: text("story").notNull(),
  source: text("source").notNull(),
  region: text("region").notNull(), // india | global
  // Each question lives in exactly one pool for life, so it can never show up in two modes.
  pool: text("pool").notNull().default("nets"), // daily | edition | nets | versus
  status: text("status").notNull().default("live"), // live | queued (imported, released 100/day) | pending (awaiting review) | rejected
  origin: text("origin").notNull().default("manual"), // manual | ai | cricsheet
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Every question a player has been shown (text revealed), in any mode. Used so nobody ever sees a repeat.
export const seen = pgTable(
  "seen",
  {
    playerId: text("player_id").notNull(),
    questionId: text("question_id").notNull(),
    mode: text("mode").notNull(),
    atMs: bigint("at_ms", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.questionId] })],
);

// A playable set of questions. `date` is the key: YYYY-MM-DD (IST) for dailies, a slug like "match-ind-nz-t20-1"
// or "test-2026-10-03" for Match Day and weekend Test Match editions. Guesses/scores/starts reuse the same key.
export const rounds = pgTable("rounds", {
  date: text("date").primaryKey(),
  questionIds: jsonb("question_ids").$type<string[]>().notNull(),
  kind: text("kind").notNull().default("daily"), // daily | match | test
  title: text("title"), // editions only, e.g. "India v New Zealand · 1st T20I"
  mults: jsonb("mults").$type<number[]>(), // per-question multipliers; null = MULTIPLIERS
  opensMs: bigint("opens_ms", { mode: "number" }), // editions: playable window (epoch ms)
  closesMs: bigint("closes_ms", { mode: "number" }),
});

export const players = pgTable(
  "players",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").unique(), // set once the player signs in with Google
    handle: text("handle"), // shown on leaderboards; unique ignoring case
    avatar: text("avatar"), // "<seed>-<jersey>", see lib/avatar.ts
    country: text("country"), // ISO 3166-1 alpha-2
    customAvatar: text("custom_avatar"), // the player's own character, kept while they wear a legend
    onboardedMs: bigint("onboarded_ms", { mode: "number" }),
    offerStartMs: bigint("offer_start_ms", { mode: "number" }), // one-time first-purchase offer, valid 72h from first shown // signed-in player finished first-time setup (character + legends)
    rating: integer("rating").notNull().default(1200), // Elo from live 1v1 and cup matches (signed-in pairs only); seeds cups
    xp: integer("xp").notNull().default(0), // earned from every scored point in any mode; drives levels and legend unlocks
    ageConfirmedMs: bigint("age_confirmed_ms", { mode: "number" }), // player confirmed they're 18+ (setup, or before a purchase)
    leagueTier: integer("league_tier").notNull().default(0), // weekly league tier (lib/league.ts), moved by the Monday settlement
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("players_handle_lower").on(sql`lower(${t.handle})`)],
);

export const guesses = pgTable(
  "guesses",
  {
    playerId: text("player_id").notNull(),
    date: text("date").notNull(),
    idx: integer("idx").notNull(),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    points: integer("points").notNull(),
    km: real("km").notNull(),
    ms: integer("ms").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.date, t.idx] })], // one guess per question per day
);

// When each daily question was first shown to a player: the server-side shot clock. First start wins, so refreshing never resets it.
export const starts = pgTable(
  "starts",
  {
    playerId: text("player_id").notNull(),
    date: text("date").notNull(),
    idx: integer("idx").notNull(),
    startedMs: bigint("started_ms", { mode: "number" }).notNull(), // epoch ms from the server clock; no timezone to get wrong
  },
  (t) => [primaryKey({ columns: [t.playerId, t.date, t.idx] })],
);

export const scores = pgTable(
  "scores",
  {
    playerId: text("player_id").notNull(),
    date: text("date").notNull(),
    total: integer("total").notNull(),
    kmTotal: real("km_total").notNull(),
    ms: integer("ms").notNull(),
    flagged: boolean("flagged").notNull().default(false), // hidden from others' leaderboards (see isSuspicious)
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.date] })], // one daily score per player
);

// ---- Better Auth (Google sign-in). Column names follow Better Auth's core schema. ----
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---- Groups: private leaderboards for WhatsApp groups, offices, colleges ----
export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(), // invite code in /g/<code>
  name: text("name").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: text("group_id").notNull(),
    playerId: text("player_id").notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.playerId] })],
);

// ---- Duels: async friend challenges and live 1v1 ----
export const duels = pgTable("duels", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(), // async | live
  questionIds: jsonb("question_ids").$type<string[]>().notNull(),
  createdBy: text("created_by").notNull(),
  status: text("status").notNull().default("open"), // open (waiting for opponent) | playing | done
  quick: boolean("quick").notNull().default(false), // live: listed for random matchmaking
  state: jsonb("state").$type<LiveState>(),
  createdAt: bigint("created_ms", { mode: "number" }).notNull(),
  // Cup matches (kind "cup"): which fixture of which cup this is. Unique per fixture, so ticks can't double-create.
  cupId: text("cup_id"),
  cupRound: integer("cup_round"),
  cupSlot: integer("cup_slot"),
  ghostOf: text("ghost_of"), // Ghost Race: the closed round whose recorded run the creator's side replays
}, (t) => [uniqueIndex("duels_cup_fixture").on(t.cupId, t.cupRound, t.cupSlot)]);

export const duelPlayers = pgTable(
  "duel_players",
  {
    duelId: text("duel_id").notNull(),
    playerId: text("player_id").notNull(),
    total: integer("total").notNull().default(0),
    joinedMs: bigint("joined_ms", { mode: "number" }).notNull(),
    lastSeenMs: bigint("last_seen_ms", { mode: "number" }), // last time this player opened the match (cup walkovers)
  },
  (t) => [primaryKey({ columns: [t.duelId, t.playerId] })],
);

export const duelGuesses = pgTable(
  "duel_guesses",
  {
    duelId: text("duel_id").notNull(),
    playerId: text("player_id").notNull(),
    idx: integer("idx").notNull(),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    points: integer("points").notNull(),
    km: real("km").notNull(),
    atMs: bigint("at_ms", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.duelId, t.playerId, t.idx] })],
);

// Legends a player owns, and how they got them (level unlock or purchase).
export const owned = pgTable(
  "owned",
  {
    playerId: text("player_id").notNull(),
    itemId: text("item_id").notNull(), // "legend:<id>", or "save:<day>" for a streak saved with a rewarded ad
    via: text("via").notNull(), // level | purchase | reward
    atMs: bigint("at_ms", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.itemId] })],
);

// Razorpay orders. A row turns "paid" only after the payment signature checks out on the server.
export const orders = pgTable("orders", {
  id: text("id").primaryKey(), // Razorpay order id
  playerId: text("player_id").notNull(),
  itemId: text("item_id").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  status: text("status").notNull().default("created"), // created | paid
  paymentId: text("payment_id"),
  createdMs: bigint("created_ms", { mode: "number" }).notNull(),
});

// Web push subscriptions (one per browser). Deleted when the push service says it's gone.
export const pushSubs = pgTable("push_subs", {
  endpoint: text("endpoint").primaryKey(),
  playerId: text("player_id").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdMs: bigint("created_ms", { mode: "number" }).notNull(),
  lastSentMs: bigint("last_sent_ms", { mode: "number" }),
});

// In-app notification centre (the bell). key dedupes one-off events per player, e.g. "games-2026-10-01".
export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  playerId: text("player_id").notNull(),
  key: text("key").notNull(),
  kind: text("kind").notNull(), // games | streak | duel | legend | offer | rank
  title: text("title").notNull(),
  body: text("body").notNull(),
  url: text("url").notNull(),
  createdMs: bigint("created_ms", { mode: "number" }).notNull(),
  readMs: bigint("read_ms", { mode: "number" }),
}, (t) => [uniqueIndex("notifications_player_key").on(t.playerId, t.key)]);

// Full-body render of a custom avatar look (one per unique avatar code, shared by everyone with that look).
export const figureRenders = pgTable("figure_renders", {
  code: text("code").primaryKey(),
  status: text("status").notNull(), // pending | done | failed
  webp: text("webp"), // base64
  createdMs: bigint("created_ms", { mode: "number" }).notNull(),
});

// ---- Cups: knockout tournaments (rules in lib/cup.ts, server layer in lib/cups.ts) ----
export const cups = pgTable("cups", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(), // invite link /cup/<code>
  name: text("name").notNull(),
  hostId: text("host_id").notNull(),
  visibility: text("visibility").notNull(), // private | public | official
  capacity: integer("capacity").notNull(), // 4 | 8 | 16 | 32
  status: text("status").notNull(), // mirrors state.phase, for queries: lobby | checkin | running | done | cancelled
  startsMs: bigint("starts_ms", { mode: "number" }).notNull(),
  state: jsonb("state").$type<CupState>().notNull(),
  winnerId: text("winner_id"),
  runnerUpId: text("runner_up_id"),
  finishedMs: bigint("finished_ms", { mode: "number" }),
  signedIn: integer("signed_in").notNull().default(0), // signed-in players who took part (leaderboards need ≥ 4)
  createdMs: bigint("created_ms", { mode: "number" }).notNull(),
});

export const cupEntrants = pgTable(
  "cup_entrants",
  {
    cupId: text("cup_id").notNull(),
    playerId: text("player_id").notNull(),
    seat: integer("seat").notNull(), // 1..capacity; unique per cup, so a cup can never be overfilled
    joinedMs: bigint("joined_ms", { mode: "number" }).notNull(),
    lastSeenMs: bigint("last_seen_ms", { mode: "number" }), // presence in the lobby = checked in
  },
  (t) => [primaryKey({ columns: [t.cupId, t.playerId] }), uniqueIndex("cup_entrants_seat").on(t.cupId, t.seat)],
);

export const cupWaitlist = pgTable(
  "cup_waitlist",
  {
    cupId: text("cup_id").notNull(),
    playerId: text("player_id").notNull(),
    joinedMs: bigint("joined_ms", { mode: "number" }).notNull(),
    lastSeenMs: bigint("last_seen_ms", { mode: "number" }),
  },
  (t) => [primaryKey({ columns: [t.cupId, t.playerId] })],
);

// Unscored checks (Nets, archive): one per player per question, so replaying a ball never earns XP twice.
export const checks = pgTable(
  "checks",
  {
    playerId: text("player_id").notNull(),
    questionId: text("question_id").notNull(),
    points: integer("points").notNull(),
    atMs: bigint("at_ms", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.questionId] })],
);

// Background jobs (crons and their self-healing fallbacks): a lease so two runners never overlap, plus a heartbeat.
export const jobs = pgTable("jobs", {
  name: text("name").primaryKey(), // e.g. "daily", "brief-2026-10-01", "league-2026-09-28"
  leaseUntilMs: bigint("lease_until_ms", { mode: "number" }).notNull().default(0),
  lastRunMs: bigint("last_run_ms", { mode: "number" }),
  lastOkMs: bigint("last_ok_ms", { mode: "number" }),
  lastResult: jsonb("last_result"),
});

// Weekly leagues (rules in lib/league.ts): one row per player per week they earned XP, in a cohort of ~30 of their tier.
export const leagueMembers = pgTable(
  "league_members",
  {
    week: text("week").notNull(), // Monday, YYYY-MM-DD (IST)
    playerId: text("player_id").notNull(),
    tier: integer("tier").notNull(),
    cohort: integer("cohort").notNull(),
    xp: integer("xp").notNull().default(0),
    updatedMs: bigint("updated_ms", { mode: "number" }).notNull(), // tie-break: whoever got there first
    rank: integer("rank"), // set at settlement
    outcome: text("outcome"), // up | down | stay, set at settlement (null = week not settled yet)
  },
  (t) => [primaryKey({ columns: [t.week, t.playerId] }), index("league_members_cohort").on(t.week, t.tier, t.cohort)],
);

// Player feedback and bug reports from /feedback, triaged daily in /admin/feedback.
export const feedback = pgTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    playerId: text("player_id"), // null if the cookie was missing
    email: text("email"), // signed-in players only, for a reply
    kind: text("kind").notNull(), // bug | idea | other
    message: text("message").notNull(),
    page: text("page"), // where they came from
    device: text("device"), // user agent + viewport, for bug repro
    status: text("status").notNull().default("new"), // new | seen | done
    createdMs: bigint("created_ms", { mode: "number" }).notNull(),
  },
  (t) => [index("feedback_status").on(t.status, t.createdMs)],
);

// Daily ₹100 prize (scripts/migrations/2026-10-04-prizes.sql, lib/prize.ts): #1 on each closed day's leaderboard.
// player_id null = nobody was ranked that day. The winner picks a payout (UPI, PayPal or an Amazon gift card, for players
// outside India) and where to send it; an admin pays by hand and marks it paid.
export const prizes = pgTable(
  "prizes",
  {
    day: text("day").primaryKey(), // "YYYY-MM-DD" (IST)
    playerId: text("player_id"),
    handle: text("handle"),
    points: integer("points").notNull().default(0),
    currency: text("currency").notNull().default("INR"), // the winner's currency at settlement (lib/currency.ts)
    amount: real("amount").notNull().default(100), // ₹100 converted at that day's rate (lib/fx.ts)
    method: text("method"), // upi | paypal | amazon (scripts/migrations/2026-10-04-prize-payout.sql)
    payTo: text("pay_to"), // UPI ID, PayPal email, or "email · Amazon store"
    claimedMs: bigint("claimed_ms", { mode: "number" }),
    paidMs: bigint("paid_ms", { mode: "number" }),
    createdMs: bigint("created_ms", { mode: "number" }).notNull(),
  },
  (t) => [index("prizes_player").on(t.playerId)],
);

// "Who's the Player?" daily (scripts/migrations/2026-10-01-who.sql). Puzzles and the schedule live in src/content/who.json.
// One row per guess or skip: `step` is the clue the player was on (0-4), so a retry of the same tap can't count twice.
export const whoGuesses = pgTable(
  "who_guesses",
  {
    playerId: text("player_id").notNull(),
    date: text("date").notNull(),
    idx: integer("idx").notNull(),
    step: integer("step").notNull(),
    pick: text("pick"), // guessed player id; null = skipped to the next clue
    correct: boolean("correct").notNull().default(false),
    atMs: bigint("at_ms", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.date, t.idx, t.step] })],
);

export const whoResults = pgTable(
  "who_results",
  {
    playerId: text("player_id").notNull(),
    date: text("date").notNull(),
    total: integer("total").notNull(),
    steps: jsonb("steps").$type<(number | null)[]>().notNull(), // clue each puzzle was solved on (0-4), null = missed
    ms: integer("ms").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.date] }), index("who_results_date").on(t.date, t.total)],
);

// Who's the Player? 1v1 Name Race (duels kind "who"): one buzz per player per clue; the key is the wrong-name lockout.
export const whoBuzzes = pgTable(
  "who_buzzes",
  {
    duelId: text("duel_id").notNull(),
    playerId: text("player_id").notNull(),
    round: integer("round").notNull(),
    clue: integer("clue").notNull(),
    pick: text("pick").notNull(),
    correct: boolean("correct").notNull(),
    atMs: bigint("at_ms", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.duelId, t.playerId, t.round, t.clue] })],
);

// Mystery Cricketer creator challenges (/mystery/c/<slug>): a host's hand-picked puzzles. Plays reuse who_guesses and
// who_results with date = "c:<slug>".
export const whoChallenges = pgTable("who_challenges", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  hostHandle: text("host_handle").notNull(),
  hostPlayerId: text("host_player_id"), // the player who opened the host link (?host=<hostKey>): their score is the one to beat
  hostKey: text("host_key").notNull(), // secret in the host's link, so nobody can claim the host seat by picking their handle
  puzzles: jsonb("puzzles").$type<string[]>().notNull(), // keys into who-duel.json / who.json puzzles
  createdMs: bigint("created_ms", { mode: "number" }).notNull(),
  active: boolean("active").notNull().default(true),
});
