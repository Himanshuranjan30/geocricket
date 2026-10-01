"use client";

import { CaretDown, Check, MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { COUNTRIES, CRICKET_NATIONS, countryName } from "@/lib/profile";
import { Flag } from "./Flag";

const OTHERS = COUNTRIES.filter((c) => !CRICKET_NATIONS.includes(c)).sort((a, b) => countryName(a).localeCompare(countryName(b)));

/** Searchable country picker with flags: cricket nations first. Keyboard: type to search, ↑/↓, Enter, Esc. */
export function CountrySelect({ value, onChange, id }: { value: string; onChange: (c: string) => void; id?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const items = useMemo(() => {
    const f = (c: string) => !q || countryName(c).toLowerCase().includes(q.toLowerCase()) || c.toLowerCase() === q.toLowerCase();
    return [...CRICKET_NATIONS.filter(f).map((c) => ({ c, group: "Cricket nations" })), ...OTHERS.filter(f).map((c) => ({ c, group: "All countries" }))];
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  useEffect(() => { list.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" }); }, [hi]);

  const choose = (c: string) => { onChange(c); setOpen(false); setQ(""); };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(items.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (items[hi]) choose(items[hi].c); }
    else if (e.key === "Escape") { e.stopPropagation(); setOpen(false); }
  };

  return (
    <div ref={box} className="relative">
      <button type="button" id={id} aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen((o) => !o); setHi(0); }}
        className={`flex w-full items-center gap-3 rounded-xl border bg-deep px-3 py-3 text-left transition ${open ? "border-ok ring-2 ring-ok/30" : "border-line hover:border-white/30"}`}>
        <Flag code={value} size={20} />
        <span className="flex-1 font-semibold">{countryName(value)}</span>
        <CaretDown size={16} weight="bold" className={`text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="rise absolute inset-x-0 bottom-full z-30 mb-2 overflow-hidden rounded-2xl border border-white/15 bg-[#1E1760] shadow-[0_20px_50px_rgba(0,0,0,.6)]">
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
            <MagnifyingGlass size={16} className="text-muted" />
            <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} onKeyDown={key} placeholder="Search countries"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" aria-label="Search countries" />
          </div>
          <ul ref={list} role="listbox" aria-label="Country" className="max-h-64 overflow-y-auto p-1.5">
            {items.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No match</li>}
            {items.map((it, i) => (
              <li key={it.c}>
                {(i === 0 || items[i - 1].group !== it.group) && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{it.group}</p>}
                <button type="button" role="option" aria-selected={it.c === value} data-i={i} onMouseEnter={() => setHi(i)} onClick={() => choose(it.c)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === hi ? "bg-white/10" : ""}`}>
                  <Flag code={it.c} size={18} /><span className="flex-1">{countryName(it.c)}</span>
                  {it.c === value && <Check weight="bold" size={16} className="text-ok" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
