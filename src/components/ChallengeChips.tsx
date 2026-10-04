import { CHALLENGES, type ChallengeId } from "@/lib/game";

/** Which of the day's five public challenges a player has played: filled chip = played (title shows the points). */
export function ChallengeChips({ games, size = "sm" }: { games?: Partial<Record<ChallengeId, number>>; size?: "xs" | "sm" }) {
  return (
    <span className="flex gap-0.5" aria-label="Challenges played">
      {CHALLENGES.map((c) => {
        const pts = games?.[c.id];
        return (
          <span key={c.id} title={pts == null ? `${c.name}: not played` : `${c.name}: ${pts} pts`}
            className={`display rounded px-1 leading-4 ${size === "xs" ? "text-[9px]" : "text-[10px]"} ${pts == null ? "bg-white/5 text-white/30" : "bg-ok/20 text-ok"}`}>
            {c.short}
          </span>
        );
      })}
    </span>
  );
}
