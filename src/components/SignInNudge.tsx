"use client";

import { GoogleLogo, X } from "@phosphor-icons/react";
import { useState } from "react";
import { signInWithGoogle } from "@/lib/auth-client";
import { store } from "@/lib/client";
import { publishMe, useMe } from "@/lib/useMe";
import { ProfileSetup } from "./ProfileSetup";

/**
 * Soft sign-up prompts for guests, framed as saving what they've earned. Never blocks play.
 * banner: slim dismissible strip (home). card: after a round, with where they would rank.
 */
export function SignInNudge({ variant, rank, count, callback }: { variant: "banner" | "card"; rank?: number | null; count?: number; callback?: string }) {
  const [me] = useMe();
  // Dismissing the banner hides it for 3 days, not forever (older saves stored `true`: those come back now).
  const [hidden, setHidden] = useState(() => { if (variant !== "banner" || typeof window === "undefined") return false; const at = store<number | boolean>("pm_nudge_hidden"); return typeof at === "number" && Date.now() - at < 3 * 864e5; });
  if (!me || me.user || !me.googleEnabled || hidden) return null;
  const go = () => signInWithGoogle(callback);

  if (variant === "banner") {
    return (
      <div className="relative flex flex-col gap-2 rounded-2xl border border-[#F5C000]/40 bg-[#F5C000]/10 p-3 pr-8 text-sm">
        <span><b>Playing as a guest.</b> <span className="text-[#E4E1FA]">Scores and streak aren&apos;t saved or ranked.</span></span>
        <button onClick={go} className="display self-start rounded-full bg-[#F5C000] px-3 py-1 text-xs text-deep">Save my progress</button>
        <button aria-label="Dismiss" onClick={() => { store("pm_nudge_hidden", Date.now()); setHidden(true); }} className="absolute right-2 top-2 text-muted"><X size={14} /></button>
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

/**
 * After a Mystery Cricketer day or a creator challenge: save it. Google for the full account (leaderboards, streak on
 * every device); or, for a guest who'd rather not, just a name so they stop showing as "Guest" on the challenge board.
 */
export function SaveSpot({ title, onSaved }: { title?: string; onSaved: () => void }) {
  const [me, setMe] = useMe();
  const [naming, setNaming] = useState(false);
  if (!me || me.user) return null;
  const unnamed = !me.profile || /^guest_\d+$/.test(me.profile.handle);
  if (!me.googleEnabled && !unnamed) return null;
  return (
    <section className="flex flex-col gap-2 rounded-2xl border-2 border-dashed border-[#F5C000]/50 bg-[#F5C000]/10 p-3 text-center">
      <p className="display text-lg">{title ? `Save your spot on ${title}` : "Don't lose today's score"}</p>
      <p className="text-xs text-[#E4E1FA]">{title ? "Right now you're listed as Guest." : "Guests aren't on the leaderboards."} Sign in free and it moves to your account{title ? " under your name" : ", with your streak and XP"}.</p>
      <div className="flex flex-wrap justify-center gap-2">
        {me.googleEnabled && <button onClick={() => signInWithGoogle()} className="btn-primary flex items-center gap-2 px-5 py-2.5"><GoogleLogo weight="bold" size={18} />Save with Google</button>}
        {unnamed && <button onClick={() => setNaming(true)} className="btn-ghost px-4 py-2.5 text-sm font-semibold">Just add my name</button>}
      </div>
      {naming && (
        <ProfileSetup initial={me.profile} suggestedCountry={me.suggestedCountry} user={null} googleEnabled={me.googleEnabled} onCancel={() => setNaming(false)}
          onDone={(profile) => { setNaming(false); setMe({ ...me, profile }); publishMe({ ...me, profile }); onSaved(); }} />
      )}
    </section>
  );
}
