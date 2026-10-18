/**
 * Card sections for open-data facts: where the shop is, what its name suggests, whether
 * it's part of a chain, and contact details copied from the source record.
 * Every derived fact says where it came from.
 */
import type { Shop } from "../data/shops.ts";
import { STYLE_BY_ID, type StyleTag } from "../data/styles.ts";
import { BROTHS } from "../data/broths.ts";
import type { OpenPlaceDetails } from "../data/catalog-format.ts";
import { esc } from "./dom.ts";
import { isEditorial } from "../data/indexation.ts";

/** "+81312345678" → "03-1234-5678". Grouping is a readable approximation; the tel: link is exact. */
export function nationalPhone(e164: string): string {
  const digits = `0${e164.replace(/^\+81/, "")}`;
  if (/^0[5789]0/.test(digits) && digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (/^0[36]/.test(digits) && digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}

const SOCIAL_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/instagram\.com$/, "Instagram"], [/(?:^|\.)(?:x|twitter)\.com$/, "X"],
  [/facebook\.com$/, "Facebook"], [/tiktok\.com$/, "TikTok"],
];

function safeUrl(value: string | undefined): URL | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}

/** "Chuo, Osaka · Osaka Prefecture" for imported places; the editorial line otherwise. */
export function placeLine(shop: Shop): string {
  if (isEditorial(shop)) return `${esc(shop.neighborhood)}, ${esc(shop.city)}`;
  const place = shop.localityRomanized ?? shop.city;
  const prefecture = shop.prefecture && shop.prefecture !== place ? `, ${esc(shop.prefecture)}` : "";
  return `${esc(place)}${prefecture} <span class="ja" lang="ja">${esc(shop.neighborhood)}</span>`;
}

export function stylesHtml(shop: Shop): string {
  // The broth chip already says "Tsukemen"; list only the styles that add something.
  const broth = BROTHS[shop.broth].label;
  const styles = (shop.styles ?? []).map(id => STYLE_BY_ID.get(id))
    .filter((s): s is StyleTag => !!s && s.label !== broth);
  if (!styles.length) return "";
  return `<div class="style-tags"><p class="card__fine">Suggested by the shop's name</p><ul>${styles.map(s =>
    `<li title="${esc(s.description)}">${esc(s.label)} <span class="ja" lang="ja">${esc(s.labelJa)}</span></li>`).join("")}</ul></div>`;
}

export function chainHtml(shop: Shop, size: number | undefined): string {
  if (!shop.chain) return "";
  return `<p class="chain-badge"><strong>Chain</strong> ${esc(shop.chain)}${size ? ` · ${size.toLocaleString()} locations in our catalog` : ""}</p>`;
}

export function contactHtml(details: OpenPlaceDetails | undefined): string {
  if (!details) return `<p class="card__fine">No contact details in the source record.</p>`;
  const rows: string[] = [];
  if (details.address) {
    rows.push(`<dt>Address</dt><dd>${details.postcode ? `〒${esc(details.postcode)} ` : ""}${esc(details.address)}</dd>`);
  }
  if (details.phone && /^\+81\d{9,10}$/.test(details.phone)) {
    rows.push(`<dt>Phone</dt><dd><a href="tel:${esc(details.phone)}">${esc(nationalPhone(details.phone))}</a></dd>`);
  }
  const website = safeUrl(details.website);
  if (website) {
    rows.push(`<dt>Website</dt><dd><a href="${esc(website.href)}" target="_blank" rel="noopener nofollow">${esc(website.hostname.replace(/^www\./, ""))} ↗</a></dd>`);
  }
  const socials = (details.socials ?? []).map(safeUrl).filter((u): u is URL => !!u).map(url => {
    const label = SOCIAL_LABELS.find(([host]) => host.test(url.hostname.replace(/^www\./, "")))?.[1] ?? url.hostname;
    return `<a href="${esc(url.href)}" target="_blank" rel="noopener nofollow">${esc(label)} ↗</a>`;
  });
  if (socials.length) rows.push(`<dt>Social</dt><dd>${socials.join(" · ")}</dd>`);
  if (!rows.length) return `<p class="card__fine">No contact details in the source record.</p>`;
  return `<dl class="facts facts--contact">${rows.join("")}</dl>
    <p class="card__fine">Contact details come from Overture's open places data and may be out of date.</p>`;
}
