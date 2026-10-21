/**
 * The ways to browse recipes. Ids are what content files use; labels are what readers see.
 * Order here is display order.
 */

export interface FacetValue { id: string; label: string; mark?: string; description?: string }
export interface Facet { id: FacetId; label: string; values: readonly FacetValue[] }
export type FacetId = "region" | "type" | "base" | "diet" | "difficulty" | "time" | "season";

export const REGIONS: readonly FacetValue[] = [
  { id: "japan", label: "Japan", mark: "日本", description: "Ramen, miso soup, udon, soba, oden and the quieter bowls of Japanese home cooking." },
  { id: "east-asia", label: "East Asia", mark: "東亜", description: "Wonton soup, hot and sour soup, Taiwanese beef noodles and Korean jjigae." },
  { id: "southeast-asia", label: "Southeast Asia", mark: "東南亜", description: "Phở, tom yum, tom kha, laksa and sinigang: herbs, sourness and heat." },
  { id: "south-asia", label: "South Asia", mark: "南亜", description: "Lentils, pepper and warm spice." },
  { id: "middle-east-africa", label: "Middle East & Africa", mark: "中東", description: "Harira, red lentil soup and West African groundnut soup." },
  { id: "europe", label: "Europe", mark: "欧州", description: "French onion, minestrone, borscht, gazpacho and the great peasant soups." },
  { id: "americas", label: "The Americas", mark: "米州", description: "Chicken noodle, pozole, gumbo, chowder and black bean soup." },
];

export const TYPES: readonly FacetValue[] = [
  { id: "noodle", label: "Noodle soups", mark: "麺" },
  { id: "clear", label: "Clear & light", mark: "澄" },
  { id: "hearty", label: "Hearty & chunky", mark: "具" },
  { id: "creamy", label: "Smooth & creamy", mark: "滑" },
  { id: "chilled", label: "Chilled", mark: "冷" },
  { id: "hot-pot", label: "Hot pots & stews", mark: "鍋" },
];

export const BASES: readonly FacetValue[] = [
  { id: "chicken", label: "Chicken" }, { id: "pork", label: "Pork" }, { id: "beef", label: "Beef" },
  { id: "lamb", label: "Lamb" }, { id: "seafood", label: "Fish & seafood" }, { id: "dashi", label: "Dashi" },
  { id: "vegetable", label: "Vegetables" }, { id: "legume", label: "Beans & lentils" },
];

export const DIETS: readonly FacetValue[] = [
  { id: "vegetarian", label: "Vegetarian" }, { id: "vegan", label: "Vegan" },
  { id: "gluten-free", label: "Gluten-free" }, { id: "dairy-free", label: "Dairy-free" },
];

export const DIFFICULTIES: readonly FacetValue[] = [
  { id: "easy", label: "Easy" }, { id: "medium", label: "Takes some care" }, { id: "project", label: "A project" },
];

/** Derived from total minutes, never written by hand. */
export const TIMES: readonly FacetValue[] = [
  { id: "quick", label: "30 minutes or less" }, { id: "weeknight", label: "Under an hour" },
  { id: "afternoon", label: "An afternoon" }, { id: "weekend", label: "Weekend project" },
];

export const SEASONS: readonly FacetValue[] = [
  { id: "spring", label: "Spring" }, { id: "summer", label: "Summer" }, { id: "autumn", label: "Autumn" }, { id: "winter", label: "Winter" },
];

export const FACETS: readonly Facet[] = [
  { id: "region", label: "Region", values: REGIONS },
  { id: "type", label: "Kind of soup", values: TYPES },
  { id: "base", label: "Built on", values: BASES },
  { id: "diet", label: "Diet", values: DIETS },
  { id: "time", label: "Time", values: TIMES },
  { id: "difficulty", label: "Effort", values: DIFFICULTIES },
  { id: "season", label: "Season", values: SEASONS },
];

export const facetById = new Map(FACETS.map(f => [f.id, f]));
export const facetLabel = (facet: FacetId, id: string) => facetById.get(facet)?.values.find(v => v.id === id)?.label ?? id;

export function timeBucket(totalMinutes: number): string {
  if (totalMinutes <= 30) return "quick";
  if (totalMinutes <= 60) return "weeknight";
  if (totalMinutes <= 240) return "afternoon";
  return "weekend";
}

/** Facets with their own crawlable pages: /recipes/<facet>/<value>/. */
export const PAGE_FACETS: readonly FacetId[] = ["region", "type", "diet", "time"];
