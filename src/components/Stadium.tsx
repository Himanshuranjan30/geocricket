// Landing-screen scenery: floodlight towers, the glow they throw, and a crowded stand along the bottom.
// Pure SVG/CSS, no images, so it costs nothing to load.

export function Floodlights() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="floodlight-glow left-[-8%] top-[-18%]" />
      <div className="floodlight-glow right-[-8%] top-[-18%]" />
      {[{ left: "6%" }, { left: "24%" }, { right: "24%" }, { right: "6%" }].map((pos, i) => (
        <svg key={i} className="floodlight-tower" style={pos} width="46" height="120" viewBox="0 0 46 120">
          <rect x="21" y="30" width="4" height="90" fill="rgba(255,255,255,.14)" />
          <rect x="2" y="2" width="42" height="26" rx="4" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.25)" />
          {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => (
            <circle key={`${r}${c}`} cx={9 + c * 9.5} cy={8 + r * 7} r="2.6" fill="#FFF8D6" className="floodlight-bulb" />
          )))}
        </svg>
      ))}
    </div>
  );
}

const TOURNAMENTS = [
  { slug: "ipl", name: "IPL" }, { slug: "cricket-world-cup", name: "WORLD CUP" }, { slug: "t20-world-cup", name: "T20 WORLD CUP" },
  { slug: "ashes", name: "THE ASHES" }, { slug: "border-gavaskar", name: "BORDER-GAVASKAR" }, { slug: "wtc", name: "WTC FINAL" },
  { slug: "champions-trophy", name: "CHAMPIONS TROPHY" }, { slug: "big-bash", name: "BIG BASH" }, { slug: "the-hundred", name: "THE HUNDRED" },
  { slug: "sa20", name: "SA20" }, { slug: "cpl", name: "CPL" }, { slug: "womens-world-cup", name: "WOMEN'S WORLD CUP" },
];

export function Ticker({ logos }: { logos: Record<string, string> }) {
  const items = [...TOURNAMENTS, ...TOURNAMENTS];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden border-t border-white/10 bg-[#0B0828]/85 py-2">
      <div className="ticker display flex w-max items-center gap-8 whitespace-nowrap text-[11px] tracking-[.14em] text-muted">
        {items.map((t, i) =>
          logos[t.slug] ? (
            <span key={i} className="grid h-8 place-items-center rounded-lg bg-white px-2.5 shadow-sm" title={t.name}>
              {/* eslint-disable-next-line @next/next/no-img-element -- small static brand marks */}
              <img src={logos[t.slug]} alt="" className="h-6 w-auto max-w-[96px] object-contain" />
            </span>
          ) : <span key={i} className="flex items-center gap-1.5"><span className="pm-ball !m-0 !h-2.5 !w-2.5" />{t.name}</span>,
        )}
      </div>
    </div>
  );
}
