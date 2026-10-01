// Legend avatars: animated 2D caricatures of famous cricketers (used with the players' permission).
// Each is drawn by <Toon> from its traits until it has generated art (scripts/legend-art.ts → public/legends/<id>/<mood>.webp, then art: true).
// Unlock: reach `level`, or buy it (every legend is the same price, PRICE below), whichever comes first. Worn as avatar code "legend:<id>".

import WITH_ART from "../content/legend-art.json";
import WITH_FULL from "../content/legend-full.json";

export type Hair = "short" | "curly" | "long" | "ponytail" | "bun" | "spiky" | "undercut" | "balding" | "wavy" | "buzz";
export type Facial = "none" | "stubble" | "beard" | "moustache" | "goatee";
export type Headwear = "none" | "patka" | "cap" | "headband" | "sunhat";
export type Kit = { shirt: string; trim: string };

export type Legend = {
  id: string; name: string; country: string; role: string; number: number; signature: string;
  skin: string; hair: Hair; hairColor: string; facial: Facial; headwear: Headwear; headwearColor?: string; glasses?: boolean;
  kit: Kit; level: number; art?: boolean; full?: boolean;
};

const KITS = {
  IN: { shirt: "#1C5FD4", trim: "#FF8A1F" }, AU: { shirt: "#F5C000", trim: "#0F6B3A" }, WI: { shirt: "#7B1E3A", trim: "#F5C000" },
  PK: { shirt: "#01723A", trim: "#FFFFFF" }, ZA: { shirt: "#0F8A4F", trim: "#F5C000" }, LK: { shirt: "#1C3F94", trim: "#F5C000" },
  GB: { shirt: "#1A2B5F", trim: "#D2283C" },
} satisfies Record<string, Kit>;

const BLACK = "#1B1411", BROWN = "#4A2F22", BLONDE = "#E3C06A", GINGER = "#B8502A";
const TAN = "#C98B5E", DEEP = "#8A5634", DARK = "#5E3A26", FAIR = "#F2C7A0", LIGHT = "#E6B089";

const L = (id: string, name: string, country: keyof typeof KITS, role: string, number: number, signature: string,
  look: Pick<Legend, "skin" | "hair" | "hairColor" | "facial" | "headwear"> & Partial<Legend>, level: number): Legend =>
  ({ id, name, country, role, number, signature, kit: KITS[country], level, ...look });

export const LEGENDS: Legend[] = [
  L("sachin", "Sachin Tendulkar", "IN", "Batter", 10, "Straight drive", { skin: TAN, hair: "curly", hairColor: BLACK, facial: "none", headwear: "none" }, 40),
  L("dhoni", "MS Dhoni", "IN", "Wicketkeeper", 7, "Helicopter shot", { skin: TAN, hair: "long", hairColor: BROWN, facial: "stubble", headwear: "none" }, 38),
  L("kohli", "Virat Kohli", "IN", "Batter", 18, "Cover drive, then the roar", { skin: LIGHT, hair: "undercut", hairColor: BLACK, facial: "beard", headwear: "none" }, 36),
  L("rohit", "Rohit Sharma", "IN", "Batter", 45, "Lazy pull for six", { skin: LIGHT, hair: "short", hairColor: BLACK, facial: "beard", headwear: "none" }, 32),
  L("kapil", "Kapil Dev", "IN", "All-rounder", 0, "Natraj shot", { skin: DEEP, hair: "curly", hairColor: BLACK, facial: "moustache", headwear: "none" }, 30),
  L("gavaskar", "Sunil Gavaskar", "IN", "Batter", 0, "Forward defence", { skin: TAN, hair: "short", hairColor: BLACK, facial: "moustache", headwear: "cap", headwearColor: "#E8E2D0" }, 28),
  L("dravid", "Rahul Dravid", "IN", "Batter", 19, "The Wall", { skin: TAN, hair: "short", hairColor: BLACK, facial: "none", headwear: "none" }, 26),
  L("ganguly", "Sourav Ganguly", "IN", "Batter", 99, "Down the track, over long-on", { skin: LIGHT, hair: "short", hairColor: BLACK, facial: "stubble", headwear: "none" }, 24),
  L("kumble", "Anil Kumble", "IN", "Leg-spinner", 37, "Jumbo appeal", { skin: DEEP, hair: "short", hairColor: BLACK, facial: "none", headwear: "none", glasses: true }, 22),
  L("sehwag", "Virender Sehwag", "IN", "Batter", 44, "Upper cut over third man", { skin: LIGHT, hair: "balding", hairColor: BLACK, facial: "stubble", headwear: "none" }, 20),
  L("yuvraj", "Yuvraj Singh", "IN", "All-rounder", 12, "Six sixes", { skin: LIGHT, hair: "short", hairColor: BLACK, facial: "beard", headwear: "none" }, 18),
  L("bumrah", "Jasprit Bumrah", "IN", "Fast bowler", 93, "Toe-crushing yorker", { skin: TAN, hair: "buzz", hairColor: BLACK, facial: "goatee", headwear: "none" }, 16),
  L("harbhajan", "Harbhajan Singh", "IN", "Off-spinner", 3, "The doosra", { skin: LIGHT, hair: "buzz", hairColor: BLACK, facial: "beard", headwear: "patka", headwearColor: "#1C3F94" }, 14),
  L("mithali", "Mithali Raj", "IN", "Batter", 3, "Elegant cover drive", { skin: TAN, hair: "bun", hairColor: BLACK, facial: "none", headwear: "none" }, 12),
  L("smriti", "Smriti Mandhana", "IN", "Batter", 18, "Silky pull shot", { skin: LIGHT, hair: "ponytail", hairColor: BLACK, facial: "none", headwear: "none" }, 10),
  L("warne", "Shane Warne", "AU", "Leg-spinner", 23, "Ball of the Century", { skin: FAIR, hair: "spiky", hairColor: BLONDE, facial: "none", headwear: "none" }, 34),
  L("ponting", "Ricky Ponting", "AU", "Batter", 14, "Front-foot pull", { skin: FAIR, hair: "short", hairColor: BROWN, facial: "none", headwear: "none" }, 25),
  L("gilchrist", "Adam Gilchrist", "AU", "Wicketkeeper", 18, "Walk-off and glove punch", { skin: FAIR, hair: "short", hairColor: BROWN, facial: "none", headwear: "none" }, 19),
  L("mcgrath", "Glenn McGrath", "AU", "Fast bowler", 11, "Off-stump, every ball", { skin: FAIR, hair: "short", hairColor: BROWN, facial: "none", headwear: "none" }, 15),
  L("perry", "Ellyse Perry", "AU", "All-rounder", 8, "Match-winning all-rounder", { skin: FAIR, hair: "ponytail", hairColor: BLONDE, facial: "none", headwear: "none" }, 11),
  L("lara", "Brian Lara", "WI", "Batter", 9, "High backlift", { skin: DARK, hair: "buzz", hairColor: BLACK, facial: "none", headwear: "none" }, 35),
  L("richards", "Viv Richards", "WI", "Batter", 0, "The swagger", { skin: DARK, hair: "short", hairColor: BLACK, facial: "moustache", headwear: "cap", headwearColor: "#7B1E3A" }, 33),
  L("gayle", "Chris Gayle", "WI", "Batter", 45, "The Gangnam celebration", { skin: DARK, hair: "buzz", hairColor: BLACK, facial: "beard", headwear: "none", glasses: true }, 21),
  L("wasim", "Wasim Akram", "PK", "Fast bowler", 3, "Late reverse swing", { skin: LIGHT, hair: "curly", hairColor: BLACK, facial: "none", headwear: "none" }, 31),
  L("imran", "Imran Khan", "PK", "All-rounder", 0, "Captain's leap", { skin: LIGHT, hair: "wavy", hairColor: BLACK, facial: "none", headwear: "none" }, 29),
  L("shoaib", "Shoaib Akhtar", "PK", "Fast bowler", 14, "Arms-out airplane", { skin: LIGHT, hair: "long", hairColor: BLACK, facial: "stubble", headwear: "none" }, 17),
  L("abd", "AB de Villiers", "ZA", "Batter", 17, "The 360° scoop", { skin: FAIR, hair: "short", hairColor: BROWN, facial: "stubble", headwear: "none" }, 27),
  L("kallis", "Jacques Kallis", "ZA", "All-rounder", 3, "Textbook cover drive", { skin: FAIR, hair: "short", hairColor: BROWN, facial: "stubble", headwear: "none" }, 23),
  L("murali", "Muttiah Muralitharan", "LK", "Off-spinner", 8, "Wide-eyed doosra", { skin: DEEP, hair: "short", hairColor: BLACK, facial: "none", headwear: "none" }, 37),
  L("stokes", "Ben Stokes", "GB", "All-rounder", 55, "The Headingley roar", { skin: FAIR, hair: "short", hairColor: GINGER, facial: "beard", headwear: "none" }, 13),
];

// Legends with generated art in public/legends/<id>/ (written by scripts/legend-art.mts).
const arted = new Set<string>(WITH_ART);
const fulls = new Set<string>(WITH_FULL);
for (const l of LEGENDS) { if (arted.has(l.id)) l.art = true; if (fulls.has(l.id)) l.full = true; }

/** One price for every legend: set as localized pricing on the Dodo product. */
export const PRICE = { IN: "₹49", other: "$0.99" };
export const priceFor = (country: string | null | undefined) => (country === "IN" ? PRICE.IN : PRICE.other);

export const LEGEND_BY_ID = new Map(LEGENDS.map((l) => [l.id, l]));
export const legendOf = (code: string | null | undefined) =>
  code?.startsWith("legend:") ? LEGEND_BY_ID.get(code.slice(7)) ?? null : null;
