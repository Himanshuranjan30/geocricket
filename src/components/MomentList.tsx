import Link from "next/link";
import { slug, type Moment } from "@/lib/seo";

/** A list of cricket moments with their story, linking each to its page (and to player / ground hubs). */
export function MomentList({ moments, show }: { moments: Moment[]; show: "ground" | "player" | "both" }) {
  return (
    <ol className="flex flex-col gap-3">
      {moments.map((m) => (
        <li key={m.id} className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <Link href={`/moments/${m.id}`} className="!text-cream !no-underline"><b className="block text-[16px] leading-snug">{m.story || m.text}</b></Link>
          <span className="mt-1 block text-xs text-muted">
            {m.when}
            {show !== "player" && <> · <Link href={`/grounds/${slug(m.ground)}`}>{m.ground}</Link></>}
            {show !== "ground" && m.player && <> · <Link href={`/players/${slug(m.player)}`}>{m.player}</Link></>}
          </span>
        </li>
      ))}
    </ol>
  );
}
