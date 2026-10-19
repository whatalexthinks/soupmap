import type { Shop } from "./data/shops.ts";

export const CUISINES = [
  { id: "ramen", label: "Ramen" },
  { id: "udon", label: "Udon" },
  { id: "soba", label: "Soba" },
  { id: "oden", label: "Oden" },
  { id: "other", label: "Other / unknown" },
] as const;
export type CuisineId = typeof CUISINES[number]["id"];

export function inferCuisine(category: string, name: string, broth = "other"): CuisineId {
  const text = `${category} ${name}`.toLowerCase();
  if (broth === "udon" || /udon|うどん|饂飩/.test(text)) return "udon";
  if (broth === "oden" || /oden|おでん/.test(text)) return "oden";
  if (broth === "soba" || (/soba|蕎麦/.test(text) && !/中華そば|yakisoba/.test(text))) return "soba";
  if (broth !== "other" || /ramen|ラーメン|らーめん|拉麺|中華そば|つけ麺|担々麺|担担麺/.test(text)) return "ramen";
  return "other";
}
export function cuisineOf(shop: Shop): CuisineId {
  return shop.cuisine ?? inferCuisine("", `${shop.name} ${shop.nameJa}`, shop.broth);
}
