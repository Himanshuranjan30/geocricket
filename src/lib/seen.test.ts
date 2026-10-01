import { expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ getDb: () => null, schema: { seen: {}, questions: {} } }));
const { fame } = await import("./seen");

test("well-known moments rank above obscure ones", () => {
  const q = (text: string, origin = "cricsheet") => fame({ text, origin });
  const stokes = q("Where did Ben Stokes score 258 for England against South Africa in a 2016 Test?");
  const bates = q("Where did Suzie Bates score 124 not out for New Zealand against England in a 2018 women's ODI?");
  const japan = q("Where did Japan win the 2025 Women's T20 Pentangular Series final?");
  const qualifier = q("Where did Nepal win the 2013 ICC World Twenty20 Qualifier quarter-final?");
  expect(q("AB de Villiers hit the fastest ODI hundred at this ground.", "manual")).toBeGreaterThan(stokes);
  expect(stokes).toBeGreaterThan(japan);
  expect(bates).toBeGreaterThan(qualifier);
  expect(japan).toBeLessThan(0);
});
