import { describe, expect, it } from "vitest";
import { flag, validateProfile } from "./profile";

describe("profile", () => {
  const ok = { handle: "CoverDrive_07", avatar: "k3x9p2-india", country: "IN" };

  it("accepts a valid profile", () => expect(validateProfile(ok)).toBeNull());

  it("rejects bad handles, avatars and countries", () => {
    expect(validateProfile({ ...ok, handle: "ab" })).toMatch(/Handles/);
    expect(validateProfile({ ...ok, handle: "has space" })).toMatch(/Handles/);
    expect(validateProfile({ ...ok, handle: "<script>" })).toMatch(/Handles/);
    expect(validateProfile({ ...ok, avatar: "k3x9p2-purple" })).toMatch(/avatar/);
    expect(validateProfile({ ...ok, country: "XX" })).toMatch(/country/);
  });

  it("turns country codes into flags", () => {
    expect(flag("IN")).toBe("🇮🇳");
    expect(flag(null)).toBe("🏳️");
  });
});
