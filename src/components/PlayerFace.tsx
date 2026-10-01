/* eslint-disable @next/next/no-img-element -- tiny self-hosted thumbnails; next/image would add a resize hop for nothing */

// Team colours for the initials badge when we have no photo (and as the ring colour around photos).
const TEAM: Record<string, string> = {
  India: "#1F6FEB", Australia: "#E8B400", England: "#C8102E", "New Zealand": "#1d1d1d", "South Africa": "#007749", Pakistan: "#01411C",
  "Sri Lanka": "#0B3D91", "West Indies": "#7B1E3A", Bangladesh: "#006A4E", Afghanistan: "#1564C0", Ireland: "#169B62", Zimbabwe: "#D40000",
};
export const teamColor = (team: string) => TEAM[team.replace(/ women$/, "")] ?? "#5A50B0";
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/** A player's face: their Commons portrait (public/players/<id>.jpg) or initials on their team colour. */
export function PlayerFace({ id, name, team, photo, size = 40, className = "" }: { id: string; name: string; team: string; photo?: boolean; size?: number; className?: string }) {
  const ring = teamColor(team);
  return (
    <span className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size, boxShadow: `0 0 0 2px ${ring}`, background: photo ? "#1b1340" : ring }} aria-hidden>
      {photo
        ? <img src={`/players/${id}.jpg`} alt="" width={size} height={size} loading="lazy" decoding="async" className="h-full w-full object-cover object-top" />
        : <span className="display text-cream" style={{ fontSize: size * 0.38 }}>{initials(name)}</span>}
    </span>
  );
}

/** The unknown player: a silhouette in a glowing ring. */
export function Mystery({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`mystery inline-grid shrink-0 place-items-center rounded-full ${className}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 64 64" width={size * 0.72} height={size * 0.72}>
        <circle cx="32" cy="24" r="12" fill="currentColor" />
        <path d="M10 60c2-13 11-20 22-20s20 7 22 20z" fill="currentColor" />
        <text x="32" y="30" textAnchor="middle" fontSize="15" fontWeight="900" fill="#120E3A" fontFamily="inherit">?</text>
      </svg>
    </span>
  );
}
