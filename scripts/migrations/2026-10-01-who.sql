-- "Who's the Player?" daily: one row per guess (or skip) and one result per player per day. Additive and idempotent.
CREATE TABLE IF NOT EXISTS who_guesses (
  player_id text NOT NULL,
  date text NOT NULL,
  idx integer NOT NULL,
  step integer NOT NULL,
  pick text,
  correct boolean NOT NULL DEFAULT false,
  at_ms bigint NOT NULL,
  PRIMARY KEY (player_id, date, idx, step)
);
CREATE TABLE IF NOT EXISTS who_results (
  player_id text NOT NULL,
  date text NOT NULL,
  total integer NOT NULL,
  steps jsonb NOT NULL,
  ms integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, date)
);
CREATE INDEX IF NOT EXISTS who_results_date ON who_results (date, total);
