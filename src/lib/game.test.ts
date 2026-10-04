import { describe, expect, it } from "vitest";
import { addDays, dailyOpen, spreadPick, zoneOf, dayEndMs, dayStartMs, distanceKm, dropMs, greatCircle, istDate, nextDrops, pointsFor, slotMs, testDay, testWindow, tierOf, weekOf } from "./game";

describe("game logic", () => {
  it("measures distance: Mumbai to Durban is ~7,030 km", () => {
    const km = distanceKm([72.8258, 18.9389], [31.0292, -29.8494]);
    expect(km).toBeGreaterThan(6950);
    expect(km).toBeLessThan(7100);
  });

  it("scores precise taps fully and decays with distance", () => {
    expect(pointsFor(3, 400)).toBe(100);
    expect(pointsFor(100, 400)).toBe(78);
    expect(pointsFor(1000, 400)).toBe(8);
    expect(pointsFor(20000, 400)).toBe(0);
  });

  it("maps points to tiers", () => {
    expect(tierOf(100).toast).toBe("Plumb. Dead plumb.");
    expect(tierOf(55).emoji).toBe("🟡");
    expect(tierOf(0).emoji).toBe("⚫");
  });

  it("games drop at fixed IST times and all close at midnight IST that day", () => {
    const day = "2026-10-01";
    expect(slotMs(day, "daily", "am")).toBe(Date.parse("2026-10-01T00:00:00+05:30"));
    expect(slotMs(day, "test", "am")).toBe(Date.parse("2026-10-01T08:00:00+05:30"));
    expect(slotMs(day, "daily", "pm")).toBe(Date.parse("2026-10-01T18:00:00+05:30"));
    expect(slotMs(day, "test", "pm")).toBe(Date.parse("2026-10-01T20:00:00+05:30"));
    expect(dailyOpen(day, dayStartMs(day) - 1)).toBe(false);
    expect(dailyOpen(day, dayStartMs(day))).toBe(true);
    expect(dailyOpen(day, dayEndMs(day))).toBe(true);
    expect(dailyOpen(day, dayEndMs(day) + 1)).toBe(false);
    expect(dayEndMs(day) + 1).toBe(dayStartMs(addDays(day, 1))); // no gap and no overlap between days
    expect(testWindow(day)).toEqual({ opensMs: slotMs(day, "test", "pm"), closesMs: dayEndMs(day) });
    expect(istDate(new Date("2026-10-01T18:29:00Z"))).toBe("2026-10-01");
    expect(istDate(new Date("2026-10-01T18:31:00Z"))).toBe("2026-10-02");
    const early = Date.parse("2026-10-01T20:00:00Z"); // 1:30 AM IST Oct 2: the Daily is already open, the Test drops later today
    expect(nextDrops(early)).toEqual({ daily: dropMs("2026-10-03", "daily"), test: dropMs("2026-10-02", "test") });
    const late = Date.parse("2026-10-02T17:00:00Z"); // 10:30 PM IST: both next tomorrow
    expect(nextDrops(late)).toEqual({ daily: dropMs("2026-10-03", "daily"), test: dropMs("2026-10-03", "test") });
    expect(testDay(late)).toBe("2026-10-02");
  });

  it("weeks start on Monday", () => {
    expect(weekOf("2026-10-01")).toBe("2026-09-28"); // Thu
    expect(weekOf("2026-10-04")).toBe("2026-09-28"); // Sun
    expect(weekOf("2026-10-05")).toBe("2026-10-05"); // Mon
  });

  it("keeps great-circle longitudes continuous across the antimeridian", () => {
    const pts = greatCircle([170, -40], [-170, -40]);
    for (let i = 1; i < pts.length; i++) expect(Math.abs(pts[i][0] - pts[i - 1][0])).toBeLessThan(10);
  });
});

import { periodRange, shiftPeriod } from "./game";

describe("leaderboard periods", () => {
  it("weeks run Monday to Sunday", () => {
    expect(periodRange("2026-09-30", "week")).toEqual(["2026-09-28", "2026-10-04"]); // Wed
    expect(periodRange("2026-10-04", "week")).toEqual(["2026-09-28", "2026-10-04"]); // Sun
    expect(periodRange("2026-09-28", "week")).toEqual(["2026-09-28", "2026-10-04"]); // Mon
  });
  it("months cover the calendar month, including leap years", () => {
    expect(periodRange("2026-09-30", "month")).toEqual(["2026-09-01", "2026-09-30"]);
    expect(periodRange("2028-02-10", "month")).toEqual(["2028-02-01", "2028-02-29"]);
  });
  it("shifts by one period", () => {
    expect(shiftPeriod("2026-01-31", "month", 1)).toBe("2026-02-01");
    expect(shiftPeriod("2026-09-30", "week", -1)).toBe("2026-09-23");
  });
});

import { isSuspicious } from "./game";
describe("cheat flag", () => {
  it("flags near-perfect scores done impossibly fast", () => {
    expect(isSuspicious(990, 12_000)).toBe(true);
    expect(isSuspicious(990, 60_000)).toBe(false);
    expect(isSuspicious(700, 5_000)).toBe(false);
  });
});

import { dropLabel, partOfDay, timeAt } from "./resetTime";
describe("drop times follow the player's country", () => {
  const at = Date.parse("2026-10-02T02:30:00Z"); // 8:00 AM IST
  it("labels the clock and part of day in the chosen time zone", () => {
    expect(timeAt(at, "IN")).toBe("8:00 AM IST");
    expect(timeAt(at, null)).toBe("8:00 AM IST"); // guests: India time
    expect(timeAt(at, "GB")).toBe("3:30 AM UK time");
    expect(timeAt(at, "AU")).toBe("12:30 PM Sydney time");
    expect(partOfDay(at, "IN")).toBe("morning");
    expect(partOfDay(at, "GB")).toBe("night");
    expect(partOfDay(at, "AU")).toBe("afternoon");
    expect(dropLabel("test", "IN")).toBe("8:00 PM IST");
    expect(timeAt(at, "BR")).toBe("11:30 PM Brazil time"); // not in the curated map: runtime zone data
    expect(timeAt(at, "IS")).toBe("2:30 AM Iceland time");
  });
});

describe("round spread", () => {
  const at = (id: string, lat: number, lng: number) => ({ id, lat, lng });
  it("knows the cricket regions", () => {
    expect(zoneOf(18.94, 72.83)).toBe("south-asia"); // Mumbai
    expect(zoneOf(-33.89, 151.22)).toBe("oceania"); // Sydney
    expect(zoneOf(51.53, -0.17)).toBe("europe"); // Lord's
    expect(zoneOf(13.1, -59.6)).toBe("americas"); // Bridgetown
    expect(zoneOf(-26.13, 28.06)).toBe("africa"); // Johannesburg
    expect(zoneOf(25.05, 55.22)).toBe("gulf"); // Dubai
    expect(zoneOf(1.3, 103.8)).toBe("east-asia"); // Singapore
  });
  it("spreads a round across regions before repeating one, keeping rank order", () => {
    const ranked = [at("mumbai", 18.9, 72.8), at("delhi", 28.6, 77.2), at("chennai", 13.1, 80.3), at("lords", 51.5, -0.2), at("mcg", -37.8, 145), at("kolkata", 22.6, 88.3)];
    expect(spreadPick(ranked, 3).map((q) => q.id)).toEqual(["mumbai", "lords", "mcg"]);
    expect(spreadPick(ranked, 5).map((q) => q.id)).toEqual(["mumbai", "delhi", "chennai", "lords", "mcg"]);
  });
});
