"use client";

import { Bug, CaretDown, Crown, Medal, GearSix, GoogleLogo, PencilSimple, SignOut, Trophy, UserCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signInWithGoogle, signOut } from "@/lib/auth-client";
import { titleFor } from "@/lib/level";
import { useMe } from "@/lib/useMe";
import { Avatar } from "./Avatar";
import { NotificationBell } from "./NotificationBell";
import { CharacterSwitcher } from "./CharacterSwitcher";
import { Flag } from "./Flag";

/** Top-right account control on every screen: profile chip + menu (character, legends, settings, sign in/out). */
export function AccountMenu({ onEdit, compact = false }: { onEdit?: () => void; compact?: boolean }) {
  const [me] = useMe();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (!me) return <span className="h-10 w-10" aria-hidden />;
  const guest = !me.user;
  const signIn = () => signInWithGoogle(`${window.location.pathname}?welcome=1`);
  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold !text-cream !no-underline hover:bg-white/10";

  return (
    <div ref={box} className="relative flex items-center gap-2">
      {me.profile && <NotificationBell />}
      {guest && me.googleEnabled && (
        <button onClick={signIn} className="btn-primary hidden shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-sm sm:flex"><GoogleLogo weight="bold" size={16} />Sign in</button>
      )}
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-white/10">
        {me.profile ? <Avatar code={me.profile.avatar} size={38} className="ring-2 ring-white/20" /> : <UserCircle weight="fill" size={38} className="text-white/70" />}
        <span className={`${compact ? "hidden" : "hidden md:block"} whitespace-nowrap text-left leading-tight`}>
          <b className="display flex items-center gap-1.5 text-sm">{me.profile && !guest ? `@${me.profile.handle}` : "Guest"}{me.profile && <Flag code={me.profile.country} size={12} />}</b>
          <span className="text-xs text-muted">{guest ? "Progress not saved" : `Lvl ${me.level?.level ?? 1} · ${titleFor(me.level?.level ?? 1)}`}</span>
        </span>
        <CaretDown size={12} weight="bold" className="text-muted" />
      </button>
      {open && (
        <div role="menu" className="glass absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl p-2 shadow-2xl">
          {guest ? (
            <div className="mb-1 rounded-xl bg-white/5 p-3 text-sm">
              <p className="font-semibold">You&apos;re playing as a guest</p>
              <p className="mt-0.5 text-xs text-muted">Scores stay on this device and aren&apos;t on leaderboards. Sign in free to save everything.</p>
              {me.googleEnabled && <button onClick={signIn} className="btn-primary mt-2.5 flex w-full items-center justify-center gap-2 py-2 text-sm"><GoogleLogo weight="bold" size={16} />Sign in with Google</button>}
            </div>
          ) : (
            <div className="mb-1 flex items-center gap-2.5 rounded-xl bg-white/5 p-3">
              {me.profile && <Avatar code={me.profile.avatar} size={40} />}
              <div className="min-w-0 leading-tight"><b className="block truncate">@{me.profile?.handle}</b><span className="block truncate text-xs text-muted">{me.user?.email}</span></div>
            </div>
          )}
          <CharacterSwitcher compact label="Play as" />
          {onEdit ? <button role="menuitem" className={item} onClick={() => { setOpen(false); onEdit(); }}><PencilSimple size={18} />Edit character</button>
            : <Link role="menuitem" className={item} href="/settings#character"><PencilSimple size={18} />Edit character</Link>}
          <Link role="menuitem" className={item} href="/profile"><Medal size={18} className="text-[#F5C000]" />My career &amp; badges</Link>
          <Link role="menuitem" className={item} href="/locker"><Crown size={18} className="text-[#F5C000]" />Legends Locker</Link>
          <Link role="menuitem" className={item} href="/leaderboard"><Trophy size={18} />Leaderboards</Link>
          <Link role="menuitem" className={item} href="/settings"><GearSix size={18} />Settings</Link>
          <Link role="menuitem" className={item} href={`/feedback?from=${encodeURIComponent(path)}`}><Bug size={18} />Report a bug / feedback</Link>
          {!guest && <button role="menuitem" className={item} onClick={signOut}><SignOut size={18} />Sign out</button>}
        </div>
      )}
    </div>
  );
}
