import { esc } from '../ui/dom.ts';
import type { Shop } from '../data/schema.ts';
import { isIndexableShop } from '../data/indexation.ts';
import { commerceFor } from './config.ts';
export function badgeDetails(shop: Shop, now=Date.now()) {
  const config=commerceFor(shop.slug);
  const award=config?.award;
  const earned=!!award&&Date.parse(award.expires)>now&&/^https:\/\//.test(award.evidenceUrl);
  const label=earned?award!.label:config?.verifiedOwner?'Verified restaurant on Soupmap':'Find us on Soupmap';
  const path=isIndexableShop(shop)?`/catalog/${shop.slug}/`:`/catalog/?place=${encodeURIComponent(shop.slug)}`;
  const url=`https://soupmap.com${path}`;
  const image=`https://soupmap.com/api/growth/badge/${shop.slug}.svg`;
  return {label,url,image,evidence:earned?award!.evidenceUrl:null,
    embed:`<a href="${esc(url)}"><img src="${image}" alt="${esc(label)}" width="320" height="104" loading="lazy"></a>`};
}
export function badgeSvg(shop:Shop):string {
  const {label}=badgeDetails(shop);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="104" viewBox="0 0 320 104" role="img" aria-label="${esc(label)}"><rect x="1" y="1" width="318" height="102" fill="#f4ecde" stroke="#9c4933" stroke-width="2"/><path d="M22 46h48c-2 19-11 28-24 28S24 65 22 46M34 25c-9 9 9 9 0 17M47 22c-9 9 9 9 0 17M60 25c-9 9 9 9 0 17" stroke="#9c4933" stroke-width="3" fill="none"/><text x="86" y="46" font-family="sans-serif" font-weight="700" font-size="26" fill="#302822">Soupmap</text><text x="86" y="70" font-family="sans-serif" font-size="11" fill="#6b5f54">${esc(label)}</text></svg>`;
}
