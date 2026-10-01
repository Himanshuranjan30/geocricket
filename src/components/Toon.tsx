import type { Legend } from "@/lib/legends";

export type Mood = "idle" | "happy" | "celebrate" | "sad" | "shocked" | "nervous";

const INK = "#241512";
const SHADE = "rgba(60,20,10,.16)";

/**
 * A legend as an animated caricature (head and shoulders in their kit), drawn from traits in lib/legends.
 * `mood` swaps eyes, brows and mouth and runs a matching motion (CSS in globals: .toon-*). disc: round badge background.
 */
export function Toon({ legend: l, mood = "idle", size = 64, disc = true, className = "" }: { legend: Legend; mood?: Mood; size?: number; disc?: boolean; className?: string }) {
  if (l.art) {
    // eslint-disable-next-line @next/next/no-img-element -- generated art, one small webp per mood
    return <img src={`/legends/${l.id}/${mood}.webp`} alt="" width={size} height={size} className={`mood-wrap mood-${mood} shrink-0 ${disc ? "rounded-full" : ""} ${className}`} />;
  }
  const hair = l.hairColor;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={`toon toon-${mood} shrink-0 ${className}`} aria-hidden>
      {disc && <><circle cx="100" cy="100" r="100" fill={l.kit.shirt} /><circle cx="100" cy="100" r="100" fill="rgba(10,6,40,.45)" /></>}
      <g className="toon-body">
        {/* back hair */}
        {l.hair === "long" && l.headwear === "none" && <path d="M48 88 C42 128 50 158 64 168 L136 168 C150 158 158 128 152 88 Z" fill={hair} />}
        {l.hair === "ponytail" && <path d="M138 70 C170 78 172 132 150 156 C158 122 150 98 136 86 Z" fill={hair} />}
        {l.hair === "bun" && <circle cx="100" cy="30" r="17" fill={hair} />}

        {/* shoulders in kit */}
        <path d="M26 200 C30 160 60 144 100 144 C140 144 170 160 174 200 Z" fill={l.kit.shirt} />
        <path d="M26 200 C30 160 60 144 100 144 C140 144 170 160 174 200 Z" fill="none" stroke="rgba(0,0,0,.15)" strokeWidth="2" />
        <path d="M82 146 L100 170 L118 146" fill="none" stroke={l.kit.trim} strokeWidth="7" strokeLinejoin="round" />
        {l.number > 0 && <text x="140" y="188" textAnchor="middle" fontSize="20" fontWeight="800" fill={l.kit.trim} fontFamily="system-ui, sans-serif">{l.number}</text>}
        <rect x="86" y="118" width="28" height="34" rx="12" fill={l.skin} />
        <rect x="86" y="118" width="28" height="34" rx="12" fill={SHADE} />

        <g className="toon-head">
          <ellipse cx="53" cy="98" rx="9" ry="13" fill={l.skin} />
          <ellipse cx="147" cy="98" rx="9" ry="13" fill={l.skin} />
          <ellipse cx="100" cy="90" rx="46" ry="53" fill={l.skin} />

          <Facial l={l} />
          {(mood === "happy" || mood === "celebrate") && <><ellipse cx="72" cy="108" rx="9" ry="5" fill="#FF7A7A" opacity=".35" /><ellipse cx="128" cy="108" rx="9" ry="5" fill="#FF7A7A" opacity=".35" /></>}
          <path d="M100 94 C95 106 95 110 103 110" fill="none" stroke={SHADE} strokeWidth="4" strokeLinecap="round" />
          <Eyes mood={mood} />
          <Brows mood={mood} color={hair} />
          <Mouth mood={mood} />
          {l.glasses && (
            <g fill="rgba(255,255,255,.12)" stroke={INK} strokeWidth="3.5">
              <rect x="68" y="80" width="28" height="22" rx="9" /><rect x="104" y="80" width="28" height="22" rx="9" /><path d="M96 88 H104" />
            </g>
          )}
          <FrontHair l={l} />
          {mood === "nervous" && <path className="toon-sweat" d="M146 58 C152 68 154 74 148 78 C142 76 142 68 146 58 Z" fill="#8FD3FF" />}
        </g>
      </g>
    </svg>
  );
}

function Facial({ l }: { l: Legend }) {
  const c = l.hairColor;
  const beard = "M54 94 C56 138 78 150 100 150 C122 150 144 138 146 94 C140 118 126 130 100 130 C74 130 60 118 54 94 Z";
  switch (l.facial) {
    case "beard": return <><path d={beard} fill={c} /><path d="M84 116 C92 110 108 110 116 116 C108 116 92 116 84 116 Z" fill={c} stroke={c} strokeWidth="4" /></>;
    case "stubble": return <path d={beard} fill={c} opacity=".3" />;
    case "moustache": return <path d="M80 118 C88 108 112 108 120 118 C110 114 90 114 80 118 Z" fill={c} stroke={c} strokeWidth="5" strokeLinejoin="round" />;
    case "goatee": return <><path d="M88 128 C92 142 108 142 112 128 C106 132 94 132 88 128 Z" fill={c} /><path d="M86 116 C94 111 106 111 114 116" fill="none" stroke={c} strokeWidth="4" opacity=".7" /></>;
    default: return null;
  }
}

function Eyes({ mood }: { mood: Mood }) {
  const pair = (el: (x: number) => React.ReactNode) => <>{el(82)}{el(118)}</>;
  switch (mood) {
    case "happy":
    case "celebrate":
      return pair((x) => <path key={x} d={`M${x - 9} 93 Q${x} 81 ${x + 9} 93`} fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />);
    case "shocked":
      return pair((x) => <g key={x}><circle cx={x} cy="90" r="11" fill="#fff" /><circle cx={x} cy="90" r="4" fill={INK} /></g>);
    case "sad":
      return pair((x) => <g key={x}><ellipse cx={x} cy="93" rx="7" ry="6" fill="#fff" /><circle cx={x} cy="95" r="4" fill={INK} /><path d={`M${x - 4} 102 q2 6 0 9`} stroke="#8FD3FF" strokeWidth="3" fill="none" opacity={x === 118 ? 1 : 0} /></g>);
    case "nervous":
      return pair((x) => <g key={x}><ellipse cx={x} cy="90" rx="8" ry="9" fill="#fff" /><circle cx={x + 3} cy="91" r="4.5" fill={INK} /></g>);
    default:
      return <g className="toon-blink">{pair((x) => <g key={x}><ellipse cx={x} cy="90" rx="8" ry="9.5" fill="#fff" /><circle cx={x + 1} cy="91" r="5" fill={INK} /><circle cx={x + 3} cy="88" r="1.8" fill="#fff" /></g>)}</g>;
  }
}

function Brows({ mood, color }: { mood: Mood; color: string }) {
  const [l, r] = {
    idle: ["M71 76 Q82 71 93 75", "M107 75 Q118 71 129 76"],
    happy: ["M71 74 Q82 67 93 72", "M107 72 Q118 67 129 74"],
    celebrate: ["M70 70 Q82 62 93 68", "M107 68 Q118 62 130 70"],
    sad: ["M72 74 Q84 76 93 70", "M107 70 Q116 76 128 74"],
    shocked: ["M70 68 Q82 60 94 66", "M106 66 Q118 60 130 68"],
    nervous: ["M72 76 Q84 72 93 73", "M107 70 Q118 72 128 74"],
  }[mood];
  return <g fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"><path d={l} /><path d={r} /></g>;
}

function Mouth({ mood }: { mood: Mood }) {
  switch (mood) {
    case "happy": return <><path d="M84 114 Q100 132 116 114 Z" fill="#5A1A1A" /><path d="M88 115 H112 Q110 120 100 120 Q90 120 88 115 Z" fill="#fff" /></>;
    case "celebrate": return <><path d="M80 112 Q100 146 120 112 Z" fill="#5A1A1A" /><path d="M86 113 H114 Q112 119 100 119 Q88 119 86 113 Z" fill="#fff" /><ellipse cx="100" cy="132" rx="9" ry="5" fill="#E0556B" /></>;
    case "sad": return <path d="M86 124 Q100 112 114 124" fill="none" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />;
    case "shocked": return <ellipse cx="100" cy="121" rx="8" ry="10" fill="#5A1A1A" />;
    case "nervous": return <path d="M84 120 q4 -5 8 0 t8 0 t8 0 t8 0" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />;
    default: return <path d="M86 116 Q100 126 114 116" fill="none" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />;
  }
}

function FrontHair({ l }: { l: Legend }) {
  const c = l.hairColor;
  if (l.headwear === "patka") {
    return <><path d="M50 84 C48 44 74 26 100 26 C126 26 152 44 150 84 C138 70 120 64 100 64 C80 64 62 70 50 84 Z" fill={l.headwearColor} /><circle cx="100" cy="32" r="13" fill={l.headwearColor} /><circle cx="100" cy="32" r="13" fill="rgba(0,0,0,.2)" /></>;
  }
  if (l.headwear === "cap" || l.headwear === "sunhat") {
    const hc = l.headwearColor ?? "#E8E2D0";
    return <><path d="M52 80 C50 42 74 28 100 28 C126 28 150 42 148 80 C136 68 120 64 100 64 C80 64 64 68 52 80 Z" fill={hc} />
      <path d="M40 80 C70 70 130 70 160 80 C154 90 46 90 40 80 Z" fill={hc} /><path d="M40 80 C70 70 130 70 160 80 C154 90 46 90 40 80 Z" fill="rgba(0,0,0,.15)" /></>;
  }
  const top = "M54 86 C52 52 74 34 100 34 C126 34 148 52 146 86 C140 64 126 56 100 56 C78 56 62 64 54 86 Z";
  switch (l.hair) {
    case "curly": return <g fill={c}><path d={top} />{[[60, 64], [70, 48], [86, 38], [104, 36], [120, 42], [134, 54], [142, 70]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="13" />)}</g>;
    case "buzz": return <path d="M56 80 C56 50 76 38 100 38 C124 38 144 50 144 80 C136 64 122 58 100 58 C78 58 64 64 56 80 Z" fill={c} opacity=".92" />;
    case "undercut": return <g fill={c}><path d="M60 72 C56 38 82 24 106 26 C132 28 148 46 142 72 C130 56 116 50 100 52 C84 52 70 60 60 72 Z" /><path d="M54 90 C54 76 58 68 62 66 L62 90 Z" opacity=".5" /><path d="M146 90 C146 76 142 68 138 66 L138 90 Z" opacity=".5" /></g>;
    case "balding": return <g fill={c}><path d="M53 98 C51 80 56 70 64 66 L64 98 Z" /><path d="M147 98 C149 80 144 70 136 66 L136 98 Z" /></g>;
    case "spiky": return <path d="M54 82 L56 50 L68 58 L72 34 L86 48 L96 26 L106 46 L120 28 L124 50 L138 40 L138 60 L150 58 L146 82 C136 64 124 58 100 58 C76 58 64 64 54 82 Z" fill={c} />;
    case "wavy": case "long": return <path d="M52 92 C44 54 70 28 102 30 C136 32 156 58 148 94 C144 72 136 62 124 60 C112 68 96 58 84 64 C72 62 58 72 52 92 Z" fill={c} />;
    case "ponytail": case "bun": return <path d="M54 88 C52 52 74 34 100 34 C126 34 148 52 146 88 C140 64 124 52 100 54 C80 54 62 64 54 88 Z" fill={c} />;
    default: return <path d={top} fill={c} />;
  }
}
