-- Anytime play: jobs (cron leases/heartbeat), checks (XP once per ball), weekly leagues, Ghost Race marker.
-- Additive only and idempotent: safe to run more than once.
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "league_tier" integer DEFAULT 0 NOT NULL;
ALTER TABLE "duels" ADD COLUMN IF NOT EXISTS "ghost_of" text;
CREATE TABLE IF NOT EXISTS "checks" (
  "player_id" text NOT NULL,
  "question_id" text NOT NULL,
  "points" integer NOT NULL,
  "at_ms" bigint NOT NULL,
  CONSTRAINT "checks_player_id_question_id_pk" PRIMARY KEY("player_id","question_id")
);
CREATE TABLE IF NOT EXISTS "jobs" (
  "name" text PRIMARY KEY NOT NULL,
  "lease_until_ms" bigint DEFAULT 0 NOT NULL,
  "last_run_ms" bigint,
  "last_ok_ms" bigint,
  "last_result" jsonb
);
CREATE TABLE IF NOT EXISTS "league_members" (
  "week" text NOT NULL,
  "player_id" text NOT NULL,
  "tier" integer NOT NULL,
  "cohort" integer NOT NULL,
  "xp" integer DEFAULT 0 NOT NULL,
  "updated_ms" bigint NOT NULL,
  "rank" integer,
  "outcome" text,
  CONSTRAINT "league_members_week_player_id_pk" PRIMARY KEY("week","player_id")
);
CREATE INDEX IF NOT EXISTS "league_members_cohort" ON "league_members" USING btree ("week","tier","cohort");
