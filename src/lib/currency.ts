// A player's currency from their profile country (lib/profile COUNTRIES), and money formatting. Client and server.
const EURO = "AD AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV ME MT NL PT SI SK".split(" ");
const BY_COUNTRY: Record<string, string> = {
  IN: "INR", AU: "AUD", GB: "GBP", PK: "PKR", ZA: "ZAR", NZ: "NZD", LK: "LKR", BD: "BDT", AF: "AFN", ZW: "USD", AE: "AED", US: "USD", CA: "CAD",
  NP: "NPR", OM: "OMR", SG: "SGD", AL: "ALL", AM: "AMD", AO: "AOA", AR: "ARS", AZ: "AZN", BA: "BAM", BB: "BBD", BG: "BGN", BH: "BHD", BR: "BRL",
  BS: "BSD", BT: "BTN", BW: "BWP", BY: "BYN", BZ: "BZD", CH: "CHF", CL: "CLP", CN: "CNY", CO: "COP", CR: "CRC", CZ: "CZK", DK: "DKK", DO: "DOP",
  DZ: "DZD", EC: "USD", EG: "EGP", ET: "ETB", FJ: "FJD", GE: "GEL", GH: "GHS", GT: "GTQ", GY: "GYD", HK: "HKD", HU: "HUF", ID: "IDR", IL: "ILS",
  IQ: "IQD", IR: "IRR", IS: "ISK", JM: "JMD", JO: "JOD", JP: "JPY", KE: "KES", KG: "KGS", KH: "KHR", KR: "KRW", KW: "KWD", KZ: "KZT", LA: "LAK",
  LB: "LBP", LR: "LRD", LS: "LSL", LY: "LYD", MA: "MAD", MD: "MDL", MK: "MKD", MM: "MMK", MN: "MNT", MO: "MOP", MU: "MUR", MV: "MVR", MW: "MWK",
  MX: "MXN", MY: "MYR", MZ: "MZN", NA: "NAD", NG: "NGN", NO: "NOK", PA: "USD", PE: "PEN", PG: "PGK", PH: "PHP", PL: "PLN", PY: "PYG", QA: "QAR",
  RO: "RON", RS: "RSD", RU: "RUB", RW: "RWF", SA: "SAR", SC: "SCR", SE: "SEK", SL: "SLE", SN: "XOF", SR: "SRD", SV: "USD", SY: "SYP", TH: "THB",
  TJ: "TJS", TM: "TMT", TN: "TND", TR: "TRY", TT: "TTD", TW: "TWD", TZ: "TZS", UA: "UAH", UG: "UGX", UY: "UYU", UZ: "UZS", VE: "VES", VN: "VND",
  WS: "WST", YE: "YER", ZM: "ZMW",
};
for (const c of EURO) BY_COUNTRY[c] = "EUR";

/** The currency for a profile country; unknown or no country (guests) → Indian rupees, the prize's base currency. */
export const currencyOf = (country: string | null | undefined) => (country && BY_COUNTRY[country]) || "INR";

/** "₹100", "$1.04", "A$1.49", "PKR 287": unambiguous symbols; whole units from 100 up, cents below. */
export function money(amount: number, currency: string) {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en", { style: "currency", currency,
    maximumFractionDigits: amount >= 100 ? 0 : 2, minimumFractionDigits: amount >= 100 || Number.isInteger(amount) ? 0 : 2 }).format(amount);
}
