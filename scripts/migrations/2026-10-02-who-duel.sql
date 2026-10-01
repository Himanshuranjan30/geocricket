-- Who's the Player? 1v1 Name Race: one buzz per player per clue (the primary key is the lockout: a wrong name locks
-- you out until the next clue). Matches themselves live in duels (kind 'who').
CREATE TABLE IF NOT EXISTS who_buzzes (
  duel_id text NOT NULL,
  player_id text NOT NULL,
  round integer NOT NULL,
  clue integer NOT NULL,
  pick text NOT NULL,
  correct boolean NOT NULL,
  at_ms bigint NOT NULL,
  PRIMARY KEY (duel_id, player_id, round, clue)
);
