import Link from "next/link";
import { AccountMenu } from "./AccountMenu";
import { SideRails } from "./AdSlot";
import { Logo } from "./Logo";

/** Shell for text pages: leaderboard, archive, moments, info. */
export function Page({ title, eyebrow, children }: { title: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-[radial-gradient(120%_60%_at_50%_0%,#3A2FA0_0%,var(--night)_40%,var(--deep)_100%)] px-4 pb-16 pt-[calc(env(safe-area-inset-top)+16px)]">
      <SideRails />
      <div className="tv-ui mx-auto flex min-w-0 max-w-[640px] flex-col gap-6">
        <header className="flex items-center justify-between">
          <Logo />
          <div className="flex shrink-0 items-center gap-2"><Link href="/" className="btn-primary hidden whitespace-nowrap px-4 py-2 text-base sm:block">Play today →</Link><AccountMenu compact /></div>
        </header>
        <div>
          {eyebrow && <p className="display text-[13px] font-semibold tracking-[.16em] text-muted">{eyebrow}</p>}
          <h1 className="display mt-1 text-[clamp(36px,9vw,56px)] font-extrabold leading-none [text-wrap:balance]">{title}</h1>
        </div>
        <div className="flex min-w-0 flex-col gap-4 text-[15.5px] [&>*]:min-w-0 leading-relaxed text-[#E4E1FA] [&_a]:text-ok [&_a]:underline-offset-4 hover:[&_a]:underline [&_h2]:display [&_h2]:mt-4 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-cream">
          {children}
        </div>
        <footer className="border-t border-line pt-4 text-xs leading-normal text-[#8B84C9]">
          <nav className="mb-2 flex flex-wrap gap-4">
            <Link href="/nets">Nets</Link><Link href="/cups">Cups</Link><Link href="/grounds">Grounds</Link><Link href="/players">Players</Link><Link href="/moments">Moments</Link><Link href="/archive">Archive</Link><Link href="/leaderboard">Leaderboard</Link><Link href="/prize">Win ₹100</Link>
            <Link href="/how-it-works">How it works</Link><Link href="/about">About</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/refunds">Refunds</Link><Link href="/feedback">Feedback</Link>
          </nav>
          GeoCricket is not affiliated with BCCI, IPL, ICC or any team. Map borders follow the Survey of India depiction. Map data © OpenStreetMap contributors, © OpenMapTiles; imagery Sentinel-2 cloudless by EOX (<a href="/about">credits</a>).
        </footer>
      </div>
    </div>
  );
}
