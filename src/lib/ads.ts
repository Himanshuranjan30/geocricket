"use client";

import { track } from "@/components/Analytics";
import { store } from "./client";

// Google's Ad Placement API for web games (H5 Games Ads: interstitials + rewarded). Loaded with the AdSense tag in the
// root layout; until the account is approved for it, adBreak just calls back with "notReady" and play continues.
// House rules (retention first): never during a question or a live match; interstitials only at natural breaks,
// never in the player's first game of the day, at most one every other break, ≥ 3 minutes apart, ≤ 3 a day.
// Supporters (no-ads pass) never see interstitials, only the rewarded ads they choose.
type AdBreak = (o: Record<string, unknown>) => void;
const api = () => (typeof window !== "undefined" ? (window as unknown as { adBreak?: AdBreak }).adBreak : undefined);
const MIN_GAP_MS = 3 * 60_000, PER_DAY = 3;

type Log = { day: string; shown: number; breaks: number; last: number };
const today = () => new Date().toISOString().slice(0, 10);
const log = (): Log => { const l = store<Log>("pm_ads"); return l?.day === today() ? l : { day: today(), shown: 0, breaks: 0, last: 0 }; };
export const noAds = () => !!store<boolean>("pm_supporter");

/** A natural break (results screen, between Nets sessions, after a duel). Resolves when the game may continue. */
export function naturalBreak(name: string): Promise<void> {
  return new Promise((done) => {
    const l = log(); l.breaks++;
    const eligible = !noAds() && api() && l.breaks >= 2 && l.breaks % 2 === 0 && l.shown < PER_DAY && Date.now() - l.last > MIN_GAP_MS;
    store("pm_ads", l);
    if (!eligible) return done();
    let settled = false; const finish = () => { if (!settled) { settled = true; done(); } };
    setTimeout(finish, 8000); // never hold the player if the ad stack stalls
    api()!({ type: "next", name, beforeAd: () => { const x = log(); x.shown++; x.last = Date.now(); store("pm_ads", x); track("ad_break_shown", { placement: name }); }, adBreakDone: finish });
  });
}

/** Opt-in rewarded ad. onReady fires only when Google has an ad to show (so the offer is never a dead button), with
 * show(), which resolves true only if the player watched to the end (reward in adViewed, per policy). */
export function offerReward(name: string, onReady: (show: () => Promise<boolean>) => void) {
  const a = api();
  if (!a) return;
  let viewed = false, done: (v: boolean) => void = () => {};
  a({ type: "reward", name,
    beforeReward: (showAdFn: () => void) => onReady(() => new Promise((r) => { done = r; showAdFn(); setTimeout(() => r(false), 90_000); })),
    adViewed: () => { viewed = true; }, adDismissed: () => { viewed = false; },
    adBreakDone: () => done(viewed) });
}
