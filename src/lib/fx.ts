import "server-only";

// Daily exchange rates from the Indian rupee (open.er-api.com, free, no key; the site credits "Rates By Exchange Rate API").
// Cached per server for 12 hours; on failure the last good rates are used, and with none at all callers fall back to INR.
const URL = "https://open.er-api.com/v6/latest/INR", TTL = 12 * 3600e3;
let cache: { at: number; rates: Record<string, number> } | null = null;

export async function inrRates(): Promise<Record<string, number> | null> {
  if (cache && Date.now() - cache.at < TTL) return cache.rates;
  try {
    const r = await fetch(URL, { next: { revalidate: TTL / 1000 } });
    const d = await r.json();
    if (d?.result === "success" && d.rates) cache = { at: Date.now(), rates: d.rates };
  } catch { /* keep the last good rates */ }
  return cache?.rates ?? null;
}
