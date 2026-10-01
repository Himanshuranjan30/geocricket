// When the day's games drop (fixed IST times, see SLOT_MINUTES_IST in game.ts), shown in the player's own time zone.
import { nextDrops, nextSlot, slotName } from "./game";

// Country → a representative time zone; guests and unknown countries see India/Asia time.
const TZ: Record<string, string> = {
  IN: "Asia/Kolkata", AU: "Australia/Sydney", GB: "Europe/London", PK: "Asia/Karachi", ZA: "Africa/Johannesburg", NZ: "Pacific/Auckland",
  LK: "Asia/Colombo", BD: "Asia/Dhaka", AF: "Asia/Kabul", IE: "Europe/Dublin", ZW: "Africa/Harare", NL: "Europe/Amsterdam", AE: "Asia/Dubai",
  US: "America/New_York", CA: "America/Toronto", NP: "Asia/Kathmandu", OM: "Asia/Muscat", SG: "Asia/Singapore", JM: "America/Jamaica",
  TT: "America/Port_of_Spain", BB: "America/Barbados", GY: "America/Guyana", MY: "Asia/Kuala_Lumpur", HK: "Asia/Hong_Kong", QA: "Asia/Qatar",
  SA: "Asia/Riyadh", KW: "Asia/Kuwait", BH: "Asia/Bahrain", DE: "Europe/Berlin", FR: "Europe/Paris", IT: "Europe/Rome", ES: "Europe/Madrid",
  KE: "Africa/Nairobi", UG: "Africa/Kampala", NA: "Africa/Windhoek", NG: "Africa/Lagos", JP: "Asia/Tokyo", CN: "Asia/Shanghai", TH: "Asia/Bangkok",
};

/** The time zone used for a country: the curated one above, else the country's first zone from the runtime's locale
 * data (every country), else India time. */
export function tzOf(country: string | null | undefined) {
  if (!country) return "Asia/Kolkata";
  if (TZ[country]) return TZ[country];
  try {
    const loc = new Intl.Locale(`und-${country}`) as Intl.Locale & { getTimeZones?: () => string[]; timeZones?: string[] };
    const zones = loc.getTimeZones?.() ?? loc.timeZones; // ponytail: Firefox lacks this; those players see India time
    if (zones?.length) return zones[0];
  } catch {}
  return "Asia/Kolkata";
}

const PLACE: Record<string, string> = { GB: "UK", US: "US Eastern", AU: "Sydney", CA: "Eastern", AE: "UAE", NZ: "NZ" };

/** A moment as the player's local clock time, e.g. "8:00 PM IST" (India and guests), "3:30 PM UK time". */
export function timeAt(ms: number, country: string | null | undefined) {
  const tz = tzOf(country);
  const at = (timeZone: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(ms));
  if (tz === "Asia/Kolkata") return `${at(tz)} IST`;
  const place = PLACE[country!] ?? (typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "region" }).of(country!) : country);
  return `${at(tz)} ${place} time`;
}

/** "morning" / "afternoon" / "evening" / "night" for a moment on the player's clock. */
export function partOfDay(ms: number, country: string | null | undefined) {
  const tz = tzOf(country);
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(new Date(ms)));
  return h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : h >= 17 && h < 21 ? "evening" : "night";
}

/** When Game 1 (daily) or Game 2 (test) next drops, in the player's time. */
export const dropLabel = (game: "daily" | "test", country: string | null | undefined) => timeAt(nextDrops()[game], country);

/** "5 hr" / "40 min" until a moment. */
export function untilLabel(ms: number, now = Date.now()) {
  const left = Math.max(0, ms - now);
  return left >= 3600e3 ? `${Math.floor(left / 3600e3)} hr` : `${Math.max(1, Math.ceil(left / 60e3))} min`;
}

/** "Evening Daily at 6:00 PM IST", the next game to drop, in the player's time. */
export function nextSlotLabel(country: string | null | undefined, now = Date.now()) {
  const n = nextSlot(now);
  return `${n.game === "daily" && n.slot === "am" ? "tomorrow's Daily" : slotName(n.game, n.slot)} at ${timeAt(n.ms, country)}`;
}
