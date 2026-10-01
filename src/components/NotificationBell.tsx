"use client";

import { Bell, Checks } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "./Analytics";

type Item = { id: string; kind: string; title: string; body: string; url: string; createdMs: number; readMs: number | null };

const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

/** In-app notification centre: bell with unread count, dropdown list. Refreshes every minute and when the tab regains focus. */
export function NotificationBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const load = useCallback(() => fetch("/api/notifications", { cache: "no-store" }).then((r) => r.json()).then((d) => { setItems(d.items ?? []); setUnread(d.unread ?? 0); }, () => {}), []);
  useEffect(() => {
    void load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 60_000); // hidden tabs don't poll
    const f = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", f);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", f); };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const read = (ids?: string[]) => {
    setItems((xs) => xs.map((x) => (!ids || ids.includes(x.id) ? { ...x, readMs: x.readMs ?? Date.now() } : x)));
    setUnread((u) => (ids ? Math.max(0, u - ids.length) : 0));
    void fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
  };

  return (
    <div ref={box} className="relative">
      <button onClick={() => { setOpen((o) => !o); if (!open) track("bell_opened", { unread }); }} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-haspopup="menu" aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-white/10">
        <Bell weight={unread ? "fill" : "regular"} size={22} className={unread ? "text-[#F5C000]" : "text-cream"} />
        {unread > 0 && <span className="display absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#FF5A6E] px-1 text-[10px] text-white ring-2 ring-[var(--night)]">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div role="menu" className="glass rise absolute right-0 top-full z-40 mt-2 w-[min(92vw,360px)] max-sm:fixed max-sm:inset-x-3 max-sm:top-[calc(env(safe-area-inset-top)+64px)] max-sm:mt-0 max-sm:w-auto overflow-hidden rounded-2xl shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <b className="display text-sm">Notifications</b>
            {unread > 0 && <button onClick={() => read()} className="flex items-center gap-1 text-xs font-semibold text-ok"><Checks size={14} />Mark all read</button>}
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">You&apos;re all caught up.</li>}
            {items.map((n) => (
              <li key={n.id}>
                <Link href={n.url} onClick={() => { if (!n.readMs) read([n.id]); setOpen(false); track("notification_clicked", { kind: n.kind }); }}
                  className={`flex gap-3 border-b border-white/5 px-4 py-3 !text-cream !no-underline hover:bg-white/5 ${n.readMs ? "opacity-70" : ""}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-snug">{n.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">{n.body}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5 text-[11px] text-muted">{ago(n.createdMs)}{!n.readMs && <span className="h-2 w-2 rounded-full bg-[#FF5A6E]" />}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
