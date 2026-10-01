"use client";

import { useEffect, useState } from "react";
import type { Account } from "@/components/ProfileSetup";
import type { Profile } from "./profile";

export type Me = {
  profile: Profile | null; user: Account; googleEnabled: boolean; suggestedCountry: string | null;
  level?: { level: number; progress: number }; streak?: number; streakAtRisk?: boolean; freezeLeft?: boolean; saveStreak?: number; played?: string[]; frozen?: string[]; onboarded?: boolean; guest?: boolean; customAvatar?: string | null; aid?: string | null;
};

// One /api/me fetch shared by every component on the page; publishMe() pushes changes (e.g. a character switch) to all of them.
let cached: Promise<Me> | null = null;
const listeners = new Set<(m: Me) => void>();
export const fetchMe = (fresh = false) => {
  if (!cached || fresh) cached = fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ profile: null, user: null, googleEnabled: false, suggestedCountry: null }));
  return cached;
};
export function publishMe(m: Me) { cached = Promise.resolve(m); listeners.forEach((l) => l(m)); }

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let live = true;
    fetchMe().then((m) => live && setMe(m));
    const l = (m: Me) => setMe(m);
    listeners.add(l);
    return () => { live = false; listeners.delete(l); };
  }, []);
  const set = (m: Me | ((p: Me | null) => Me | null) | null) => {
    const next = typeof m === "function" ? m(me) : m;
    if (next) publishMe(next); else setMe(null);
  };
  return [me, set] as const;
}
