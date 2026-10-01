"use client";

import { GoogleLogo, X } from "@phosphor-icons/react";
import { useState } from "react";
import { signInWithGoogle } from "@/lib/auth-client";
import { store } from "@/lib/client";
import { useMe } from "@/lib/useMe";

/**
 * Soft sign-up prompts for guests, framed as saving what they've earned. Never blocks play.
 * banner: slim dismissible strip (home). card: after a round, with where they would rank.
 */
export function SignInNudge({ variant, rank, count, callback }: { variant: "banner" | "card"; rank?: number | null; count?: number; callback?: string }) {
  const [me] = useMe();
  const [hidden, setHidden] = useState(() => variant === "banner" && typeof window !== "undefined" && !!store<boolean>("pm_nudge_hidden"));
  if (!me || me.user || !me.googleEnabled || hidden) return null;
  const go = () => signInWithGoogle(callback ?? `${window.location.pathname}?welcome=1`);

  if (variant === "banner") {
    return (
      <div className="relative flex flex-col gap-2 rounded-2xl border border-[#F5C000]/40 bg-[#F5C000]/10 p-3 pr-8 text-sm">
        <span><b>Playing as a guest.</b> <span className="text-[#E4E1FA]">Scores and streak aren&apos;t saved or ranked.</span></span>
        <button onClick={go} className="display self-start rounded-full bg-[#F5C000] px-3 py-1 text-xs text-deep">Save my progress</button>
        <button aria-label="Dismiss" onClick={() => { store("pm_nudge_hidden", true); setHidden(true); }} className="absolute right-2 top-2 text-muted"><X size={14} /></button>
      </div>
    );
  }
  return (
    <section className="flex flex-col gap-2.5 rounded-3xl border-2 border-dashed border-[#F5C000]/50 bg-[#F5C000]/10 p-4 text-center">
      {rank ? <p className="display text-2xl">You&apos;d be <span className="text-[#F5C000]">#{rank}</span>{count ? <span className="text-base text-muted"> of {count + 1}</span> : null} today</p>
        : <p className="display text-xl">Don&apos;t lose this score</p>}
      <p className="text-sm text-[#E4E1FA]">Guests aren&apos;t on the leaderboard. Sign in free and this score, your streak and XP move to your account.</p>
      <button onClick={go} className="btn-primary mx-auto flex items-center gap-2 px-6 py-3 text-lg"><GoogleLogo weight="bold" size={20} />Save &amp; get ranked</button>
    </section>
  );
}
