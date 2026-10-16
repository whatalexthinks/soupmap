/** The shop card: names, broth, signature bowl, facts, blurb, media and actions. */
import { BROTHS } from "../data/broths";
import type { Shop } from "../data/shops";
import { getSource } from "../sources";
import { t } from "../i18n";
import { $, esc, prefersReducedMotion } from "./dom";
import { icon } from "./icons";

export interface CardHandlers {
  onClose(): void;
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
    return `<video src="${esc(shop.videoUrl)}" muted playsinline loop controls${autoplay} preload="metadata" aria-label="${esc(`${shop.name}: short video`)}"></video>`;
  }
  if (shop.photo.url) {
    return `<img src="${esc(shop.photo.url)}" alt="${esc(`${shop.signatureBowl} at ${shop.name}`)}" loading="lazy" decoding="async" />
      <p class="card__credit">${esc(t("photoBy", { credit: shop.photo.credit ?? "", license: shop.photo.license ?? "" }))}</p>`;
  }
  // No photo yet: an illustrated bowl in the shop's broth colour.
  return `<svg class="card__media-bowl" viewBox="0 0 92 92" aria-hidden="true">
      <g class="loader__steam"><path d="M34 36c-5-7 5-11 0-18s5-11 0-16"/><path d="M46 36c-5-7 5-11 0-18s5-11 0-16"/><path d="M58 36c-5-7 5-11 0-18s5-11 0-16"/></g>
      <path d="M12 46h68c0 18-15 32-34 32S12 64 12 46Z" fill="#17142c" stroke="#f3efe6" stroke-width="2.5"/>
      <ellipse cx="46" cy="46" rx="34" ry="8" fill="${BROTHS[shop.broth].color}" stroke="#f3efe6" stroke-width="2.5"/>
      <path d="M36 78h20l-3 6H39z" fill="#17142c" stroke="#f3efe6" stroke-width="2"/></svg>`;
}

function provenanceHtml(shop: Shop): string {
  if (shop.dataSource === "overture") {
    const s = getSource("overture-places");
    return `Location: <a href="${s.attributionUrl}" target="_blank" rel="noopener">${esc(s.attribution)}</a> · `;
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

  constructor(private readonly handlers: CardHandlers) {
    this.el.addEventListener("click", (e) => {
      const button = (e.target as Element).closest<HTMLElement>("[data-action]");
      if (!button || !this.shop) return;
      const shop = this.shop;
      switch (button.dataset.action) {
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

  open(shop: Shop, options: { focus: boolean; buildingAvailable: boolean }): void {
    this.shop = shop;
    const broth = BROTHS[shop.broth];
    this.el.style.setProperty("--broth", broth.color);
    this.el.style.setProperty("--broth-ink", broth.ink);
    this.el.innerHTML = `
      <div class="card__scroll">
        <div class="card__media">
          ${mediaHtml(shop)}
          <div class="card__topbar">
            <span></span>
            <button type="button" class="icon-btn" data-action="close" aria-label="${esc(t("close"))}" title="${esc(t("close"))}">${icon("close")}</button>
          </div>
        </div>
        <div class="card__body">
          <h2 class="card__title" id="card-title" tabindex="-1">${esc(shop.name)}</h2>
          <p class="card__ja" lang="ja">${esc(shop.nameJa)}</p>
          <p class="card__where">${esc(shop.neighborhood)}, ${esc(shop.city)}</p>
          <span class="broth-chip"><span class="swatch" style="--broth:${broth.ink}" aria-hidden="true"></span>${esc(broth.label)} <span class="ja" lang="ja">${esc(broth.labelJa)}</span></span>
          <dl class="facts">
            <dt>${esc(t("signatureBowl"))}</dt><dd>${esc(shop.signatureBowl)}</dd>
            <dt>${esc(t("price"))}</dt><dd>${priceText(shop)}</dd>
            <dt>${esc(t("hours"))}</dt><dd>${shop.hours ? esc(shop.hours) : `<span class="muted">${esc(t("checkBeforeYouGo"))}</span>`}</dd>
          </dl>
          <p class="blurb">${esc(shop.blurb)}</p>
          ${shop.verified ? "" : `<p class="unverified">${icon("info")}<span>${esc(t("unverifiedNote"))}</span></p>`}
          <div class="actions">
            <button type="button" class="btn btn--primary" data-action="stand-outside" hidden>${icon("person")}${esc(t("standOutside"))}</button>
            <button type="button" class="btn" data-action="building" aria-pressed="false"${options.buildingAvailable ? "" : " hidden"}>${icon("building")}${esc(t("buildingInfo"))}</button>
            ${shop.splatUrl ? `<button type="button" class="btn" data-action="step-inside">${icon("cube")}${esc(t("stepInside"))}</button>` : ""}
            <a class="btn" href="${esc(shop.googleMapsUrl)}" target="_blank" rel="noopener">${icon("external")}${esc(t("openInGoogleMaps"))}</a>
            <a class="btn" href="${esc(directionsUrl(shop))}" target="_blank" rel="noopener">${icon("directions")}${esc(t("directions"))}</a>
            <button type="button" class="btn" data-action="copy">${icon("link")}${esc(t("copyLink"))}</button>
          </div>
          <p class="card__fine">${provenanceHtml(shop)}<a href="/credits/">${esc(t("credits"))}</a></p>
        </div>
      </div>`;
    this.el.hidden = false;
    document.body.classList.add("has-card");
    this.el.querySelector(".card__scroll")?.scrollTo(0, 0);
    if (options.focus) this.el.querySelector<HTMLElement>("#card-title")?.focus({ preventScroll: true });
  }

  close(): void {
    this.shop = null;
    this.el.hidden = true;
    this.el.innerHTML = "";
    document.body.classList.remove("has-card");
  }

  setStreetView(state: StreetViewState): void {
    const btn = this.el.querySelector<HTMLButtonElement>('[data-action="stand-outside"]');
    if (!btn) return;
    btn.hidden = state === "unknown" || state === "unavailable";
    btn.setAttribute("aria-busy", String(state === "loading"));
    btn.disabled = state === "loading";
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
}
