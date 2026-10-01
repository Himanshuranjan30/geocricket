"use client";

import { Ghost } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ensurePlayer } from "@/lib/client";
import { track } from "./Analytics";

/** /ghost: find a ghost (lib/ghost.ts) and go straight to its duel, or explain why there isn't one. */
export function GhostStart() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false); // dev StrictMode runs effects twice: one ghost per visit
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    track("ghost_started");
    (async () => {
      if (!(await ensurePlayer())) throw new Error("Couldn't set up your player. Try again.");
      const r = await fetch("/api/duels/ghost", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't find a ghost right now.");
      router.replace(`/duel/${d.id}`);
    })().catch((e) => setError(e.message));
  }, [router]);
  return (
    <main className="night-sky fixed inset-0 grid place-items-center px-4">
      <div className="stars" aria-hidden />
      <div className="tv-ui glass rise relative flex w-full max-w-[420px] flex-col items-center gap-4 rounded-[28px] p-6 text-center">
        <Ghost weight="duotone" size={40} className="text-ok" />
        {error ? (
          <>
            <p>{error}</p>
            <p className="text-sm text-muted">Meanwhile, replay a past game and see where you&apos;d have ranked, or send a friend 5 balls to beat.</p>
            <div className="flex w-full flex-col gap-2">
              <Link href="/archive" className="btn-primary px-5 py-3">Play the archive</Link>
              <div className="flex gap-2"><Link href="/nets" className="btn-ghost flex-1 px-5 py-3">Nets · challenge a friend</Link><Link href="/" className="btn-ghost px-5 py-3">Home</Link></div>
            </div>
          </>
        ) : <p className="display animate-pulse text-xl text-muted">Finding a ghost at your level…</p>}
      </div>
    </main>
  );
}
