"use client";

import { Lightning, UserPlus } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LIVE } from "@/lib/live";
import type { Profile } from "@/lib/profile";
import { track } from "./Analytics";
import { AccountMenu } from "./AccountMenu";
import { Logo } from "./Logo";
import { ProfileSetup, type Account } from "./ProfileSetup";

type Me = { profile: Profile | null; user: Account; googleEnabled: boolean; suggestedCountry: string | null };

/** /live: pick Quick match (random opponent) or a private duel to send to a friend. */
export function LiveLobby() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState<"quick" | "private" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<"quick" | "private" | null>(null);

  useEffect(() => { fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then(setMe, () => {}); }, []);

  async function start(mode: "quick" | "private") {
    if (!me?.profile) { setSetup(mode); return; }
    setBusy(mode); setError(null);
    const res = await fetch("/api/live", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? "Couldn't start a duel."); setBusy(null); return; }
    track("live_started", { mode, matched: data.matched });
    router.push(`/live/${data.id}`);
  }

  return (
    <main className="night-sky fixed inset-0 overflow-y-auto px-4 pb-10 pt-[calc(env(safe-area-inset-top)+16px)]">
      <div className="stars" aria-hidden />
      <div className="tv-ui relative mx-auto flex max-w-[520px] flex-col gap-6">
        <header className="flex items-center justify-between"><Logo />
          <AccountMenu />
        </header>
        <div className="text-center">
          <p className="display text-sm tracking-[.16em] text-muted">Live 1v1</p>
          <h1 className="display mt-1 text-[clamp(44px,12vw,72px)] leading-[.9]">Duel</h1>
          <p className="mx-auto mt-3 max-w-[40ch] text-[#E4E1FA]">Same question, same moment. The closer ball wins the round and takes health off your rival. First to zero loses.</p>
        </div>
        <ul className="grid grid-cols-3 gap-2 text-center text-xs text-muted">
          {[[`${LIVE.HP.toLocaleString("en-IN")} HP`, "each"], [`${LIVE.AFTER_FIRST_MS / 1000} s`, "after first guess"], ["×3", "damage late on"]].map(([a, b]) => (
            <li key={a} className="hud-box px-2 py-2.5"><div className="display text-lg text-cream">{a}</div>{b}</li>
          ))}
        </ul>
        <button className="btn-primary flex items-center justify-center gap-3 py-5 text-[26px]" onClick={() => start("quick")} disabled={!!busy}>
          <Lightning weight="fill" size={26} />{busy === "quick" ? "Finding a rival…" : "Quick match"}
        </button>
        <button className="btn-ghost flex items-center justify-center gap-2 py-4 text-lg font-semibold" onClick={() => start("private")} disabled={!!busy}>
          <UserPlus weight="bold" size={20} />{busy === "private" ? "Creating…" : "Invite a friend"}
        </button>
        {error && <p role="alert" className="text-center text-sm text-[#FF8F9C]">{error}</p>}
        <Link href="/" className="text-center text-sm text-muted hover:underline">← Back home</Link>
      </div>
      {setup && me && (
        <ProfileSetup initial={null} suggestedCountry={me.suggestedCountry} user={me.user} googleEnabled={me.googleEnabled} onCancel={() => setSetup(null)}
          onDone={(profile) => { const m = setup; setMe({ ...me, profile }); setSetup(null); void (async () => { await new Promise((r) => setTimeout(r, 0)); start(m); })(); }} />
      )}
    </main>
  );
}
