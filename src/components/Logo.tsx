import Link from "next/link";

export function Logo({ small = false }: { small?: boolean }) {
  const s = small ? 26 : 34;
  return (
    <Link href="/" aria-label="GeoCricket home" className={`display flex shrink-0 items-center gap-2 whitespace-nowrap pr-1.5 !no-underline ${small ? "text-base" : "text-[22px]"} [text-shadow:0_2px_0_rgba(0,0,0,.3)]`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static brand mark */}
      <img src="/logo-mark.webp" alt="" width={s} height={s} className="rounded-[28%] shadow-[0_0_14px_rgba(120,90,255,.55)]" />
      <span className="!text-cream">Geo<span className="text-[#FF5A6E]">Cricket</span></span>
    </Link>
  );
}
