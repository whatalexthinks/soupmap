/**
 * Shoppable specialty ingredients: the things a cook may not find at a corner shop.
 * Recipe pages show a "Buy" link beside them only when an affiliate programme is
 * configured (VITE_AMAZON_ASSOCIATES_TAG and/or VITE_INSTACART_LINK_TEMPLATE); with
 * neither set, recipes render exactly as before. Links are rel="sponsored nofollow"
 * and the ingredients section carries the disclosure the programmes require.
 */

export interface PantryItem {
  id: string;
  /** What to search the shop for. */
  query: string;
  match: RegExp;
  /** Fresh or chilled: better from a grocery delivery than a parcel. */
  fresh?: boolean;
}

export const PANTRY: readonly PantryItem[] = [
  { id: "kombu", query: "kombu dried kelp", match: /\bkombu\b/i },
  { id: "katsuobushi", query: "katsuobushi bonito flakes", match: /katsuobushi|bonito flakes/i },
  { id: "niboshi", query: "niboshi dried sardines", match: /niboshi/i },
  { id: "dashi-powder", query: "dashi powder", match: /instant dashi|dashi powder|dashi granules/i },
  { id: "miso", query: "miso paste", match: /\bmiso\b(?! ramen| soup)/i },
  { id: "mirin", query: "hon mirin", match: /\bmirin\b/i },
  { id: "dried-shiitake", query: "dried shiitake mushrooms", match: /dried shiitake/i },
  { id: "ramen-noodles", query: "fresh ramen noodles", match: /ramen noodles/i, fresh: true },
  { id: "udon", query: "frozen udon noodles", match: /\budon\b/i, fresh: true },
  { id: "soba", query: "soba noodles", match: /\bsoba\b/i },
  { id: "rice-noodles", query: "rice noodles banh pho", match: /rice (?:noodles|sticks)|bánh phở|rice vermicelli/i },
  { id: "menma", query: "menma bamboo shoots", match: /\bmenma\b/i },
  { id: "kamaboko", query: "kamaboko fish cake", match: /kamaboko|narutomaki|chikuwa|satsuma-age/i, fresh: true },
  { id: "konnyaku", query: "konnyaku", match: /konnyaku/i, fresh: true },
  { id: "aburaage", query: "aburaage fried tofu", match: /aburaage|abura-age|fried tofu pouch/i, fresh: true },
  { id: "mochi", query: "kirimochi rice cakes", match: /\bmochi\b|kirimochi/i },
  { id: "gochujang", query: "gochujang", match: /gochujang/i },
  { id: "gochugaru", query: "gochugaru", match: /gochugaru/i },
  { id: "doenjang", query: "doenjang", match: /doenjang/i },
  { id: "guk-ganjang", query: "guk-ganjang soup soy sauce", match: /guk-?ganjang|soup soy sauce/i },
  { id: "fish-sauce", query: "fish sauce", match: /fish sauce/i },
  { id: "tamarind", query: "tamarind", match: /tamarind/i },
  { id: "belacan", query: "belacan shrimp paste", match: /belacan|shrimp paste/i },
  { id: "makrut-lime", query: "makrut lime leaves", match: /makrut|kaffir/i, fresh: true },
  { id: "galangal", query: "galangal", match: /galangal/i, fresh: true },
  { id: "doubanjiang", query: "doubanjiang chilli bean paste", match: /doubanjiang|chilli bean paste|chili bean paste/i },
  { id: "tianmianjiang", query: "tianmianjiang sweet bean sauce", match: /tianmianjiang|sweet bean sauce/i },
  { id: "chinkiang", query: "chinkiang black vinegar", match: /chinkiang|black vinegar/i },
  { id: "sesame-paste", query: "chinese sesame paste", match: /sesame paste|neri goma|nerigoma/i },
  { id: "chilli-oil", query: "chilli crisp", match: /chilli crisp|chili crisp|chilli oil|chili oil|rayu/i },
  { id: "sichuan-pepper", query: "sichuan peppercorns", match: /sichuan pepper/i },
  { id: "pickled-mustard", query: "suan cai pickled mustard greens", match: /pickled mustard/i },
  { id: "hominy", query: "hominy pozole corn", match: /hominy|nixtamal/i },
  { id: "guajillo", query: "guajillo chiles", match: /guajillo/i },
  { id: "ancho", query: "ancho chiles", match: /\bancho\b/i },
  { id: "pul-biber", query: "pul biber aleppo pepper", match: /pul biber|aleppo pepper/i },
  { id: "ginseng", query: "samgyetang herb pack", match: /ginseng|samgyetang/i },
];

export interface AffiliateConfig {
  /** Amazon Associates tracking ID, e.g. "soupmap-20". */
  amazonTag?: string;
  amazonDomain?: string;
  /** A link with {query} where the URL-encoded search goes. */
  instacartTemplate?: string;
}

export function affiliateConfig(env: Record<string, string | undefined>): AffiliateConfig | undefined {
  const amazonTag = env.VITE_AMAZON_ASSOCIATES_TAG?.trim();
  const instacartTemplate = env.VITE_INSTACART_LINK_TEMPLATE?.trim();
  if (amazonTag && !/^[a-z0-9-]{3,40}$/i.test(amazonTag)) throw new Error("VITE_AMAZON_ASSOCIATES_TAG doesn't look like an Associates tracking ID");
  if (instacartTemplate && (!/^https:\/\//.test(instacartTemplate) || !instacartTemplate.includes("{query}"))) throw new Error("VITE_INSTACART_LINK_TEMPLATE must be an https URL containing {query}");
  if (!amazonTag && !instacartTemplate) return undefined;
  return { ...(amazonTag ? { amazonTag, amazonDomain: env.VITE_AMAZON_DOMAIN?.trim() || "www.amazon.com" } : {}), ...(instacartTemplate ? { instacartTemplate } : {}) };
}

export interface BuyLink { item: PantryItem; href: string; shop: "Amazon" | "Instacart" }

/** A buy link for an ingredient line, or undefined if it isn't a specialty item or nothing is configured. */
export function buyLink(text: string, config: AffiliateConfig | undefined): BuyLink | undefined {
  if (!config) return undefined;
  const item = PANTRY.find(p => p.match.test(text));
  if (!item) return undefined;
  const instacart = config.instacartTemplate && (item.fresh || !config.amazonTag);
  if (instacart) return { item, shop: "Instacart", href: config.instacartTemplate!.replaceAll("{query}", encodeURIComponent(item.query)) };
  const url = new URL(`https://${config.amazonDomain}/s`);
  url.searchParams.set("k", item.query);
  url.searchParams.set("tag", config.amazonTag!);
  return { item, shop: "Amazon", href: url.href };
}

export function disclosure(config: AffiliateConfig): string {
  const shops = [config.amazonTag ? "Amazon" : "", config.instacartTemplate ? "Instacart" : ""].filter(Boolean).join(" or ");
  return `“Buy” links go to ${shops}. ${config.amazonTag ? "As an Amazon Associate, Soupmap earns from qualifying purchases. " : ""}${config.instacartTemplate ? "Soupmap may earn a commission from Instacart orders. " : ""}It doesn't change what we recommend or the price you pay.`;
}
