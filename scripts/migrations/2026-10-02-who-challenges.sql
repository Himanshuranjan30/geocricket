-- Mystery Cricketer creator challenges: a hosted, hand-picked set of puzzles at /mystery/c/<slug>.
-- Guesses and results reuse who_guesses / who_results with date = 'c:<slug>'.
CREATE TABLE IF NOT EXISTS who_challenges (
  slug text PRIMARY KEY,
  title text NOT NULL,
  host_handle text NOT NULL,
  host_player_id text,
  host_key text NOT NULL,
  puzzles jsonb NOT NULL,
  created_ms bigint NOT NULL,
  active boolean NOT NULL DEFAULT true
);
