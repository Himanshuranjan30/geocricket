"use client";

import { Lightning, Robot, UserPlus } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { WL } from "@/lib/whoLive";
import type { Profile } from "@/lib/profile";
import { track } from "./Analytics";
import { AccountMenu } from "./AccountMenu";
import { Logo } from "./Logo";
import { ProfileSetup, type Account } from "./ProfileSetup";

type Me = { profile: Profile | null; user: Account; googleEnabled: boolean; suggestedCountry: string | null };

/** /mystery/duel: Name Race lobby. Quick match (a bot steps in if nobody comes), invite a friend, or race the bot. */
export function WhoDuelLobby() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState<"quick" | "private" | "bot" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<"quick" | "private" | "bot" | null>(null);

  useEffect(() => { fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then(setMe, () => {}); }, []);

  async function start(mode: "quick" | "private" | "bot") {
    if (!me?.profile) { setSetup(mode); return; }
    setBusy(mode); setError(null);
    const res = await fetch("/api/who-duel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? "Couldn't start a duel."); setBusy(null); return; }
    track("who_duel_start", { mode, matched: data.matched });
    router.push(`/mystery/duel/${data.id}`);
  }

  return (
    <main className="night-sky fixed inset-0 overflow-y-auto px-4 pb-10 pt-[calc(env(safe-area-inset-top)+16px)]">
      <div className="stars" aria-hidden />
      <div className="tv-ui relative mx-auto flex max-w-[520px] flex-col gap-6">
        <header className="flex items-center justify-between"><Logo />
          <AccountMenu />
        </header>
        <div className="text-center">
          <p className="display text-sm tracking-[.16em] text-muted">Mystery Cricketer · Live 1v1</p>
          <h1 className="display mt-1 text-[clamp(44px,12vw,72px)] leading-[.9]">Name Race</h1>
          <p className="mx-auto mt-3 max-w-[40ch] text-[#E4E1FA]">Same clues, same moment: the ground, the match, the numbers, the trail. First to name the cricketer wins the round. First to {WL.WIN}.</p>
        </div>
        <ul className="grid grid-cols-3 gap-2 text-center text-xs text-muted">
          {[[`First to ${WL.WIN}`, `of ${WL.ROUNDS} players`], [`${(WL.CLUE_AT[2] - WL.CLUE_AT[1]) / 1000} s`, "per clue"], ["Locked", "after a wrong name"]].map(([a, b]) => (
            <li key={a} className="hud-box px-2 py-2.5"><div className="display text-lg text-cream">{a}</div>{b}</li>
          ))}
        </ul>
        <button className="btn-primary flex items-center justify-center gap-3 py-5 text-[26px]" onClick={() => start("quick")} disabled={!!busy}>
          <Lightning weight="fill" size={26} />{busy === "quick" ? "Finding a rival…" : "Quick match"}
        </button>
        <button className="btn-ghost flex items-center justify-center gap-2 py-4 text-lg font-semibold" onClick={() => start("private")} disabled={!!busy}>
          <UserPlus weight="bold" size={20} />{busy === "private" ? "Creating…" : "Invite a friend"}
        </button>
        <button className="btn-ghost flex items-center justify-center gap-2 py-3 font-semibold" onClick={() => start("bot")} disabled={!!busy}>
          <Robot weight="fill" size={20} />{busy === "bot" ? "Starting…" : "Practise against the bot"}
        </button>
        {error && <p role="alert" className="text-center text-sm text-[#FF8F9C]">{error}</p>}
        <p className="text-center text-sm text-muted"><Link href="/mystery" className="hover:underline">Today&apos;s Mystery Cricketer</Link> · <Link href="/" className="hover:underline">Home</Link></p>
      </div>
      {setup && me && (
        <ProfileSetup initial={null} suggestedCountry={me.suggestedCountry} user={me.user} googleEnabled={me.googleEnabled} onCancel={() => setSetup(null)}
          onDone={(profile) => { const m = setup; setMe({ ...me, profile }); setSetup(null); void (async () => { await new Promise((r) => setTimeout(r, 0)); start(m); })(); }} />
      )}
    </main>
  );
}
