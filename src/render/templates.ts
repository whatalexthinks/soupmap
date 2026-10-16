/**
 * String templates shared by the browser and the build.
 * The Vite plugin prerenders these into index.html (fast first paint, crawlable),
 * and the client re-renders with the same functions when filters change.
 * Phase 2's prerendered /shop/<slug> and /city/<slug> pages should reuse them.
 */
import { BROTHS, BROTH_IDS, type BrothId } from "../data/broths";
import { CITIES } from "../data/cities";
import type { Shop } from "../data/schema";
import { t } from "../i18n";
import { esc } from "../ui/dom";

export function bowlIcon(broth: BrothId): string {
  return `<span class="bowl" style="--broth:${BROTHS[broth].color}" aria-hidden="true"></span>`;
}

export function shopRowHtml(shop: Shop, selected: boolean): string {
  const broth = BROTHS[shop.broth];
  return `<li><a class="shop-row" href="#${esc(shop.slug)}" data-slug="${esc(shop.slug)}"${selected ? ' aria-current="true"' : ""}>
    ${bowlIcon(shop.broth)}
    <span class="shop-row__name">${esc(shop.name)}<span class="ja" lang="ja">${esc(shop.nameJa)}</span></span>
    <span class="shop-row__meta">${esc(shop.city)} · ${esc(broth.label)} · ${esc(shop.signatureBowl)}</span>
  </a></li>`;
}

export function shopListHtml(shops: readonly Shop[], selected: string | null = null): string {
  if (!shops.length) return `<li class="empty">${esc(t("noResults"))}</li>`;
  return shops.map((s) => shopRowHtml(s, s.slug === selected)).join("");
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
        `<button type="button" class="city-btn" data-city="${c.slug}">${esc(c.name)}<span class="ja" lang="ja">${esc(c.nameJa)}</span></button>`,
    )
    .join("");
  return `<button type="button" class="city-btn" data-city="all">${esc(t("allJapan"))}</button>${cities}`;
}
