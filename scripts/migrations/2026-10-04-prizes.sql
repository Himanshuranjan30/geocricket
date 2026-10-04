-- Daily ₹100 prize for #1 on the day's leaderboard (lib/prize.ts). One row per closed day; additive and idempotent.
CREATE TABLE IF NOT EXISTS "prizes" (
  "day" text PRIMARY KEY NOT NULL,
  "player_id" text,
  "handle" text,
  "points" integer DEFAULT 0 NOT NULL,
  "upi" text,
  "claimed_ms" bigint,
  "paid_ms" bigint,
  "created_ms" bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS "prizes_player" ON "prizes" USING btree ("player_id");
