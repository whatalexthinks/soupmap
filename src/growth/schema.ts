import type { Shop } from '../data/schema.ts';
import { isIndexableShop } from '../data/indexation.ts';
import { displayName } from '../names.ts';
import { cuisineOf } from '../cuisines.ts';
import { commerceFor, canonicalProfile } from './config.ts';

/** Never derive stars from Google UI, menu data from a broad category, or an award from payment. */
export function restaurantSchema(shop: Shop): Record<string, unknown> {
  const curated = isIndexableShop(shop);
  const commerce = commerceFor(shop.slug);
  const rating = commerce?.rating;
  return {
    '@type': 'Restaurant', '@id': curated ? `${canonicalProfile(shop)}#restaurant` : `/catalog/?place=${shop.slug}#restaurant`,
    name: displayName(shop, 'en'), alternateName: shop.nameJa,
    ...(curated ? { url: canonicalProfile(shop), description: shop.blurb,
      hasMenu: { '@type': 'Menu', name: 'Soupmap guide to the menu', hasMenuItem: {
        '@type': 'MenuItem', name: shop.signatureBowl,
        description: 'Editorial menu note; confirm availability and price with the restaurant.',
      } } } : {}),
    geo: { '@type': 'GeoCoordinates', latitude: shop.lat, longitude: shop.lng },
    address: { '@type': 'PostalAddress', addressLocality: shop.city, addressCountry: 'JP',
      ...(shop.address ? { streetAddress: shop.address } : {}), ...(shop.postcode ? { postalCode: shop.postcode } : {}) },
    servesCuisine: cuisineOf(shop),
    ...(shop.phone ? { telephone: shop.phone } : {}),
    ...(rating && Number.isFinite(rating.value) && rating.value >= 1 && rating.value <= 5 && Number.isInteger(rating.count) && rating.count > 0
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rating.value, ratingCount: rating.count, bestRating: 5, worstRating: 1, url: rating.source } } : {}),
  };
}
export function absoluteSchema(value: unknown, origin: string): unknown {
  if (Array.isArray(value)) return value.map(item => absoluteSchema(item, origin));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    ['url', '@id'].includes(key) && typeof item === 'string' && item.startsWith('/')
      ? new URL(item, origin).href : absoluteSchema(item, origin)]));
}
