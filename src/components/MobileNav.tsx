"use client";

import { Archive, CalendarCheck, Crown, Ghost, Info, Lightning, List, Medal, Play, Ranking, SquaresFour, Target, Trophy, UserCircle, UsersThree, X, GearSix } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";

// Every destination, grouped the way players think about them. Same options as the desktop nav and mode cards.
const GROUPS: { title: string; items: { href: string; label: string; sub: string; icon: React.ReactNode }[] }[] = [
  { title: "Play", items: [
    { href: "/play", label: "Daily Challenge", sub: "5 balls · new every day", icon: <CalendarCheck weight="duotone" /> },
    { href: "/ghost", label: "Ghost Race", sub: "Instant 1v1 vs a real player's run", icon: <Ghost weight="duotone" /> },
    { href: "/nets", label: "Nets", sub: "Unlimited practice · earn XP", icon: <Target weight="duotone" /> },
    { href: "/archive", label: "Archive", sub: "Every past game", icon: <Archive weight="duotone" /> },
  ] },
  { title: "Compete", items: [
    { href: "/live", label: "Live 1v1", sub: "Same ball, same moment", icon: <Lightning weight="duotone" /> },
    { href: "/cups", label: "Cups", sub: "Knockout tournaments", icon: <Trophy weight="duotone" /> },
    { href: "/league", label: "League", sub: "Weekly · move up a tier", icon: <Ranking weight="duotone" /> },
    { href: "/groups", label: "Groups", sub: "Your friends' board", icon: <UsersThree weight="duotone" /> },
    { href: "/leaderboard", label: "Leaderboards", sub: "Ranking, points, streaks", icon: <Medal weight="duotone" /> },
  ] },
  { title: "You", items: [
    { href: "/locker", label: "Legends Locker", sub: "Play as cricket's greatest", icon: <Crown weight="duotone" /> },
    { href: "/profile", label: "Career & badges", sub: "XP, level, titles", icon: <UserCircle weight="duotone" /> },
    { href: "/settings", label: "Settings", sub: "Character, sign-in, sound", icon: <GearSix weight="duotone" /> },
    { href: "/how-it-works", label: "How to play", sub: "Scoring, games, streaks", icon: <Info weight="duotone" /> },
  ] },
];

/**
 * Phones and tablets: a bottom tab bar (Play, Modes, Boards, Legends, Menu) so every mode is one tap away, and a full
 * menu sheet with every destination. Hidden on desktop, which has the header nav and side columns.
 */
export function MobileNav({ onPlay }: { onPlay: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [open]);
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const tab = "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-semibold text-[#CFC8F5] active:scale-95";
  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#120E3A]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-[560px]">
          <button className={`${tab} !text-ok`} onClick={onPlay}><Play weight="fill" size={22} />Play</button>
          <button className={tab} onClick={() => jump("modes")}><SquaresFour weight="duotone" size={22} />Modes</button>
          <button className={tab} onClick={() => jump("boards")}><Medal weight="duotone" size={22} />Boards</button>
          <Link href="/locker" className={`${tab} !no-underline`}><Crown weight="duotone" size={22} className="text-[#F5C000]" />Legends</Link>
          <button className={tab} onClick={() => setOpen(true)} aria-expanded={open} aria-haspopup="dialog"><List weight="bold" size={22} />Menu</button>
        </div>
      </nav>

      {open && (
        <div role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-50 flex flex-col bg-[rgba(10,7,40,.97)] backdrop-blur-md lg:hidden">
          <div className="flex items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top)+14px)]">
            <span className="display text-xl">Menu</span>
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-10 w-10 place-items-center rounded-full bg-white/10"><X weight="bold" size={20} /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+24px)]">
            {GROUPS.map((g) => (
              <section key={g.title} className="mt-4">
                <h2 className="display mb-2 text-[11px] tracking-[.16em] text-muted">{g.title}</h2>
                <ul className="grid grid-cols-1 gap-1.5 min-[480px]:grid-cols-2">
                  {g.items.map((it) => (
                    <li key={it.href}>
                      <Link href={it.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2.5 !text-cream !no-underline active:bg-white/10">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-[22px] text-[#F5C000]">{it.icon}</span>
                        <span className="min-w-0"><b className="block text-[15px] leading-tight">{it.label}</b><span className="block truncate text-xs text-muted">{it.sub}</span></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
