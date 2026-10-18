/**
 * Broth styles: labels, colors (muted food tones) and one-line descriptions.
 * Descriptions are our own paraphrase of general background (see sources.ts: wikipedia-ramen).
 */

export const BROTH_IDS = [
  "tonkotsu",
  "shoyu",
  "miso",
  "shio",
  "chicken-paitan",
  "tsukemen",
  "udon",
  "soba",
  "oden",
  "other",
] as const;

export type BrothId = (typeof BROTH_IDS)[number];

export interface Broth {
  id: BrothId;
  label: string;
  labelJa: string;
  /** Pin / chip fill. */
  color: string;
  /** Text color that stays legible on `color`. */
  ink: string;
  description: string;
}

export const BROTHS: Record<BrothId, Broth> = {
  tonkotsu: {
    id: "tonkotsu",
    label: "Tonkotsu",
    labelJa: "豚骨",
    color: "#efe3cc",
    ink: "#2a1d10",
    description: "Pork bones boiled hard until the broth turns milky. Fukuoka's signature.",
  },
  shoyu: {
    id: "shoyu",
    label: "Shoyu",
    labelJa: "醤油",
    color: "#8c4f2b",
    ink: "#fbf1e4",
    description: "Seasoned with soy sauce: the classic clear brown bowl.",
  },
  miso: {
    id: "miso",
    label: "Miso",
    labelJa: "味噌",
    color: "#c7862c",
    ink: "#241404",
    description: "Built on fermented soybean paste. Rich, and Sapporo's calling card.",
  },
  shio: {
    id: "shio",
    label: "Shio",
    labelJa: "塩",
    color: "#e3c766",
    ink: "#2b2306",
    description: "Seasoned with salt. Usually clear, light and delicate.",
  },
  "chicken-paitan": {
    id: "chicken-paitan",
    label: "Chicken paitan",
    labelJa: "鶏白湯",
    color: "#f0b27a",
    ink: "#2d1707",
    description: "Chicken simmered until the broth goes creamy and opaque.",
  },
  tsukemen: {
    id: "tsukemen",
    label: "Tsukemen",
    labelJa: "つけ麺",
    color: "#5e3a2e",
    ink: "#fbefe6",
    description: "Noodles served on the side, dipped into a concentrated broth.",
  },
  udon: {
    id: "udon",
    label: "Udon",
    labelJa: "うどん",
    color: "#c9b98f",
    ink: "#231d0c",
    description: "Thick, soft wheat noodles in dashi.",
  },
  soba: {
    id: "soba",
    label: "Soba",
    labelJa: "そば",
    color: "#7d7a55",
    ink: "#f7f5e8",
    description: "Buckwheat noodles, hot in broth or cold with a dipping sauce.",
  },
  oden: {
    id: "oden",
    label: "Oden",
    labelJa: "おでん",
    color: "#b5653f",
    ink: "#fff1e8",
    description: "Daikon, eggs, fish cakes and more, slow-simmered in dashi.",
  },
  other: {
    id: "other",
    label: "Unspecified style",
    labelJa: "その他",
    color: "#b1a18d",
    ink: "#302822",
    description: "Soup and noodle shops whose specific broth style has not been verified.",
  },
};
