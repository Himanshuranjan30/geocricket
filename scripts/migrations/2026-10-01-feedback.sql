-- Player feedback / bug reports. Additive and idempotent.
CREATE TABLE IF NOT EXISTS "feedback" (
  "id" text PRIMARY KEY NOT NULL,
  "player_id" text,
  "email" text,
  "kind" text NOT NULL,
  "message" text NOT NULL,
  "page" text,
  "device" text,
  "status" text DEFAULT 'new' NOT NULL,
  "created_ms" bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS "feedback_status" ON "feedback" USING btree ("status","created_ms");
