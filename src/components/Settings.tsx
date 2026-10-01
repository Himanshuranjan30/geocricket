"use client";

import { Crown, GoogleLogo, SignOut } from "@phosphor-icons/react";
import Link from "next/link";
import { signInWithGoogle, signOut } from "@/lib/auth-client";
import { fetchMe, useMe } from "@/lib/useMe";
import { AccountMenu } from "./AccountMenu";
import { Avatar } from "./Avatar";
import { CharacterSwitcher } from "./CharacterSwitcher";
import { Logo } from "./Logo";
import { NotifySettings } from "./NotifySettings";
import { ProfileSetup } from "./ProfileSetup";

/** /settings: your character (avatar, handle, country), account, and links. */
export function Settings() {
  const [me, setMe] = useMe();
  const wearingLegend = me?.profile?.avatar.startsWith("legend:");
  return (
    <main className="night-sky min-h-screen px-4 pb-16 pt-[calc(env(safe-area-inset-top)+16px)]">
      <div className="stars" aria-hidden />
      <div className="tv-ui relative mx-auto flex max-w-[560px] flex-col gap-6">
        <header className="flex items-center justify-between"><Logo /><AccountMenu /></header>
        <h1 className="display text-4xl">Settings</h1>
        {!me ? <p className="text-muted">Loading…</p> : (
          <>
            <section id="character" className="glass flex flex-col gap-4 rounded-3xl p-5">
              <h2 className="display text-xl">Your character</h2>
              <CharacterSwitcher compact label="Play as" />
              {wearingLegend && (
                <p className="flex items-center gap-2 rounded-xl bg-white/5 p-3 text-sm"><Avatar code={me.profile!.avatar} size={36} />
                  You&apos;re playing as a legend. Saving a look below switches back to your own character. <Link href="/locker" className="ml-auto shrink-0 text-ok">Locker</Link></p>
              )}
              <ProfileSetup inline initial={me.profile} suggestedCountry={me.suggestedCountry} user={me.user} googleEnabled={me.googleEnabled}
                onDone={async (profile) => { setMe({ ...(await fetchMe(true)), profile }); }} />
            </section>
            <section className="glass flex flex-col gap-3 rounded-3xl p-5">
              <h2 className="display text-xl">Account</h2>
              {me.user ? (
                <>
                  <p className="text-sm">Signed in with Google as <b>{me.user.email}</b>. Your scores, streak, XP and legends are saved to this account.</p>
                  <button onClick={signOut} className="btn-ghost flex items-center justify-center gap-2 py-3 font-semibold"><SignOut size={18} />Sign out</button>
                </>
              ) : (
                <>
                  <p className="text-sm text-[#E4E1FA]">You&apos;re playing as a guest. Scores stay on this device and aren&apos;t on leaderboards. Signing in keeps everything you&apos;ve played so far.</p>
                  {me.googleEnabled && <button onClick={() => signInWithGoogle("/settings?welcome=1")} className="btn-primary flex items-center justify-center gap-2 py-3 text-lg"><GoogleLogo weight="bold" size={18} />Sign in with Google</button>}
                </>
              )}
            </section>
            <section className="glass flex flex-col gap-3 rounded-3xl p-5">
              <h2 className="display text-xl">Notifications</h2>
              <NotifySettings />
            </section>
            <section className="glass flex flex-col gap-2 rounded-3xl p-5 text-sm">
              <Link href="/locker" className="flex items-center gap-2 font-semibold !text-cream"><Crown size={18} className="text-[#F5C000]" />Legends Locker</Link>
              <Link href="/how-it-works" className="!text-cream">How to play</Link>
              <Link href="/privacy" className="!text-cream">Privacy</Link>
              <Link href="/about" className="!text-cream">About</Link>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
