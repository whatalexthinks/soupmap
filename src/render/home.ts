import { profileUrl } from "./directory.ts";
/** Small, curated homepage index. Never loads the nationwide catalog or map engine. */
import { CITIES } from '../data/cities.ts';
import raw from '../data/shops.json' with { type: 'json' };
import type { Shop } from '../data/schema.ts';
import { esc } from '../ui/dom.ts';

const shops = raw as unknown as readonly Shop[];
export const HOME_CITIES = CITIES.filter(city => shops.some(shop => shop.city === city.name));
const notes: Record<string, string> = {
  tokyo: 'A different bowl around every corner.',
  sapporo: 'Start in the north. Bring an appetite.',
  kitakata: 'A small city with plenty to slurp.',
  kyoto: 'Take your time. Follow the side streets.',
  osaka: 'Make a little room for one more stop.',
  wakayama: 'A quieter detour, a bowl worth finding.',
  fukuoka: 'Head south. See where the evening takes you.',
};

export function homeCitiesHtml(selected = 'tokyo'): string {
  // Real directory links remain useful without JavaScript.
  return [...HOME_CITIES].sort((a,b) => Number(b.slug === 'tokyo') - Number(a.slug === 'tokyo'))
    .map(city => `<a href="/city/${city.slug}/" data-home-city="${city.slug}"${city.slug === selected ? ' aria-current="true"' : ''}>${esc(city.name)}<span lang="ja">${esc(city.nameJa)}</span></a>`).join('');
}

export function homeCityHtml(slug = 'tokyo'): string {
  const city = HOME_CITIES.find(item => item.slug === slug) ?? HOME_CITIES.find(item => item.slug === 'tokyo')!;
  const places = shops.filter(shop => shop.city === city.name).slice(0, 3);
  return `<div class="city-summary">
    <div><p class="home-label">JAPAN / ${city.lat.toFixed(2)}° N, ${city.lng.toFixed(2)}° E</p>
    <h3 id="city-name">${esc(city.name)}<span lang="ja">${esc(city.nameJa)}</span></h3>
    <p class="city-summary__note">${esc(notes[city.slug] ?? 'Find your own way in.')}</p></div>
    <a class="home-text-link" href="/city/${city.slug}/">View city directory <span aria-hidden="true">↗</span></a>
    <a class="home-text-link" href="${city.slug === 'tokyo' ? '/guides/' : `/guides/city/${city.slug}/`}">${city.slug === 'tokyo' ? 'City guides, ward by ward' : `${esc(city.name)} by style`} <span aria-hidden="true">↗</span></a>
  </div>
  <div class="city-places"><div class="city-places__heading"><span>PLACES TO START</span><span>${String(places.length).padStart(2,'0')}</span></div>
    <ol>${places.map((shop, i) => `<li><a href="${esc(profileUrl(shop))}">
      <span class="city-place__number" aria-hidden="true">${String(i+1).padStart(2,'0')}</span>
      <span class="city-place__copy"><strong>${esc(shop.name)}</strong><span>${esc(shop.neighborhood)} <i aria-hidden="true">/</i> ${esc(shop.signatureBowl)}</span></span>
      <span class="city-place__arrow" aria-hidden="true">↗</span></a></li>`).join('')}</ol>
    <p class="city-places__fine">From our Japan pilot. Menus and opening hours can change; check before you go.</p>
  </div>`;
}
