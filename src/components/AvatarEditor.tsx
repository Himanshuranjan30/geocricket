"use client";

import { Shuffle } from "@phosphor-icons/react";
import { useState } from "react";
import { avatarCode, type Jersey } from "@/lib/avatar";
import { encodeLook, hairShows, HAIRS, HEADS, SKINS, type Look } from "@/lib/rig";
import { Avatar } from "./Avatar";
import { PlayerFigure } from "./PlayerFigure";

type Tab = "skin" | "head" | "hair" | "beard";
const TABS: { id: Tab; label: string }[] = [{ id: "skin", label: "Skin" }, { id: "head", label: "Hair" }, { id: "hair", label: "Hair colour" }, { id: "beard", label: "Beard" }];

/** Character builder: every option here is exactly what the full-body player and the round avatar show. */
export function AvatarEditor({ look, jersey, onChange, onRandom, wide = false }: { look: Look; jersey: Jersey; onChange: (l: Look) => void; onRandom: () => void; wide?: boolean }) {
  const [tab, setTab] = useState<Tab>("skin");
  const code = (l: Look) => avatarCode(encodeLook(l), jersey);
  const noBeard = HEADS[look.head].id === "hijab";
  const options: { key: string; label: string; on: boolean; pick: Look; swatch?: string }[] =
    tab === "skin" ? SKINS.map((s, i) => ({ key: s.id, label: s.label, on: look.skin === i, pick: { ...look, skin: i }, swatch: s.hex }))
    : tab === "head" ? HEADS.map((h, i) => ({ key: h.id, label: h.label, on: look.head === i, pick: { ...look, head: i, beard: h.id === "hijab" ? 0 : look.beard } }))
    : tab === "hair" ? HAIRS.map((h, i) => ({ key: h.id, label: h.label, on: look.hair === i, pick: { ...look, hair: i }, swatch: h.hex }))
    : [{ key: "none", label: "Clean-shaven", on: !look.beard, pick: { ...look, beard: 0 as const } }, ...(noBeard ? [] : [{ key: "beard", label: "Beard", on: !!look.beard, pick: { ...look, beard: 1 as const } }])];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-center gap-3 min-[400px]:justify-start min-[400px]:gap-4">
        <PlayerFigure code={code(look)} className="h-32 shrink-0 min-[400px]:h-40" />
        <Avatar code={code(look)} size={96} className="ring-2 ring-ok/70" />
        <button type="button" onClick={onRandom} className="btn-ghost self-center px-3.5 py-2 text-sm"><Shuffle weight="bold" size={16} className="-mt-0.5 mr-1.5 inline" />Surprise me</button>
      </div>
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`display shrink-0 rounded-full px-3 py-1.5 text-xs ${tab === t.id ? "bg-ok text-deep" : "bg-white/10 text-cream"}`}>{t.label}</button>
        ))}
      </div>
      {tab === "hair" && !hairShows(look) && <p className="text-xs text-muted">Covered by the {HEADS[look.head].label.toLowerCase()} — shows on your beard.</p>}
      {tab === "beard" && noBeard && <p className="text-xs text-muted">Not available with a hijab.</p>}
      <div className={`grid grid-cols-4 gap-2 ${wide ? "lg:grid-cols-7" : "sm:grid-cols-6"}`} role="radiogroup" aria-label={TABS.find((t) => t.id === tab)!.label}>
        {options.map((o) => (
          <button key={o.key} type="button" role="radio" aria-checked={o.on} aria-label={o.label} title={o.label} onClick={() => onChange(o.pick)}
            className={`flex flex-col items-center gap-1 rounded-xl p-1.5 transition ${o.on ? "bg-ok/30 ring-2 ring-ok" : "bg-white/5 hover:bg-white/10"}`}>
            {o.swatch ? <span className="h-11 w-11 rounded-full border-2 border-white/20" style={{ background: `#${o.swatch}` }} /> : <Avatar code={code(o.pick)} size={44} />}
            <span className="text-[10px] leading-tight text-muted">{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
