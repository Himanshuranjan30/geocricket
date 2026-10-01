-- 18+ confirmation: when the player confirmed they're 18 or older (required before any purchase). Additive, idempotent.
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "age_confirmed_ms" bigint;
