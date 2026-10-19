/**
 * Derive each record's prefecture from what the source actually provides: an explicit
 * region, a prefecture name inside the address, or the postcode's first three digits
 * (Japan Post assigns 3-digit prefixes by prefecture). Records with none of these take
 * the prefecture shared by their nearest labelled neighbours.
 */
import { PREFECTURES } from "../../src/data/prefectures.ts";

/** [first prefix, last prefix, prefecture code], from Japan Post's prefix allocation. */
const POSTCODE_RANGES: ReadonlyArray<readonly [number, number, number]> = [
  [1, 9, 1], [10, 19, 5], [20, 29, 3], [30, 39, 2], [40, 99, 1], [100, 209, 13], [210, 259, 14],
  [260, 299, 12], [300, 319, 8], [320, 329, 9], [330, 369, 11], [370, 379, 10], [380, 399, 20],
  [400, 409, 19], [410, 439, 22], [440, 499, 23], [500, 509, 21], [510, 519, 24], [520, 529, 25],
  [530, 599, 27], [600, 629, 26], [630, 639, 29], [640, 649, 30], [650, 679, 28], [680, 689, 31],
  [690, 699, 32], [700, 719, 33], [720, 739, 34], [740, 759, 35], [760, 769, 37], [770, 779, 36],
  [780, 789, 39], [790, 799, 38], [800, 839, 40], [840, 849, 41], [850, 859, 42], [860, 869, 43],
  [870, 879, 44], [880, 889, 45], [890, 899, 46], [900, 909, 47], [910, 919, 18], [920, 929, 17],
  [930, 939, 16], [940, 959, 15], [960, 979, 7], [980, 989, 4], [990, 999, 6],
];

export function prefectureFromPostcode(postcode: string | undefined): number | undefined {
  const match = postcode?.normalize("NFKC").match(/^(\d{3})-?\d{4}$/);
  if (!match) return undefined;
  const prefix = Number(match[1]);
  return POSTCODE_RANGES.find(([lo, hi]) => prefix >= lo && prefix <= hi)?.[2];
}

const ascii = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "東京都", "Tōkyō-to", "Saitama Prefecture" → code. */
export function prefectureFromText(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const value = text.normalize("NFKC");
  // Full names only: Osaka's 福島区 and Tokyo's 北区 must not read as prefectures.
  const ja = PREFECTURES.find(p => value.includes(p.nameJa));
  if (ja) return ja.code;
  const latin = ascii(value).replace(/[-\s]*(prefecture|ken|to|fu|do)$/, "").trim();
  return PREFECTURES.find(p => ascii(p.name) === latin || (p.code === 1 && latin === "hokkaido"))?.code;
}

export interface Locatable {
  lat: number;
  lng: number;
  prefecture?: number;
}

/** Fill unknown prefectures from the most common one among the 7 nearest labelled records. */
export function fillByNeighbours<T extends Locatable>(records: T[]): number {
  const cell = (v: number) => Math.floor(v / 0.1);
  const grid = new Map<string, T[]>();
  for (const r of records) {
    if (!r.prefecture) continue;
    const key = `${cell(r.lat)}:${cell(r.lng)}`;
    grid.set(key, [...(grid.get(key) ?? []), r]);
  }
  let filled = 0;
  for (const r of records) {
    if (r.prefecture) continue;
    const near: { d: number; p: number }[] = [];
    for (let ring = 0; ring <= 6 && near.length < 7; ring++) {
      for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        for (const n of grid.get(`${cell(r.lat) + dy}:${cell(r.lng) + dx}`) ?? []) {
          near.push({ d: (n.lat - r.lat) ** 2 + (n.lng - r.lng) ** 2, p: n.prefecture! });
        }
      }
    }
    const votes = new Map<number, number>();
    for (const { p } of near.sort((a, b) => a.d - b.d).slice(0, 7)) votes.set(p, (votes.get(p) ?? 0) + 1);
    const best = [...votes].sort((a, b) => b[1] - a[1])[0];
    if (best) { r.prefecture = best[0]; filled++; }
  }
  return filled;
}

/**
 * A record whose prefecture disagrees with all of its 6 nearest neighbours within ~3 km is
 * almost certainly mislabelled (a wrong postcode in the source); take the neighbours' value.
 */
export function correctOutliers<T extends Locatable>(records: T[]): number {
  const cell = (v: number) => Math.floor(v / 0.05);
  const grid = new Map<string, T[]>();
  for (const r of records) {
    const key = `${cell(r.lat)}:${cell(r.lng)}`;
    grid.set(key, [...(grid.get(key) ?? []), r]);
  }
  const fixes: [T, number][] = [];
  for (const r of records) {
    if (!r.prefecture) continue;
    const near: { d: number; p?: number }[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const n of grid.get(`${cell(r.lat) + dy}:${cell(r.lng) + dx}`) ?? []) {
        if (n !== r && n.prefecture) near.push({ d: (n.lat - r.lat) ** 2 + (n.lng - r.lng) ** 2, p: n.prefecture });
      }
    }
    const nearest = near.filter(n => n.d < 0.03 ** 2).sort((a, b) => a.d - b.d).slice(0, 6);
    const first = nearest[0]?.p;
    if (nearest.length === 6 && first && first !== r.prefecture && nearest.every(n => n.p === first)) fixes.push([r, first]);
  }
  for (const [r, p] of fixes) r.prefecture = p;
  return fixes.length;
}
