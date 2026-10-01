import { Trophy } from "@phosphor-icons/react/dist/ssr";

const MEDAL = ["#FFC83D", "#D7DCE6", "#E3955B"]; // gold, silver, bronze

/** Leaderboard position: medal trophies for the top three, #n after. */
export function Rank({ n, className = "" }: { n: number; className?: string }) {
  if (n <= 3) return <Trophy weight="fill" size={22} color={MEDAL[n - 1]} className={className} aria-label={`Rank ${n}`} />;
  return <span className={`display text-muted ${className}`}>#{n}</span>;
}
