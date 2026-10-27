import type { Shop } from '../data/schema.ts';
import { CITIES } from '../data/cities.ts';
import { BROTHS } from '../data/broths.ts';
import { isEditorial, isIndexableShop } from '../data/indexation.ts';
import { CUISINES, cuisineOf } from '../cuisines.ts';
import { displayName } from '../names.ts';
import { getSource } from '../sources.ts';
import { esc } from '../ui/dom.ts';
import { contactHtml, stylesHtml } from '../ui/shop-details.ts';
import { recipeForShop } from '../recipes/catalog-links.ts';

/** "Make miso ramen at home": the recipe this shop's style points to. */
export function recipeCardHtml(shop: Shop): string {
  const match = recipeForShop(shop);
  if (!match) return '';
  return `<aside class="place-recipe" aria-label="Cook it at home"><span class="place-recipe__mark" lang="ja" aria-hidden="true">${esc(match.link.mark)}</span><div><span class="directory-kicker">Rather cook?</span><h2>${esc(match.heading)}</h2><p>${esc(match.link.title)}: our tested recipe, with a servings scaler, timers and gluten-free, plant-based and high-protein swaps.</p><a class="directory-text-link" href="/recipes/${esc(match.link.recipe)}/">Get the recipe →</a></div></aside>`;
}

export const profileUrl = (shop: Shop): string => isIndexableShop(shop) ? `/shop/${shop.slug}/` : `/catalog/?place=${encodeURIComponent(shop.slug)}`;
export function recordSource(shop: Shop): string {
  const source = shop.dataSource === 'manual' ? null : getSource(shop.dataSource === 'overture' ? 'overture-places' : 'osm-overpass');
  return `${source ? `<a href="${esc(source.attributionUrl)}">${esc(source.attribution)}</a>` : 'Manually entered location'}${shop.sourceId ? ` · Source ID: ${esc(shop.sourceId)}` : ''}${shop.sourceLicenses?.length ? ` · ${esc(shop.sourceLicenses.join(', '))}` : ''}${shop.dataSource === 'osm' ? ' · ODbL' : ''}`;
}
const cuisineMarks: Record<string,string> = {ramen:'拉麺',udon:'饂飩',soba:'蕎麦',oden:'おでん',other:'湯'};
export function directoryCard(shop: Shop, saved = false, distance?: number): string {
  const editorial = isEditorial(shop);
  const name = displayName(shop, 'en');
  const cuisine = CUISINES.find(c => c.id === cuisineOf(shop))!.label;
  const area = editorial ? `${shop.neighborhood}, ${shop.city}` : `${shop.localityRomanized ?? shop.city}${shop.prefecture ? `, ${shop.prefecture}` : ''}`;
  return `<li class="directory-card${editorial ? ' directory-card--selection' : ''}" data-record="${esc(shop.slug)}">
    <div class="directory-card__top"><span class="directory-kicker">${editorial ? 'Soupmap selection' : 'Open-data listing'}</span><button type="button" class="directory-save" data-directory-save="${esc(shop.slug)}" aria-pressed="${saved}" aria-label="${saved ? 'Unsave' : 'Save'} ${esc(name)}" hidden>${saved ? 'Saved ✓' : 'Save +'}</button></div>
    <div class="directory-card__identity"><span class="directory-card__mark" lang="ja" aria-hidden="true">${cuisineMarks[cuisineOf(shop)] ?? '湯'}</span><div><h2><a href="${esc(profileUrl(shop))}" data-profile="${esc(shop.slug)}">${esc(name)}</a></h2>
    ${shop.nameJa !== name ? `<p class="directory-card__ja" lang="ja">${esc(shop.nameJa)}</p>` : ''}
    <p class="directory-card__area">${esc(area)}${distance !== undefined ? ` · ${(distance / 1000).toFixed(1)} km away` : ''}</p></div></div>
    <div class="directory-tags"><span>${esc(cuisine)}</span>${shop.broth !== 'other' && cuisine.toLowerCase() !== shop.broth ? `<span>${esc(BROTHS[shop.broth].label)}${shop.brothSource === 'name' ? ' · name suggests' : ''}</span>` : ''}${shop.chain ? '<span>Chain</span>' : ''}</div>
    <p class="directory-card__note">${editorial ? esc(shop.blurb) : 'Menu notes not yet added.'}</p>
    <div class="directory-card__bottom"><a href="${esc(profileUrl(shop))}" data-profile="${esc(shop.slug)}">Explore this place <span aria-hidden="true">↗</span></a>${shop.priceYen ? `<span>¥${shop.priceYen[0].toLocaleString()}–${shop.priceYen[1].toLocaleString()} <small>guide price</small></span>` : '<span class="directory-muted">Check live details</span>'}</div>
    <details class="directory-source"><summary>${shop.verified ? 'Verified location' : 'Location unverified'} · Source</summary><p>${shop.verified ? 'Verified on the ground.' : 'Unverified location.'} ${recordSource(shop)}</p></details>
  </li>`;
}
export function directoryControls(city: string): string {
  return `<form class="directory-controls" id="directory-controls" hidden role="search">
    <label class="directory-search"><span>Find a place</span><input id="directory-query" name="q" type="search" placeholder="A shop, neighborhood, or bowl…" maxlength="100" autocomplete="off"></label>
    <details class="directory-filter-disclosure" open><summary>Refine your search <span aria-hidden="true">+</span></summary><div class="directory-filter-grid">
      <label>Where<select name="city" id="directory-city"><option value="all">All Japan</option>${CITIES.map(c => `<option value="${c.slug}"${c.slug === city ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label>Style<select name="cuisine" id="directory-cuisine"><option value="all">Every style</option>${CUISINES.map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select></label>
      <label>Collection<select name="collection" id="directory-collection"><option value="all">All places</option><option value="editorial">Soupmap selections</option><option value="saved">My saved places</option></select></label>
      <label>Sort by<select name="sort" id="directory-sort"><option value="guide">Selections first</option><option value="name">Name A–Z</option><option value="distance">Nearest to me</option></select></label>
    </div><div class="directory-filter-foot"><label><input type="checkbox" id="directory-independent" name="independent"> Hide known chains</label><button type="reset">Clear all filters ↺</button></div></details><div class="directory-filter-note"><span class="directory-kicker">A guide in progress</span><p>Selections have Soupmap notes. Open-data listings widen the search. Check current details before you go.</p><a href="/credits/">About our sources ↗</a></div>
  </form>`;
}
export function googlePanelShell(): string {
  return `<section class="google-place-panel" aria-label="Google restaurant details"><div class="google-place-intro"><span class="directory-kicker">Before you go</span><h3>See the place. Know the details.</h3><p>Look up photos, opening hours, ratings and reviews from Google Maps.</p><button type="button" class="directory-button" data-google-load>Load Google details ↗</button></div><p data-google-status role="status"></p><div data-google-content></div><p class="google-place-legal"><a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a></p></section>`;
}
export function profileHtml(shop: Shop): string {
  const editorial = isEditorial(shop);
  const name = displayName(shop, 'en');
  return `<article class="place-profile" data-place-profile="${esc(shop.slug)}">
    <header class="place-profile__header"><span class="directory-kicker">${esc(shop.city)} / ${editorial ? 'Soupmap selection' : 'Open-data listing'}</span><h1 tabindex="-1">${esc(name)}</h1><p lang="ja">${esc(shop.nameJa)}</p><p>${esc(shop.neighborhood)} · ${esc(shop.city)}</p></header>
    <div class="place-profile__actions"><button class="directory-button" data-directory-save="${esc(shop.slug)}" aria-pressed="false" hidden>Save place +</button><a class="directory-button directory-button--quiet" href="https://www.google.com/maps/dir/?api=1&amp;destination=${shop.lat},${shop.lng}" target="_blank" rel="noopener">Directions ↗</a><a class="directory-text-link" href="/map/#${esc(shop.slug)}">View on map ↗</a><a class="directory-text-link" href="/me/#places">Your saved places ↗</a></div><p data-profile-status role="status"></p>
    <div class="place-profile__facts"><div><span>Style</span><strong>${esc(CUISINES.find(c=>c.id===cuisineOf(shop))!.label)}</strong><small>${shop.broth !== 'other' ? esc(BROTHS[shop.broth].label)+(shop.brothSource==='name'?' · from the name':'') : 'Broth not recorded'}</small></div><div><span>Guide price</span><strong>${shop.priceYen ? `¥${shop.priceYen[0]}–¥${shop.priceYen[1]}` : 'Not recorded'}</strong><small>Confirm current menu prices</small></div><div><span>Before visiting</span><strong>Check opening hours</strong><small>${shop.hours ? esc(shop.hours)+' · guide hours' : 'Look up live details below'}</small></div></div>
    <div class="place-profile__columns"><div class="place-profile__notes"><section><span class="directory-kicker">What to know</span><h2>${editorial ? esc(shop.signatureBowl) : 'A new place for your list?'}</h2><p>${editorial ? esc(shop.blurb) : 'This location comes from the open places catalog. We haven’t written a guide to its menu yet. Check the restaurant details before heading over.'}</p>${stylesHtml(shop)}
</section>
    <section data-profile-contact><h2>Contact &amp; location</h2>${contactHtml(shop)}</section>
    <details class="directory-source"><summary>Sources &amp; verification</summary><p>${shop.verified ? 'Verified on the ground.' : 'Not verified. Unverified location; not independently checked on the ground.'}</p><p>${recordSource(shop)}</p><p>Reported coordinates: ${shop.lat}, ${shop.lng}</p><p>Soupmap notes are editorial content, not copied reviews. Prices and menu notes may change. Generated romanizations are approximate; the Japanese name is preserved.</p><a href="/credits/">All data credits</a></details></div>
    <aside class="place-profile__live">${googlePanelShell()}<a class="directory-text-link" href="${esc(shop.googleMapsUrl)}" target="_blank" rel="noopener">Open in Google Maps ↗</a>${recipeCardHtml(shop)}</aside></div>
  </article>`;
}
