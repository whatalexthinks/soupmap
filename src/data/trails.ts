/**
 * Broth trails: guided camera tours through a list of shops.
 * Phase 1 ships the Tonkotsu Trail; more trails (e.g. a Sapporo Miso Trail) are just entries here.
 */
import type { BrothId } from "./broths.ts";

export interface Trail {
  slug: string;
  name: string;
  nameJa: string;
  /** The broth the trail celebrates; the map filters to it while touring. */
  broth: BrothId;
  /** Shop slugs in tour order. */
  stops: readonly string[];
  /** How long to linger at each stop, with its card open. */
  pauseMs: number;
}

export const TRAILS: readonly Trail[] = [
  {
    slug: "tonkotsu-trail",
    name: "Tonkotsu Trail",
    nameJa: "豚骨トレイル",
    broth: "tonkotsu",
    // Fukuoka, west to east: the fish-market original, Daimyo, then Nakasu by the river.
    stops: ["ganso-nagahamaya", "ippudo-daimyo", "ichiran-nakasu"],
    pauseMs: 4000,
  },
];
