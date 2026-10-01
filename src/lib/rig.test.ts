import { expect, test } from "vitest";
import { encodeLook, HAIRS, HEADS, lookOf, rigFor, SKINS } from "./rig";

test("every kind of avatar code maps to a valid look and image", () => {
  const seeds = ["pitchmap", "k3x9p2", "zzzzzzzzzzzz", "x0000000000", "xz9c0000000", "r4651", ...Array.from({ length: 500 }, (_, i) => Math.random().toString(36).slice(2, 2 + (i % 9) + 4))];
  for (const s of seeds) {
    const l = lookOf(s);
    expect(SKINS[l.skin] && HEADS[l.head] && HAIRS[l.hair], s).toBeTruthy();
    expect(rigFor(`${s}-india`).srcs[0]).toMatch(/^\/rig\/[a-z]+-[a-z]+-[01]\.webp$/);
  }
  const l = { skin: 3, head: 6, hair: 2, beard: 1 as const };
  expect(lookOf(encodeLook(l))).toEqual(l);
  expect(rigFor(`${encodeLook(l)}-gold`).srcs[0]).toBe("/rig/brown-hijab-0.webp"); // no beard with a hijab
});
