// Cricsheet's event.stage, e.g. "Final", "Semi Final", "Quarter Final" → the words used in a question; null if not a knockout.
export const stageName = (stage) => { const s = String(stage ?? "").trim().toLowerCase(); return /^(semi|quarter)?[ -]?final$/.test(s) ? s.replace(/ /g, "-") : null; };
