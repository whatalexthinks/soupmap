import raw from '../data/commerce.json' with { type: 'json' };
import type { Shop } from '../data/schema.ts';

export interface CommerceListing {
  slug: string;
  verifiedOwner?: boolean;
  featuredUntil?: string;
  orderUrl?: string;
  reserveUrl?: string;
  rating?: { value: number; count: number; source: string; checkedAt: string };
  award?: { label: string; evidenceUrl: string; expires: string };
}
export interface Affiliate { title: string; description: string; url: string; cuisines: string[] }
export const COMMERCE = raw.listings as CommerceListing[];
export const AFFILIATES = raw.affiliates as Affiliate[];
export function commerceFor(slug: string): CommerceListing | undefined { return COMMERCE.find(item => item.slug === slug); }
export function isFeatured(slug: string, now = Date.now()): boolean {
  const item = commerceFor(slug);
  return item?.verifiedOwner === true && !!item.featuredUntil && Date.parse(item.featuredUntil) > now;
}
export function trackedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.searchParams.set('utm_source', 'soupmap.com');
    url.searchParams.set('utm_medium', 'referral');
    return url.href;
  } catch { return null; }
}
export const canonicalProfile = (shop: Pick<Shop, 'slug'>): string => `/catalog/${shop.slug}/`;
