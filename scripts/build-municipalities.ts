/**
 * Build src/data/municipalities.json: every Japanese city, ward, town and village with an
 * English name derived from its official kana reading (not from the kanji, which our
 * catalog romanizer sometimes misreads: 久留米 → "Kuru Yone").
 *
 * Source: code4fukui/localgovjp (CC0), compiled from GSI and J-LIS municipality data.
 *   npm run data:municipalities                  # downloads the CSV
 *   npm run data:municipalities -- --csv file    # or reads a local copy
 */
import { readFileSync, writeFileSync } from "node:fs";
import { placeName } from "./lib/kana.ts";
import { parseArgs } from "./lib/util.ts";

const SOURCE = "https://raw.githubusercontent.com/code4fukui/localgovjp/master/localgovjp-utf8.csv";
const OUT = new URL("../src/data/municipalities.json", import.meta.url);

/**
 * Official English names that a syllable-by-syllable reading gets wrong, mostly where two
 * vowels meet across a word boundary and must not merge (勝浦 is katsu + ura, not "Katsura").
 * Checked by hand for every municipality that has a catalog shop.
 */
const OVERRIDES: Record<string, string> = {
  南アルプス市: "Minami-Alps",
  山陽小野田市: "Sanyo-Onoda",
  周防大島町: "Suo-Oshima",
  豊後大野市: "Bungo-Ono",
  広尾町: "Hiroo",
  勝浦市: "Katsuura",
  勝浦町: "Katsuura",
  那智勝浦町: "Nachikatsuura",
  松浦市: "Matsuura",
  琴浦町: "Kotoura",
  瀬戸内市: "Setouchi",
  山ノ内町: "Yamanouchi",
  輪之内町: "Wanouchi",
  西之表市: "Nishinoomote",
  箕面市: "Minoh",
  豊岡市: "Toyooka",
  曽於市: "Soo",
};

export type MunicipalityKind = "city" | "ward" | "special-ward" | "town" | "village";
/** [code, prefecture code, Japanese name, English name, kind, lat, lng, parent city code] */
export type MunicipalityRow = [string, number, string, string, MunicipalityKind, number, number, string?];

const SUFFIX: Record<string, readonly string[]> = { 市: ["し"], 区: ["く"], 町: ["ちょう", "まち"], 村: ["そん", "むら"] };

/** Drop the 市/区/町/村 reading from the end of the kana: くるめし → くるめ. */
export function stem(name: string, kana: string): string {
  const suffix = SUFFIX[name.at(-1)!];
  const match = suffix?.find(s => kana.endsWith(s) && kana.length > s.length);
  if (!match) throw new Error(`Can't find the ${name.at(-1)} reading in ${name} (${kana})`);
  return kana.slice(0, -match.length);
}

export function parseLocalGov(csv: string): MunicipalityRow[] {
  const lines = csv.replace(/^﻿/, "").trim().split(/\r?\n/);
  const header = lines.shift()!.split(",");
  const col = (name: string) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`localgovjp CSV has no ${name} column`);
    return index;
  };
  const [pid, city, kana, lat, lng, lgcode] = ["pid", "city", "citykana", "lat", "lng", "lgcode"].map(col) as number[];
  const rows: MunicipalityRow[] = [];
  const cityCodes = new Map<string, string>();
  for (const line of lines) {
    // No field before lgcode contains a comma; the catchphrase after the URL can.
    const cells = line.split(",");
    const code = cells[lgcode!]!.slice(0, 5);
    const prefecture = Number(cells[pid!]);
    const names = cells[city!]!.split(" ");
    const readings = cells[kana!]!.split(" ");
    if (names.length !== readings.length) throw new Error(`Name and reading don't line up: ${line}`);
    const ja = names.join("");
    const english = (name: string, reading: string) => OVERRIDES[name] ?? placeName(stem(name, reading));
    const kind: MunicipalityKind = names.length === 2 ? "ward"
      : ja.endsWith("区") ? "special-ward" : ja.endsWith("市") ? "city" : ja.endsWith("町") ? "town" : "village";
    const parent = names.length === 2 ? cityCodes.get(`${prefecture}|${names[0]}`) : undefined;
    if (names.length === 2 && !parent) throw new Error(`Ward before its city: ${line}`);
    if (kind === "city") cityCodes.set(`${prefecture}|${ja}`, code);
    const position = [Number(cells[lat!]), Number(cells[lng!])].map(n => Math.round(n * 1e5) / 1e5) as [number, number];
    rows.push([code, prefecture, ja, english(names.at(-1)!, readings.at(-1)!), kind, ...position, ...(parent ? [parent] : [])] as MunicipalityRow);
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const csv = typeof args.csv === "string" ? readFileSync(args.csv, "utf8") : await (await fetch(SOURCE)).text();
  const rows = parseLocalGov(csv);
  writeFileSync(OUT, `[\n${rows.map(row => JSON.stringify(row)).join(",\n")}\n]\n`);
  console.log(`Wrote ${rows.length} municipalities to src/data/municipalities.json`);
}
