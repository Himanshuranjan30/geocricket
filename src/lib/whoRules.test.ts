import { describe, expect, it } from "vitest";
import raw from "../content/who.json";
import { CLUES, PER_DAY, POINTS, puzzleState, shareText, type Clue } from "./whoRules";

const g = (step: number, pick: string | null, correct = false) => ({ step, pick, correct });

describe("puzzleState", () => {
  it("starts on clue 1 worth full points", () => {
    expect(puzzleState([])).toMatchObject({ step: 0, done: false, solvedAt: null, points: 0 });
  });
  it("each miss or skip moves to the next clue", () => {
    expect(puzzleState([g(0, "a"), g(1, null)])).toMatchObject({ step: 2, done: false, picks: ["a", null] });
  });
  it("scores by the clue it was solved on", () => {
    expect(puzzleState([g(0, "a"), g(1, "kohli", true)])).toMatchObject({ done: true, solvedAt: 1, points: POINTS[1] });
    expect(puzzleState([g(0, "kohli", true)]).points).toBe(100);
  });
  it("ends after five wrong tries with no points", () => {
    expect(puzzleState([0, 1, 2, 3, 4].map((s) => g(s, `p${s}`)))).toMatchObject({ done: true, solvedAt: null, points: 0, step: CLUES });
  });
  it("doesn't depend on row order", () => {
    expect(puzzleState([g(2, "x", true), g(0, "a"), g(1, "b")]).solvedAt).toBe(2);
  });
});

describe("shareText", () => {
  it("is spoiler-free and shows clues used", () => {
    const t = shareText(7, [0, 2, null], 160, 64, "geocricket.app/who");
    expect(t).toContain("#7");
    expect(t).toContain("🟩🟨🟥  160/300");
    expect(t).toContain("Clues: 1 · 3 · ✗");
    expect(t).toContain("Better than 64%");
  });
  it("leaves out the percentile when there isn't one", () => {
    expect(shareText(1, [0, 0, 0], 300, null, "x")).not.toContain("Better than");
  });
});

// Content QA over the shipped file: what a player sees before the answer must never give the name away.
type Content = { players: { id: string; name: string }[]; puzzles: Record<string, { player: string; clues: Clue[] }>; days: Record<string, string[]> };
const content = raw as unknown as Content;

describe("who.json content", () => {
  const pool = new Map(content.players.map((p) => [p.id, p.name]));
  const days = Object.entries(content.days).sort(([a], [b]) => a.localeCompare(b));

  it("schedules full days of real puzzles", () => {
    expect(days.length).toBeGreaterThan(30);
    for (const [, ids] of days) {
      expect(ids).toHaveLength(PER_DAY);
      for (const id of ids) expect(content.puzzles[id]).toBeDefined();
    }
  });

  it("every puzzle has five clues, a ground pin and a trail of 2+ grounds, and an answer in the guess pool", () => {
    for (const p of Object.values(content.puzzles)) {
      expect(p.clues.map((c) => c.kind)).toEqual(["pin", "match", "numbers", "trail", "initials"]);
      expect(p.clues[0].pins).toHaveLength(1);
      expect(p.clues[3].pins!.length).toBeGreaterThanOrEqual(3);
      expect(pool.has(p.player)).toBe(true);
      for (const c of p.clues) expect(c.text).not.toMatch(/undefined|NaN|\?\s*balls/);
    }
  });

  it("no clue before the initials names the player", () => {
    for (const p of Object.values(content.puzzles)) {
      const tokens = pool.get(p.player)!.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
      for (const c of p.clues.slice(0, 4)) for (const t of tokens) expect(c.text.toLowerCase()).not.toMatch(new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
    }
  });

  it("no player is the answer twice within three weeks, or twice in a day", () => {
    const last = new Map<string, number>();
    days.forEach(([, ids], d) => {
      const who = ids.map((id) => content.puzzles[id].player);
      expect(new Set(who).size).toBe(who.length);
      for (const w of who) { if (last.has(w)) expect(d - last.get(w)!).toBeGreaterThanOrEqual(21); last.set(w, d); }
    });
  });
});
