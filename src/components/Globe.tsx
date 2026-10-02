"use client";

import { Map as MLMap, Marker, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import { distanceKm, greatCircle } from "@/lib/game";
import { sfx } from "@/lib/client";

export type LngLat = [number, number];
export type GlobeApi = {
  reset: () => Promise<void>;
  setPin: (p: LngLat | null) => void;
  /** The ball flies from the guess to the wicket; resolves when it lands, then the camera settles on the answer. */
  reveal: (pin: LngLat, answer: LngLat, opts: { points: number }) => Promise<void>;
  /** Time ran out with no ball placed: fly to the answer and show the stumps only. */
  showAnswer: (answer: LngLat) => Promise<void>;
  zoom: (delta: number) => void;
  /** Fit the globe between the question banner (top px) and the guess dock (bottom px) so nothing covers it. */
  inset: (top: number, bottom: number) => void;
  spin: (on: boolean, centred?: boolean) => void; // centred: dashboard globe in its own box, no landing offsets
  /** Place names are off by default (the landing globe stays clean and loads faster); games switch them on. */
  labels: (on: boolean) => void;
  /** End of game: every guess, answer and flight path at once, framed to fit. */
  summary: (pairs: { guess: LngLat; answer: LngLat }[], padding: { top: number; bottom: number; left: number; right: number }) => void;
  /** A career trail: numbered stumps at each ground, joined in order by flight paths, framed to fit. */
  trail: (points: LngLat[], padding: { top: number; bottom: number; left: number; right: number }) => void;
};

// MapLibre 6 runs tiles in a module worker; postinstall copies it (and its shared chunk) into public/.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const START: LngLat = [35, 18]; // every question starts from the same world view
// Our CDN-cached proxy of EOX Sentinel-2 (see app/tiles/s2); MapLibre needs an absolute URL.
const SATELLITE = process.env.NEXT_PUBLIC_SATELLITE_TILES ?? `${typeof window !== "undefined" ? window.location.origin : ""}/tiles/s2/{z}/{y}/{x}.jpg`;
const reduced = () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
// Slow graphics (common on Windows laptops, where WebGL often runs on integrated GPUs or software paths): measured from
// the browser's frame rate once, then camera moves get much shorter so a reveal never lags behind the game.
let slowGpu = false;
if (typeof window !== "undefined") {
  let frames = 0; const t0 = performance.now();
  const tick = () => { frames++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else slowGpu = frames < 40; };
  requestAnimationFrame(tick);
}
/** An animation's duration: none for reduced motion, short on slow graphics. */
const dur = (ms: number) => (reduced() ? 0 : slowGpu ? Math.min(ms, 250) : ms);

// [layer id, OpenMapTiles road classes, min zoom, base width, colour]
const ROADS: [string, string[], number, number, string][] = [
  ["road-major", ["motorway", "trunk", "primary"], 6, 1.2, "rgba(255,214,120,0.85)"],
  ["road-mid", ["secondary", "tertiary"], 9, 0.9, "rgba(255,255,255,0.7)"],
  ["road-minor", ["minor", "service", "street"], 12, 0.6, "rgba(255,255,255,0.5)"],
];

const style: StyleSpecification = {
  version: 8,
  projection: { type: "globe" },
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0] },
  sources: {
    satellite: {
      type: "raster", tiles: [SATELLITE], tileSize: 256, maxzoom: 14,
      attribution: '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)',
    },
    countries: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    // Neutral place names (every city, not just cricket ones) so the map never hints at answers, like GeoGuessr's guess map.
    labels: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
    arc: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "rgba(0,0,0,0)" } }, // transparent: the page draws the night sky behind the globe
    { id: "satellite", type: "raster", source: "satellite", paint: { "raster-saturation": -0.15, "raster-brightness-max": 0.9, "raster-fade-duration": 120 } },
    // Street detail fades in as you zoom into a city (roads + water names); no stadiums or grounds, so nothing gives answers away.
    ...ROADS.map(([id, classes, minzoom, width, color]) => ({
      id, type: "line" as const, source: "labels", "source-layer": "transportation", minzoom,
      filter: ["in", ["get", "class"], ["literal", classes]] as never,
      layout: { visibility: "none" as const, "line-cap": "round" as const, "line-join": "round" as const },
      paint: { "line-color": color, "line-opacity": ["interpolate", ["linear"], ["zoom"], minzoom, 0, minzoom + 1, 0.9] as never, "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], minzoom, width * 0.4, 16, width * 5] as never },
    })),
    { id: "borders", type: "line", source: "countries", paint: { "line-color": "rgba(244,240,225,0.55)", "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.5, 6, 1.4] } },
    {
      id: "country-label", type: "symbol", source: "labels", "source-layer": "place", minzoom: 1.6, maxzoom: 6,
      filter: ["==", ["get", "class"], "country"],
      layout: { visibility: "none", "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]], "text-font": ["Noto Sans Bold"], "text-size": ["interpolate", ["linear"], ["zoom"], 2, 10, 5, 14], "text-transform": "uppercase", "text-letter-spacing": 0.08, "text-max-width": 8 },
      paint: { "text-color": "rgba(255,255,255,0.85)", "text-halo-color": "rgba(18,14,58,0.85)", "text-halo-width": 1.2 },
    },
    {
      id: "local-label", type: "symbol", source: "labels", "source-layer": "place", minzoom: 9,
      filter: ["in", ["get", "class"], ["literal", ["village", "suburb", "quarter", "neighbourhood", "hamlet"]]],
      layout: { visibility: "none", "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]], "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10, 15, 13] },
      paint: { "text-color": "rgba(255,255,255,0.92)", "text-halo-color": "rgba(18,14,58,0.9)", "text-halo-width": 1.3 },
    },
    {
      id: "road-label", type: "symbol", source: "labels", "source-layer": "transportation_name", minzoom: 13,
      layout: { visibility: "none", "symbol-placement": "line", "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]], "text-font": ["Noto Sans Regular"], "text-size": 11 },
      paint: { "text-color": "#FFFFFF", "text-halo-color": "rgba(18,14,58,0.9)", "text-halo-width": 1.2 },
    },
    {
      id: "city-label", type: "symbol", source: "labels", "source-layer": "place", minzoom: 4,
      filter: ["in", ["get", "class"], ["literal", ["city", "town"]]],
      layout: { visibility: "none", "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]], "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 4, 11, 8, 14] },
      paint: { "text-color": "#FFFFFF", "text-halo-color": "rgba(18,14,58,0.9)", "text-halo-width": 1.4 },
    },
    { id: "arc-base", type: "line", source: "arc", layout: { "line-cap": "round" }, paint: { "line-color": "#D2283C", "line-width": 4 } },
    { id: "arc-seam", type: "line", source: "arc", paint: { "line-color": "#FFFFFF", "line-width": 1.2, "line-dasharray": [2, 2] } },
  ],
};

function startZoom(el: HTMLElement) {
  const d = Math.min(el.clientWidth, el.clientHeight * 0.75);
  return Math.max(0.2, Math.log2((0.9 * d * Math.PI) / 512));
}

// MapLibre positions a marker by setting `transform` on its element, so animations must run on an inner child.
function el(className: string, html = "") {
  const outer = document.createElement("div");
  const inner = document.createElement("div");
  inner.className = className;
  inner.innerHTML = html;
  outer.appendChild(inner);
  return outer;
}
const inner = (m: Marker) => m.getElement().firstElementChild as HTMLElement;

// Dev-only: /?poster=1 renders with a readable canvas so scripts/globe-poster can snapshot the landing globe.
const posterMode = () => process.env.NODE_ENV !== "production" && typeof location !== "undefined" && location.search.includes("poster=1");

export default function Globe({ onTap, onReady, onPainted }: { onTap: (p: LngLat) => void; onReady: (api: GlobeApi) => void; onPainted?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const tapRef = useRef(onTap);
  const onPaintedRef = useRef(onPainted);
  useEffect(() => { onPaintedRef.current = onPainted; }, [onPainted]);
  useEffect(() => { tapRef.current = onTap; }, [onTap]);

  useEffect(() => {
    const container = box.current!;
    const cleanup: (() => void)[] = [];
    const map = new MLMap({
      container, style, center: START, zoom: startZoom(container),
      attributionControl: false, // map credits live on /about and in the page footer, not as an ⓘ over the globe
      dragRotate: false, pitchWithRotate: false, touchPitch: false, keyboard: true,
      // Effectively no coasting after a drag (a flick never turns into a stray tap). linearity 0 makes MapLibre divide 0/0, so use tiny values.
      dragPan: { linearity: 0.02, deceleration: 20000, maxSpeed: 300 },
      clickTolerance: 6, maxZoom: 17, renderWorldCopies: false, fadeDuration: 150,
      canvasContextAttributes: posterMode() ? { preserveDrawingBuffer: true } : undefined,
    });
    map.touchZoomRotate.disableRotation();
    if (process.env.NODE_ENV !== "production") (window as unknown as { __pmMap: MLMap }).__pmMap = map;

    const ball = new Marker({ element: el("pm-ball pm-guess"), anchor: "bottom" });
    const stumps = new Marker({ element: el("pm-stumps", "<i></i><i></i><i></i><b></b><b></b>"), anchor: "bottom" });
    let spinning = false, raf = 0;
    let insets = { top: 120, bottom: 140 }; // screen space the game UI covers, set by inset()
    const fitZoom = () => Math.max(0.2, Math.log2((Math.min(container.clientWidth * 0.94, container.clientHeight - insets.top - insets.bottom) * Math.PI) / 512));

    fetch("/world.topo.json").then((r) => r.json()).then((topo: Topology) => {
      const geo = feature(topo, topo.objects.ind10m);
      const ready = () => (map.getSource("countries") as GeoJSONSource).setData(geo);
      if (map.isStyleLoaded()) ready(); else map.once("load", ready);
    });

    // A tap in the empty sky around the globe still unprojects to a point on its rim; only count taps that land on it
    // (the point projects back to where the finger was).
    if (process.env.NODE_ENV === "development") (window as unknown as { __pmMap?: unknown }).__pmMap = map; // reel recording: place pins by coordinates
    map.on("click", (e) => {
      const back = map.project(e.lngLat);
      if (Math.hypot(back.x - e.point.x, back.y - e.point.y) > 4) return;
      tapRef.current([e.lngLat.lng, e.lngLat.lat]);
    });

    const setArcs = (lines: LngLat[][]) =>
      (map.getSource("arc") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: lines.map((coordinates) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } })),
      });
    const setArc = (coords: LngLat[]) => setArcs(coords.length ? [coords] : []);
    let extra: Marker[] = []; // summary markers
    const clearExtra = () => { extra.forEach((m) => m.remove()); extra = []; };
    // Every reveal belongs to one question: reset() bumps the sequence so an unfinished animation can never land on
    // the next question. Camera waits always time out, because "moveend" doesn't fire when the camera barely moves.
    let seq = 0;
    const settle = (ms: number) => new Promise<void>((done) => {
      if (reduced()) return done();
      const t = setTimeout(done, ms);
      map.once("moveend", () => { clearTimeout(t); done(); });
    });

    const tick = () => {
      if (!spinning) return;
      const c = map.getCenter();
      map.jumpTo({ center: [c.lng + 0.08, c.lat] });
      raf = requestAnimationFrame(tick);
    };

    const api: GlobeApi = {
      async reset() {
        seq++;
        ball.remove(); stumps.remove(); setArc([]); clearExtra();
        inner(stumps).classList.remove("fly", "shake");
        map.easeTo({ center: START, zoom: fitZoom(), padding: { ...insets, left: 0, right: 0 }, duration: dur(700) });
        await new Promise((r) => setTimeout(r, dur(700) + 20));
      },
      labels(on) {
        for (const id of ["country-label", "city-label", "local-label", "road-label", ...ROADS.map((r) => r[0])]) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
      },
      setPin(p) {
        if (!p) { ball.remove(); return; }
        ball.setLngLat(p).addTo(map);
        // re-trigger the drop + ripple animation on every tap
        const e = inner(ball); e.classList.remove("drop"); void e.offsetWidth; e.classList.add("drop");
      },
      zoom(delta) { map.easeTo({ zoom: map.getZoom() + delta, duration: 250 }); },
      inset(top, bottom) {
        if (top === insets.top && bottom === insets.bottom) return;
        insets = { top, bottom };
        map.easeTo({ zoom: fitZoom(), padding: { ...insets, left: 0, right: 0 }, duration: dur(450) });
      },
      spin(on, centred) {
        if (on && centred) map.jumpTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, zoom: startZoom(container) });
        else if (on) { // Landing: push the globe up so it sits above the title and Play button.
          const wide = container.clientWidth >= 768; // desktop: title left, globe right; phone: globe above the title
          map.jumpTo({
            padding: wide ? { top: 0, bottom: 0, left: Math.round(container.clientWidth * 0.46), right: 0 } : { top: 0, bottom: Math.round(container.clientHeight * 0.42), left: 0, right: 0 },
            zoom: startZoom(container) - (wide ? 0.1 : 0.35),
          });
        }
        spinning = on && !reduced(); cancelAnimationFrame(raf); if (spinning) raf = requestAnimationFrame(tick);
      },
      async reveal(pin, answer, { points }) {
        const my = ++seq;
        stumps.remove(); inner(stumps).classList.remove("fly", "shake");
        const path = greatCircle(pin, answer), bottom = Math.round(container.clientHeight * 0.42);
        // 1. The globe turns to take in both the ball and the wicket.
        frame([pin, answer], { top: insets.top, bottom, left: 48, right: 48 }, 800, 7);
        await settle(dur(800) + 100);
        if (my !== seq) return;
        // 2. The ball flies along the arc with a whoosh, the seam trail growing behind it.
        sfx("whoosh");
        const flyer = new Marker({ element: el("pm-ball pm-flyer"), anchor: "bottom" }).setLngLat(pin).addTo(map);
        const t0 = performance.now(), flyMs = dur(Math.min(1100, 600 + distanceKm(pin, answer) / 12));
        await new Promise<void>((done) => {
          const step = (now: number) => {
            if (my !== seq) return done();
            const t = flyMs ? Math.min(1, (now - t0) / flyMs) : 1, e = t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2;
            const k = Math.round(e * (path.length - 1));
            setArc(path.slice(0, Math.max(2, k + 1))); flyer.setLngLat(path[k]);
            if (t < 1) requestAnimationFrame(step); else done();
          };
          requestAnimationFrame(step);
        });
        flyer.remove();
        if (my !== seq) return;
        // 3. It hits the wicket: bails fly on a perfect ball, a chime when close, a thud when wide.
        stumps.setLngLat(answer).addTo(map);
        sfx(points === 100 ? "hit" : points >= 60 ? "lock" : "thud");
        if (points === 100) requestAnimationFrame(() => inner(stumps).classList.add("fly", "shake"));
        // 4. The camera settles on the right spot (not awaited: the result shows as the ball lands).
        setTimeout(() => {
          if (my === seq) map.flyTo({ center: answer, zoom: Math.min(7, Math.max(map.getZoom(), 4.5)), padding: { top: insets.top, bottom, left: 0, right: 0 }, duration: dur(1200) });
        }, dur(300));
      },
      async showAnswer(answer) {
        ++seq;
        ball.remove(); setArc([]); clearExtra();
        stumps.setLngLat(answer).addTo(map);
        map.flyTo({ center: answer, zoom: 4, padding: { top: Math.max(170, insets.top), bottom: Math.round(container.clientHeight * 0.42), left: 0, right: 0 }, duration: dur(1100) });
        await settle(dur(1100) + 200);
      },
      summary(pairs, padding) {
        seq++;
        ball.remove(); stumps.remove(); clearExtra();
        const paths = pairs.map((p) => greatCircle(p.guess, p.answer));
        setArcs(paths);
        pairs.forEach((p, i) => {
          extra.push(new Marker({ element: el("pm-ball"), anchor: "bottom" }).setLngLat(p.guess).addTo(map));
          extra.push(new Marker({ element: el("pm-stumps pm-numbered", `<i></i><i></i><i></i><b></b><b></b><span>${i + 1}</span>`), anchor: "bottom" }).setLngLat(p.answer).addTo(map));
        });
        frame(pairs.flatMap((p) => [p.guess, p.answer]), padding);
      },
      trail(points, padding) {
        seq++;
        ball.remove(); stumps.remove(); clearExtra();
        setArcs(points.slice(1).map((p, i) => greatCircle(points[i], p)));
        points.forEach((p, i) => extra.push(new Marker({ element: el("pm-stumps pm-numbered", `<i></i><i></i><i></i><b></b><b></b><span>${i + 1}</span>`), anchor: "bottom" }).setLngLat(p).addTo(map)));
        frame(points, padding);
      },
    };
    function frame(pts: LngLat[], padding: { top: number; bottom: number; left: number; right: number }, ms = 1400, maxZoom = 5) {
        if (!pts.length) return;
        // fitBounds is Mercator-based and misframes a globe; centre on the spherical mean and zoom by spread instead.
        const r = Math.PI / 180;
        const v = pts.reduce((a, [lng, lat]) => [a[0] + Math.cos(lat * r) * Math.cos(lng * r), a[1] + Math.cos(lat * r) * Math.sin(lng * r), a[2] + Math.sin(lat * r)], [0, 0, 0]);
        const center: LngLat = [Math.atan2(v[1], v[0]) / r, Math.atan2(v[2], Math.hypot(v[0], v[1])) / r];
        const spreadDeg = Math.max(...pts.map((p) => distanceKm(center, p) / 111.2));
        const zoom = Math.min(maxZoom, startZoom(container) + Math.max(0, Math.log2(50 / Math.max(spreadDeg, 1))));
        map.easeTo({ center, zoom, padding, duration: dur(ms) });
    }
    map.once("load", () => {
      // Start the credit collapsed to its (i) button; it opens on tap (licence needs it available, not blocking the globe).
      container.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      onReady(api);
      // Tell the page once satellite imagery is actually on screen, so a poster image can fade out without a black flash.
      const t = setInterval(() => { if (map.isSourceLoaded("satellite")) { clearInterval(t); requestAnimationFrame(() => onPaintedRef.current?.()); } }, 100);
      cleanup.push(() => clearInterval(t));
    });
    return () => { cancelAnimationFrame(raf); cleanup.forEach((f) => f()); map.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // MapLibre's CSS forces position:relative on its container, so size a wrapper instead.
  return (
    <div className="absolute inset-0">
      <div ref={box} className="h-full w-full" aria-label="Globe. Drag to rotate, pinch or scroll to zoom, tap to place your guess." />
    </div>
  );
}
