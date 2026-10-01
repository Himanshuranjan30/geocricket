// Player identity shared by client and server: avatars, countries, validation.

import { isAvatar } from "./avatar";

// Cricket nations first, then everyone else (ISO 3166-1 alpha-2).
export const CRICKET_NATIONS = ["IN", "AU", "GB", "PK", "ZA", "NZ", "LK", "BD", "AF", "IE", "ZW", "NL", "AE", "US", "CA", "NP", "OM", "SG"];
const OTHER = "AD AL AM AO AR AT AZ BA BB BE BG BH BR BS BT BW BY BZ CH CL CN CO CR CY CZ DE DK DO DZ EC EE EG ES ET FI FJ FR GE GH GR GT GY HK HR HU ID IL IQ IR IS IT JM JO JP KE KG KH KR KW KZ LA LB LR LS LT LU LV LY MA MD ME MK MM MN MO MT MU MV MW MX MY MZ NA NG NO PA PE PG PH PL PT PY QA RO RS RU RW SA SC SE SI SK SL SN SR SV SY TH TJ TM TN TR TT TW TZ UA UG UY UZ VE VN WS YE ZM".split(" ");
export const COUNTRIES = [...CRICKET_NATIONS, ...OTHER];
const VALID = new Set(COUNTRIES);

const names = typeof Intl !== "undefined" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
export const countryName = (code: string) => names?.of(code) ?? code;
export const flag = (code: string | null | undefined) =>
  code && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "🏳️";

export type Profile = { handle: string; avatar: string; country: string };

/** Returns an error message, or null if the profile is valid. */
export function validateProfile(p: Partial<Profile>): string | null {
  if (!p.handle || !/^[A-Za-z0-9_]{3,16}$/.test(p.handle)) return "Handles are 3–16 letters, numbers or underscores.";
  if (!p.avatar || !isAvatar(p.avatar)) return "Pick an avatar.";
  if (!p.country || !VALID.has(p.country)) return "Pick your country.";
  return null;
}
