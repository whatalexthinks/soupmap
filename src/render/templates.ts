/**
 * String templates shared by the browser and the build.
 * The Vite plugin prerenders these into index.html (fast first paint, crawlable),
 * and the client re-renders with the same functions when filters change.
 * Substantive records link to static shop documents; basic locations stay on the map.
 */
import { BROTHS, BROTH_IDS, type BrothId } from "../data/broths.ts";
import { CITIES } from "../data/cities.ts";
import type { Shop } from "../data/schema.ts";
import { t } from "../i18n.ts";
import { icon } from "../ui/icons.ts";
import { bowlArt } from "./bowl.ts";
import { esc } from "../ui/dom.ts";
import { displayName, getNameLanguage, type NameLanguage } from "../names.ts";
import { shopPath } from "../data/indexation.ts";

export function bowlIcon(broth: BrothId): string {
  return `<span class="bowl" style="--broth:${BROTHS[broth].color}" aria-hidden="true"></span>`;
}

export function shopRowHtml(shop: Shop, selected: boolean, saved = false, index = 0, language: NameLanguage = getNameLanguage()): string {
  const broth = BROTHS[shop.broth];
  const primaryName = displayName(shop, language);
  const accessibleName = shop.nameJa && shop.nameJa !== primaryName ? `${primaryName} (${shop.nameJa})` : primaryName;
  return `<li class="shop-entry${selected ? ' is-selected' : ''}">
    <a class="shop-row" href="${esc(shopPath(shop))}" data-slug="${esc(shop.slug)}" aria-label="${esc(accessibleName)}"${selected ? ' aria-current="true"' : ''}>
      <span class="shop-row__art" style="--broth:${broth.color}">${bowlArt(shop.broth)}</span>
      <span class="shop-row__content"><span class="shop-row__kicker">${esc(shop.neighborhood)} <span> / ${String(index + 1).padStart(2, '0')}</span></span>
      <span class="shop-row__name" lang="${language === "ja" ? "ja" : "en"}">${esc(primaryName)}</span>
      ${shop.nameJa && shop.nameJa !== primaryName ? `<span class="shop-row__ja" lang="ja">${esc(shop.nameJa)}</span>` : ""}
      <span class="shop-row__meta"><span class="swatch" style="--broth:${broth.color}"></span>${esc(broth.label)}<span class="shop-row__city"> · ${esc(shop.city)}${shop.slug.startsWith("open-") ? " · Open data" : ""}</span></span></span>
      <span class="shop-row__arrow" aria-hidden="true">↗</span>
    </a>
    <button class="save-shop" data-save="${esc(shop.slug)}" aria-pressed="${saved}" aria-label="${saved ? 'Unsave' : 'Save'} ${esc(accessibleName)}" title="${saved ? 'Remove from saved' : 'Save this place'}">${icon('bookmark')}</button>
  </li>`;
}

export function shopListHtml(shops: readonly Shop[], selected: string | null = null, saved: ReadonlySet<string> = new Set(), savedOnly = false, limit = 100, language: NameLanguage = getNameLanguage()): string {
  if (!shops.length) return `<li class="empty"><span class="empty__symbol" aria-hidden="true">${icon(savedOnly ? 'bookmark' : 'search')}</span><strong>${savedOnly ? 'A little room for discovery.' : 'A different craving?'}</strong><p>${savedOnly ? 'Save places with the bookmark button. If you already have saves, try resetting your filters.' : 'No bowls match these filters. Try another city, flavor, or search.'}</p></li>`;
  return shops.slice(0, limit).map((s, i) => shopRowHtml(s, s.slug === selected, saved.has(s.slug), i, language)).join('')
    + (shops.length > limit ? `<li class="load-more"><button type="button" class="btn" data-load-more>Show more shops (${Math.min(limit, shops.length).toLocaleString()} of ${shops.length.toLocaleString()})</button></li>` : '');
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
        `<a href="/city/${c.slug}/" class="city-btn" data-city="${c.slug}" aria-pressed="${c.slug === 'tokyo'}">${esc(c.name)}<span class="ja" lang="ja">${esc(c.nameJa)}</span></a>`,
    )
    .join("");
  return `<a href="/catalog/" class="city-btn" data-city="all" aria-pressed="false">${esc(t("allJapan"))}</a>${cities}`;
}
