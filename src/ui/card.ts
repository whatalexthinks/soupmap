import { trackEvent } from "../analytics.ts";
/** The shop card: names, broth, signature bowl, facts, blurb, media and actions. */
import { BROTHS } from "../data/broths.ts";
import { CHAIN_SIZES, DETAILS_INLINE, type Shop } from "../data/shops.ts";
import { loadPlaceDetails } from "../data/load-open-catalog.ts";
import type { OpenPlaceDetails } from "../data/catalog-format.ts";
import { chainHtml, contactHtml, placeLine, stylesHtml } from "./shop-details.ts";
import { isEditorial } from "../data/indexation.ts";
import { getSource } from "../sources.ts";
import { t } from "../i18n.ts";
import { displayName, getNameLanguage, isRomanizedName } from "../names.ts";
import { $, esc, prefersReducedMotion } from "./dom.ts";
import { icon } from "./icons.ts";
import { HistorySection } from "./history-section.ts";
import type { HistoryMapPlace } from "../history-coverage.ts";

export interface CardHandlers {
  onHistoryPlaces?(places: HistoryMapPlace[]): void;
  onClose(): void;
  onSave(shop: Shop): void;
  onVisit(shop: Shop): void;
  onContribute(shop: Shop): void;
  onStandOutside(shop: Shop): void;
  onBuildingInfo(shop: Shop): void;
  onStepInside(shop: Shop): void;
  onCopyLink(shop: Shop): void;
}

export type StreetViewState = "unknown" | "available" | "unavailable" | "loading";

const yen = new Intl.NumberFormat("en-US", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

function priceText(shop: Shop): string {
  if (!shop.priceYen) return `<span class="muted">${esc(t("notVerified"))}</span>`;
  const [lo, hi] = shop.priceYen;
  return esc(lo === hi ? yen.format(lo) : `${yen.format(lo)}–${yen.format(hi)}`);
}

function directionsUrl(shop: Shop): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${shop.lat},${shop.lng}`;
}

function mediaHtml(shop: Shop): string {
  if (shop.videoUrl) {
    const autoplay = prefersReducedMotion() ? "" : " autoplay";
    return `<video src="${esc(shop.videoUrl)}" muted playsinline loop controls${autoplay} preload="metadata" aria-label="${esc(`${displayName(shop)}: short video`)}"></video>`;
  }
  if (shop.photo.url) {
    return `<img src="${esc(shop.photo.url)}" alt="${esc(`${shop.signatureBowl} at ${displayName(shop)}`)}" loading="lazy" decoding="async" />
      <p class="card__credit">${esc(t("photoBy", { credit: shop.photo.credit ?? "", license: shop.photo.license ?? "" }))}</p>`;
  }
  return `<div class="card__identity"><span class="card__identity-label">${shop.broth === "other" ? "SOUP ATLAS / PLACE RECORD" : "SOUP ATLAS / BROTH STYLE"}</span><span class="card__identity-name">${esc(BROTHS[shop.broth].label)}</span><span class="card__identity-ja" lang="ja">${esc(BROTHS[shop.broth].labelJa)}</span></div>`;
}

function provenanceHtml(shop: Shop): string {
  if (shop.dataSource === "overture") {
    const s = getSource("overture-places");
    return `Location: <a href="${s.attributionUrl}" target="_blank" rel="noopener">${esc(s.attribution)}</a>${shop.sourceLicenses?.length ? ` · ${esc(shop.sourceLicenses.join(", "))}` : ""} · `;
  }
  if (shop.dataSource === "osm") {
    const s = getSource("osm-overpass");
    return `Location: <a href="${s.attributionUrl}" target="_blank" rel="noopener">${esc(s.attribution)}</a> (ODbL) · `;
  }
  return "";
}

export class ShopCard {
  private readonly el = $("#card");
  private shop: Shop | null = null;
  private readonly history: HistorySection;

  constructor(private readonly handlers: CardHandlers) {
    this.history = new HistorySection(document.createElement("div"), places => handlers.onHistoryPlaces?.(places));
    this.el.addEventListener("click", (e) => {
      const button = (e.target as Element).closest<HTMLElement>("[data-action]");
      if (!button || !this.shop) return;
      const shop = this.shop;
      switch (button.dataset.action) {
        case "visit": handlers.onVisit(shop); break;
        case "contribute": handlers.onContribute(shop); break;
        case "directions":
          trackEvent("directions_clicked", {city:shop.city,broth:shop.broth});
          break;
        case "save":
          handlers.onSave(shop);
          break;
        case "close":
          handlers.onClose();
          break;
        case "stand-outside":
          handlers.onStandOutside(shop);
          break;
        case "building":
          handlers.onBuildingInfo(shop);
          break;
        case "step-inside":
          handlers.onStepInside(shop);
          break;
        case "copy":
          handlers.onCopyLink(shop);
          break;
      }
    });
  }

  get current(): Shop | null {
    return this.shop;
  }

  open(shop: Shop, options: { focus: boolean; buildingAvailable: boolean; saved: boolean; visited?: boolean }): void {
    this.shop = shop;
    const broth = BROTHS[shop.broth];
    this.el.style.setProperty("--broth", broth.color);
    this.el.style.setProperty("--broth-ink", broth.ink);
    this.el.innerHTML = `
      <div class="card__scroll">
        <div class="card__media${shop.photo.url || shop.videoUrl ? "" : " card__media--type"}">
          ${mediaHtml(shop)}
          <div class="card__topbar">
            <button type="button" class="icon-btn" data-action="save" aria-pressed="${options.saved}" aria-label="${options.saved ? 'Unsave this place' : 'Save this place'}" title="Save this place">${icon('bookmark')}</button>
            <button type="button" class="icon-btn" data-action="close" aria-label="${esc(t("close"))}" title="${esc(t("close"))}">${icon("close")}</button>
          </div>
        </div>
        <div class="card__body">
          <h2 class="card__title" id="card-title" tabindex="-1">${esc(displayName(shop))}</h2>
          ${shop.nameJa !== displayName(shop) ? `<p class="card__ja" lang="ja">${esc(shop.nameJa)}</p>` : ""}
          ${getNameLanguage() === "en" && isRomanizedName(shop) ? `<p class="card__fine">${shop.nameSource === "brand"
            ? "English brand name; branch name romanized. Japanese original above."
            : "Automatically romanized name; pronunciation may differ. Japanese original above."}</p>` : ""}
          <p class="card__where">${placeLine(shop)}</p>
          ${chainHtml(shop, shop.chain ? CHAIN_SIZES.get(shop.chain) : undefined)}
          <span class="broth-chip"><span class="swatch" style="--broth:${broth.ink}" aria-hidden="true"></span>${esc(broth.label)} <span class="ja" lang="ja">${esc(broth.labelJa)}</span>${shop.brothSource === "name" ? '<span class="broth-chip__note">from the name</span>' : ""}</span>
          ${stylesHtml(shop)}
          <dl class="facts">
            <dt>${esc(t("signatureBowl"))}</dt><dd>${esc(shop.signatureBowl)}</dd>
            <dt>${esc(t("price"))}</dt><dd>${priceText(shop)}</dd>
            <dt>${esc(t("hours"))}</dt><dd>${shop.hours ? esc(shop.hours) : `<span class="muted">${esc(t("checkBeforeYouGo"))}</span>`}</dd>
          </dl>
          <div class="street-view-actions">
            <div class="card__primary-actions">
              <a class="btn btn--primary" data-action="directions" href="${esc(directionsUrl(shop))}" target="_blank" rel="noopener">${icon("directions")}${esc(t("directions"))}</a>
              <button type="button" class="btn btn--primary" data-action="stand-outside" disabled aria-describedby="street-view-status">${icon("person")}Street View</button>
            </div>
            <a class="street-view-link" href="https://www.google.com/maps/@?api=1&amp;map_action=pano&amp;viewpoint=${shop.lat},${shop.lng}" target="_blank" rel="noopener">Open Street View in Google Maps ↗</a>
            <p id="street-view-status" class="card__fine" role="status">Checking nearby outdoor imagery…</p>
          </div>
          <p class="blurb">${esc(shop.blurb)}</p>
          ${isEditorial(shop) ? "" : `<section class="card__contact" aria-label="Contact details" aria-busy="true"><p class="card__fine">Loading contact details…</p></section>`}
          ${shop.verified ? "" : `<p class="unverified">${icon("info")}<span>${esc(t("unverifiedNote"))}</span></p>`}
          <div class="visit-actions"><button class="btn btn--primary" data-action="visit">${options.visited?'✓ In your passport · Edit visit':'I had a bowl here · Collect a stamp'}</button><button class="text-btn" data-action="contribute">Read & leave field notes ↗</button></div>
          <div class="card__history"></div>
          <div class="actions">
            <button type="button" class="btn" data-action="building" aria-pressed="false"${options.buildingAvailable ? "" : " hidden"}>${icon("building")}${esc(t("buildingInfo"))}</button>
            ${shop.splatUrl ? `<button type="button" class="btn" data-action="step-inside">${icon("cube")}${shop.splatUrl?.startsWith("procedural:") ? "View bowl demo" : esc(t("stepInside"))}</button>` : ""}
            <a class="btn" href="${esc(shop.googleMapsUrl)}" target="_blank" rel="noopener">${icon("external")}${esc(t("openInGoogleMaps"))}</a>
            <button type="button" class="btn" data-action="copy">${icon("link")}${esc(t("copyLink"))}</button>
          </div>
          <p class="card__fine">${provenanceHtml(shop)}<a href="/credits/">${esc(t("credits"))}</a></p>
        </div>
      </div>`;
    const historyHost = this.el.querySelector<HTMLElement>(".card__history");
    if (historyHost) {
      this.history.attach(historyHost);
      this.history.show(shop);
    }
    if (!isEditorial(shop)) void this.fillContact(shop);
    this.el.hidden = false;
    document.body.classList.add("has-card");
    this.el.querySelector(".card__scroll")?.scrollTo(0, 0);
    if (options.focus) this.el.querySelector<HTMLElement>("#card-title")?.focus({ preventScroll: true });
  }

  /** Contact details travel separately from the map catalog; fetch them for this shop only. */
  private async fillContact(shop: Shop): Promise<void> {
    const inline: OpenPlaceDetails = { address: shop.address, postcode: shop.postcode, phone: shop.phone, website: shop.website, socials: shop.socials };
    let details: OpenPlaceDetails | undefined = Object.values(inline).some(v => v !== undefined) ? inline : undefined;
    let failed = false;
    if (!details && !DETAILS_INLINE && shop.sourceId) {
      try { details = await loadPlaceDetails(shop.sourceId); } catch { failed = true; }
    }
    if (this.shop?.slug !== shop.slug) return;
    const host = this.el.querySelector<HTMLElement>(".card__contact");
    if (!host) return;
    host.removeAttribute("aria-busy");
    host.innerHTML = failed ? '<p class="card__fine">Contact details could not load. Try again later.</p>' : contactHtml(details);
  }

  close(): void {
    this.shop = null;
    this.history.close();
    this.el.hidden = true;
    this.el.innerHTML = "";
    document.body.classList.remove("has-card");
  }

  setVisited(visited: boolean): void {
    const button=this.el.querySelector<HTMLElement>('[data-action="visit"]');
    if(button)button.textContent=visited?'✓ In your passport · Edit visit':'I had a bowl here · Collect a stamp';
  }

  setSaved(saved: boolean): void {
    const button = this.el.querySelector<HTMLButtonElement>('[data-action="save"]');
    button?.setAttribute('aria-pressed', String(saved));
    button?.setAttribute('aria-label', saved ? 'Unsave this place' : 'Save this place');
  }

  setStreetView(state: StreetViewState, reason?: string): void {
    const btn = this.el.querySelector<HTMLButtonElement>('[data-action="stand-outside"]');
    if (!btn) return;
    btn.hidden = false;
    btn.setAttribute("aria-busy", String(state === "loading"));
    btn.disabled = state !== "available";
    const status = this.el.querySelector<HTMLElement>("#street-view-status");
    if (status) status.textContent = state === "unknown" ? "Checking nearby outdoor imagery…"
      : state === "loading" ? "Opening Street View…"
      : state === "available" ? reason ?? "Look around outside this shop. Imagery may not show its exact entrance."
      : reason ?? "In-app imagery is unavailable here. Try Street View in Google Maps.";
  }

  setBuildingInfo(visible: boolean, pressed: boolean): void {
    const btn = this.el.querySelector<HTMLButtonElement>('[data-action="building"]');
    if (!btn) return;
    btn.hidden = !visible;
    btn.setAttribute("aria-pressed", String(pressed));
  }

  contains(node: Node | null): boolean {
    return !!node && this.el.contains(node);
  }

  focusHistoryPlace(id: string): void {
    this.history.focusPlace(id);
  }
}
