"use client";

import { Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { legendOf } from "@/lib/legends";
import { store } from "@/lib/client";
import { publishMe, useMe } from "@/lib/useMe";
import { track } from "./Analytics";
import { Avatar } from "./Avatar";

type LockerRow = { id: string; name: string; owned: boolean; bought?: boolean; full?: boolean };

/**
 * One-tap switch between your own character, the legends you bought, and whatever you're wearing now (level unlocks live
 * in the Locker, not here). Optimistic: the new character shows at once
 * (full-body art is preloaded), the save happens in the background and rolls back if it fails.
 */
export function CharacterSwitcher({ compact = false, label }: { compact?: boolean; label?: string }) {
  const [me] = useMe();
  const [owned, setOwned] = useState<LockerRow[]>([]);
  useEffect(() => {
    void fetch("/api/locker", { cache: "no-store" }).then((r) => r.json()).then((d: { legends: LockerRow[] }) => {
      const mine = d.legends.filter((l) => l.bought);
      setOwned(mine);
      for (const l of mine) if (l.full) { const i = new Image(); i.src = `/legends/${l.id}/full.webp`; } // instant swap on the globe
    }, () => {});
  }, [me?.user]);
  if (!me?.profile) return null;
  const current = me.profile.avatar;
  // Your look, legends you bought, and the last few legends you've worn (so switching to a new one always leaves a
  // one-tap way back). Remembered on this device.
  const seen = [current, ...(store<string[]>("pm_worn") ?? [])].filter((c, i, a) => legendOf(c) && a.indexOf(c) === i).slice(0, 4);
  if (typeof window !== "undefined" && seen.join() !== (store<string[]>("pm_worn") ?? []).join()) store("pm_worn", seen);
  const codes = [...(me.customAvatar ? [me.customAvatar] : []), ...owned.map((l) => `legend:${l.id}`), ...seen].filter((c, i, a) => a.indexOf(c) === i);
  const options = codes.map((code) => ({ code, label: legendOf(code)?.name ?? "My player" }));
  if (options.length < 2) return null; // nothing to switch between

  async function pick(code: string) {
    if (!me?.profile || code === current) return;
    const prev = me;
    publishMe({ ...me, profile: { ...me.profile, avatar: code } }); // optimistic
    const res = await fetch("/api/me", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...me.profile, avatar: code }) }).catch(() => null);
    if (!res?.ok) publishMe(prev); else track("character_switched", { to: legendOf(code)?.id ?? "custom" });
  }

  const row = (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "" : "rounded-full bg-black/35 p-1.5 backdrop-blur-md ring-1 ring-white/10"}`} role="radiogroup" aria-label="Switch character">
      {options.map((o) => (
        <button key={o.code} role="radio" aria-checked={o.code === current} title={o.label} onClick={() => pick(o.code)}
          className={`rounded-full p-0.5 transition duration-200 ${o.code === current ? "scale-110 bg-ok" : "opacity-80 hover:scale-105 hover:opacity-100"}`}>
          <Avatar code={o.code} size={compact ? 34 : 40} />
        </button>
      ))}
      <Link href="/locker" title="Get more legends" aria-label="Get more legends" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-[#F5C000] !no-underline hover:bg-white/20"><Plus weight="bold" size={18} /></Link>
    </div>
  );
  return label ? <div className="px-2 py-1"><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>{row}</div> : row;
}
