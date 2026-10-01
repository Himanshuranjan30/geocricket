import { CalendarCheck, Crown, Fire, Lock, Medal as MedalIcon, Rocket, Star, Sword, Target, Trophy, Volleyball } from "@phosphor-icons/react";
import { useId } from "react";

// Metal for each tier: [rim highlight, rim shadow, face]
const METAL = [
  ["#F3C08A", "#8A4B1F", "#B8733D"], // bronze
  ["#FFFFFF", "#7C8594", "#C9D0DA"], // silver
  ["#FFF1A8", "#A87400", "#F5C000"], // gold
  ["#E8FDFF", "#3E8FB0", "#9FE8FF"], // platinum
];
const LOCKED = ["#6E6892", "#2D2758", "#4A4378"];
const ICONS = { calendar: CalendarCheck, flame: Fire, target: Target, star: Star, stadium: Volleyball, net: Target, swords: Sword, trophy: Trophy, medal: MedalIcon, crown: Crown, rocket: Rocket };

/** Tiered medal: ribbon, metal rim by tier, track icon, tier pips. tier -1 = locked. */
export function Medal({ icon, tier, size = 96 }: { icon: keyof typeof ICONS; tier: number; size?: number }) {
  const id = useId().replace(/[^a-z0-9]/gi, "");
  const [hi, lo, face] = tier >= 0 ? METAL[tier] : LOCKED;
  const Icon = ICONS[icon] ?? Star;
  return (
    <span className={`relative inline-grid place-items-center ${tier >= 3 ? "medal-shine" : ""}`} style={{ width: size, height: size * 1.18 }}>
      <svg viewBox="0 0 100 118" width={size} height={size * 1.18} className="absolute inset-0 overflow-visible">
        <defs>
          <linearGradient id={`rim${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={hi} /><stop offset="1" stopColor={lo} /></linearGradient>
          <radialGradient id={`face${id}`} cx=".35" cy=".3" r=".8"><stop offset="0" stopColor={hi} stopOpacity=".9" /><stop offset=".45" stopColor={face} /><stop offset="1" stopColor={lo} /></radialGradient>
        </defs>
        {/* ribbon */}
        <path d="M30 0 H46 L54 34 H38 Z" fill={tier >= 0 ? "#5B47C9" : "#3A3466"} />
        <path d="M70 0 H54 L46 34 H62 Z" fill={tier >= 0 ? "#FF5A6E" : "#3A3466"} />
        {/* medal: scalloped rim + face */}
        <g transform="translate(50 72)">
          {Array.from({ length: 16 }, (_, i) => <circle key={i} r="6" cx={Math.cos((i / 16) * Math.PI * 2) * 38} cy={Math.sin((i / 16) * Math.PI * 2) * 38} fill={`url(#rim${id})`} />)}
          <circle r="40" fill={`url(#rim${id})`} />
          <circle r="31" fill={`url(#face${id})`} stroke={lo} strokeWidth="1.5" />
          <circle r="31" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1" strokeDasharray="2 3" />
        </g>
        {/* tier pips */}
        {tier >= 0 && Array.from({ length: tier + 1 }, (_, i) => <circle key={i} cx={50 + (i - tier / 2) * 9} cy="112" r="3" fill={hi} stroke={lo} strokeWidth="1" />)}
      </svg>
      <span className="relative mt-[26%] grid place-items-center">
        {tier >= 0 ? <Icon weight="fill" size={size * 0.34} color={lo} className="drop-shadow-[0_1px_0_rgba(255,255,255,.5)]" />
          : <Lock weight="fill" size={size * 0.28} color="#9A93C4" />}
      </span>
    </span>
  );
}
