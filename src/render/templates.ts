/**
 * String templates shared by the browser and the build.
 * The Vite plugin prerenders these into index.html (fast first paint, crawlable),
 * and the client re-renders with the same functions when filters change.
 * Phase 2's prerendered /shop/<slug> and /city/<slug> pages should reuse them.
 */
import { BROTHS, BROTH_IDS, type BrothId } from "../data/broths.ts";
import { CITIES } from "../data/cities.ts";
import type { Shop } from "../data/schema.ts";
import { t } from "../i18n.ts";
import { icon } from "../ui/icons.ts";
import { bowlArt } from "./bowl.ts";
import { esc } from "../ui/dom.ts";

export function bowlIcon(broth: BrothId): string {
  return `<span class="bowl" style="--broth:${BROTHS[broth].color}" aria-hidden="true"></span>`;
}

export function shopRowHtml(shop: Shop, selected: boolean, saved = false, index = 0): string {
  const broth = BROTHS[shop.broth];
  return `<li class="shop-entry${selected ? ' is-selected' : ''}">
    <a class="shop-row" href="#${esc(shop.slug)}" data-slug="${esc(shop.slug)}"${selected ? ' aria-current="true"' : ''}>
      <span class="shop-row__art" style="--broth:${broth.color}">${bowlArt(shop.broth)}</span>
      <span class="shop-row__content"><span class="shop-row__kicker">${esc(shop.neighborhood)} <span> / ${String(index + 1).padStart(2, '0')}</span></span>
      <span class="shop-row__name">${esc(shop.name)}</span>
      <span class="shop-row__ja" lang="ja">${esc(shop.nameJa)}</span>
      <span class="shop-row__meta"><span class="swatch" style="--broth:${broth.color}"></span>${esc(broth.label)}<span class="shop-row__city"> · ${esc(shop.city)}</span></span></span>
      <span class="shop-row__arrow" aria-hidden="true">↗</span>
    </a>
    <button class="save-shop" data-save="${esc(shop.slug)}" aria-pressed="${saved}" aria-label="${saved ? 'Unsave' : 'Save'} ${esc(shop.name)}" title="${saved ? 'Remove from saved' : 'Save this place'}">${icon('bookmark')}</button>
  </li>`;
}

export function shopListHtml(shops: readonly Shop[], selected: string | null = null, saved: ReadonlySet<string> = new Set(), savedOnly = false): string {
  if (!shops.length) return `<li class="empty"><span class="empty__symbol" aria-hidden="true">${icon(savedOnly ? 'bookmark' : 'search')}</span><strong>${savedOnly ? 'A little room for discovery.' : 'A different craving?'}</strong><p>${savedOnly ? 'Save places with the bookmark button. If you already have saves, try resetting your filters.' : 'No bowls match these filters. Try another city, flavor, or search.'}</p></li>`;
  return shops.map((s, i) => shopRowHtml(s, s.slug === selected, saved.has(s.slug), i)).join('');
}

export function resultCountText(n: number): string {
  return n === 1 ? t("resultCountOne") : t("resultCount", { n });
}

/** Only broths that at least one shop uses get a filter chip. */
export function brothChipsHtml(shops: readonly Shop[], pressed: ReadonlySet<BrothId> = new Set()): string {
  const used = new Set(shops.map((s) => s.broth));
  return BROTH_IDS.filter((id) => used.has(id))
    .map((id) => {
      const b = BROTHS[id];
      return `<button type="button" class="chip" data-broth="${id}" aria-pressed="${pressed.has(id)}" title="${esc(b.description)}">
        <span class="swatch" style="--broth:${b.color}" aria-hidden="true"></span>${esc(b.label)}</button>`;
    })
    .join("");
}

export function cityButtonsHtml(shops: readonly Shop[]): string {
  const used = new Set(shops.map((s) => s.city));
  const cities = CITIES.filter((c) => used.has(c.name))
    .map(
      (c) =>
        `<button type="button" class="city-btn" data-city="${c.slug}" aria-pressed="${c.slug === 'tokyo'}">${esc(c.name)}<span class="ja" lang="ja">${esc(c.nameJa)}</span></button>`,
    )
    .join("");
  return `<button type="button" class="city-btn" data-city="all" aria-pressed="false">${esc(t("allJapan"))}</button>${cities}`;
}
