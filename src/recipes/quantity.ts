/**
 * Ingredient amounts: parse "1 1/2 tbsp", "2–3", "500 g"; scale them for a different number of
 * servings; show them in metric or US units. Pure functions, shared by the build and the page.
 */

export const UNITS = ["g", "kg", "ml", "l", "tsp", "tbsp", "cm"] as const;
export type Unit = typeof UNITS[number] | "";
export type System = "metric" | "us";

export interface Amount {
  min: number;
  /** Upper end of a range ("2–3"), when there is one. */
  max?: number;
  unit: Unit;
}

export interface IngredientLine {
  amount?: Amount;
  /** Everything after the amount and unit: "pork belly, in one piece". */
  text: string;
}

const VULGAR: Record<string, number> = { "½": 1 / 2, "¼": 1 / 4, "¾": 3 / 4, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 1 / 8 };
/** 1, 1.5, 1/2, 1 1/2, ½, 1½ */
const NUMBER = String.raw`(?:\d+(?:\.\d+)?(?:\s+\d+\/\d+|[½¼¾⅓⅔⅛])?|\d+\/\d+|[½¼¾⅓⅔⅛])`;
const AMOUNT = new RegExp(String.raw`^(${NUMBER})(?:\s*[–-]\s*(${NUMBER}))?(?:\s+(${UNITS.join("|")}))?(?=\s)\s+(.+)$`);

export function parseNumber(text: string): number {
  const value = text.trim();
  const mixed = value.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = value.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const vulgar = value.match(/^(\d*)([½¼¾⅓⅔⅛])$/);
  if (vulgar) return Number(vulgar[1] || 0) + VULGAR[vulgar[2]!]!;
  return Number(value);
}

/** "2–3 dried chillies" → {min:2,max:3,unit:""}; "Salt, to taste" → no amount. */
export function parseIngredient(line: string): IngredientLine {
  const match = line.trim().match(AMOUNT);
  if (!match) return { text: line.trim() };
  const min = parseNumber(match[1]!);
  const max = match[2] ? parseNumber(match[2]) : undefined;
  if (!Number.isFinite(min) || min <= 0 || (max !== undefined && !(max > min))) return { text: line.trim() };
  return { amount: { min, ...(max !== undefined ? { max } : {}), unit: (match[3] ?? "") as Unit }, text: match[4]!.trim() };
}

export function scaleAmount(amount: Amount, factor: number): Amount {
  return { ...amount, min: amount.min * factor, ...(amount.max !== undefined ? { max: amount.max * factor } : {}) };
}

const FRACTIONS: [number, string][] = [[0, ""], [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [1 / 2, "½"], [2 / 3, "⅔"], [3 / 4, "¾"], [1, ""]];

/** Kitchen-friendly: 1.5 → "1½", 0.33 → "⅓", 2.97 → "3". */
export function friendly(value: number): string {
  if (value >= 10) return String(Math.round(value));
  const whole = Math.floor(value);
  const rest = value - whole;
  let best = FRACTIONS[0]!;
  for (const f of FRACTIONS) if (Math.abs(f[0] - rest) < Math.abs(best[0] - rest)) best = f;
  const total = best[0] === 1 ? whole + 1 : whole;
  if (best[1] && total === 0) return best[1];
  if (!best[1] && total === 0) return "⅛"; // never show "0" for a real amount
  return `${total || ""}${best[1]}` || "0";
}

/** Things you count: whole ones from 3 up (5⅓ star anise is 5), halves from 1, fractions below. */
function count(value: number): string {
  if (value >= 3) return String(Math.round(value));
  if (value >= 1) return friendly(Math.round(value * 2) / 2);
  return friendly(value);
}

/** Weights and volumes round to what a scale or jug can show. */
function measure(value: number): string {
  if (value >= 1000) return String(Math.round(value / 10) * 10);
  if (value >= 100) return String(Math.round(value / 5) * 5);
  if (value >= 10) return String(Math.round(value));
  return String(Math.round(value * 10) / 10);
}

function decimal(value: number): string {
  return String(Math.round(value * 10) / 10);
}

interface Shown { min: string; max?: string; unit: string }

function showMetric(amount: Amount): Shown {
  let { min, max, unit } = amount;
  // Scaled results move between g and kg, ml and l, so they stay readable.
  if (unit === "g" && min >= 1000) { min /= 1000; max = max && max / 1000; unit = "kg"; }
  else if (unit === "kg" && min < 1) { min *= 1000; max = max && max * 1000; unit = "g"; }
  else if (unit === "ml" && min >= 1000) { min /= 1000; max = max && max / 1000; unit = "l"; }
  else if (unit === "l" && min < 1) { min *= 1000; max = max && max * 1000; unit = "ml"; }
  else if (unit === "tsp" && min >= 3 && !max) { min /= 3; unit = "tbsp"; }
  const format = unit === "g" || unit === "ml" ? measure : unit === "kg" || unit === "l" || unit === "cm" ? decimal : unit ? friendly : count;
  return { min: format(min), ...(max !== undefined ? { max: format(max) } : {}), unit };
}

function showUs(amount: Amount): Shown {
  const { min, max, unit } = amount;
  const both = (f: (n: number) => number, format: (n: number) => string, label: string): Shown =>
    ({ min: format(f(min)), ...(max !== undefined ? { max: format(f(max)) } : {}), unit: label });
  const grams = unit === "kg" ? 1000 : unit === "g" ? 1 : 0;
  if (grams) {
    const g = min * grams;
    if (g >= 454) return both(n => n * grams / 453.6, n => decimal(n), "lb");
    return both(n => n * grams / 28.35, n => n < 2 ? decimal(n) : friendly(Math.round(n * 2) / 2), "oz");
  }
  const millilitres = unit === "l" ? 1000 : unit === "ml" ? 1 : 0;
  if (millilitres) {
    const ml = min * millilitres;
    if (ml < 15) return both(n => n * millilitres / 4.93, friendly, "tsp");
    if (ml < 60) return both(n => n * millilitres / 14.79, friendly, "tbsp");
    if (ml >= 1900) return both(n => n * millilitres / 946.4, n => decimal(n), "qt");
    return both(n => n * millilitres / 236.6, n => friendly(Math.round(n * 4) / 4), ml <= 240 ? "cup" : "cups");
  }
  if (unit === "cm") return both(n => n / 2.54, n => friendly(Math.round(n * 2) / 2), "in");
  return showMetric(amount);
}

/** "1½ tbsp", "2–3", "1.2 kg", "3 cups". */
export function formatAmount(amount: Amount, system: System = "metric"): string {
  const shown = system === "us" ? showUs(amount) : showMetric(amount);
  const value = shown.max !== undefined && shown.max !== shown.min ? `${shown.min}–${shown.max}` : shown.min;
  return shown.unit ? `${value} ${shown.unit}` : value;
}

export interface Duration {
  /** Seconds for a timer: the low end of a range, so you check early. */
  seconds: number;
  /** The words as written: "10–12 minutes". */
  text: string;
  index: number;
}

const DURATION = new RegExp(String.raw`(${NUMBER})(?:\s*(?:–|-|to)\s*(${NUMBER}))?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b`, "g");

/** Times a cook might want to set a timer for. Ignores anything under 30 seconds. */
export function findDurations(text: string): Duration[] {
  const out: Duration[] = [];
  for (const match of text.matchAll(DURATION)) {
    const unit = match[3]!.toLowerCase();
    const scale = unit.startsWith("h") ? 3600 : unit.startsWith("m") ? 60 : 1;
    const seconds = Math.round(parseNumber(match[1]!) * scale);
    if (!Number.isFinite(seconds) || seconds < 30 || seconds > 24 * 3600) continue;
    out.push({ seconds, text: match[0], index: match.index! });
  }
  return out;
}

/** "1 hr 5 min", "45 min", "12 hr". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** ISO 8601 durations for schema.org (PT1H30M). */
export function isoDuration(minutes: number): string {
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  return `PT${h ? `${h}H` : ""}${m || !h ? `${m}M` : ""}`;
}
