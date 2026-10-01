import { countryName } from "@/lib/profile";

/** SVG country flag (emoji flags show as two letters on Windows). Files are copied to public/flags on install. */
export function Flag({ code, size = 18, className = "" }: { code: string | null | undefined; size?: number; className?: string }) {
  if (!code || !/^[A-Z]{2}$/.test(code)) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static SVG
    <img src={`/flags/${code}.svg`} alt={countryName(code)} title={countryName(code)} width={Math.round(size * 1.5)} height={size}
      className={`inline-block shrink-0 rounded-[3px] object-cover shadow-[0_0_0_1px_rgba(255,255,255,.15)] ${className}`} />
  );
}
