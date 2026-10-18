import { isTokyoHistoryLocation, type HistoryMapPlace } from "../history-coverage.ts";
import type { HistoryPlace, NearbyHistory, HistoryDataset } from "../history.ts";
import { esc } from "./dom.ts";

type HistoryLocation = { lat: number; lng: number };
type HistoryModule = {
  loadTokyoHistory(): Promise<HistoryDataset>;
  nearbyHistory(dataset: HistoryDataset, location: HistoryLocation): NearbyHistory[];
};

const number = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const wikipediaLicenseUrl = "https://creativecommons.org/licenses/by-sa/4.0/";

/** Opt-in, per-card context about curated historical places near a soup shop. */
export class HistorySection {
  private host: HTMLElement;
  private location: HistoryLocation | null = null;
  private enabled = false;
  private active = false;
  private revision = 0;

  constructor(
    host: HTMLElement,
    private readonly onPlaces: (places: HistoryMapPlace[]) => void = () => {},
    private readonly getHistory: () => Promise<HistoryModule> = () => import("../history.ts"),
  ) {
    this.host = host;
    this.host.addEventListener("change", this.onChange);
    this.host.addEventListener("click", this.onClick);
  }

  /** Rebinds the section when ShopCard rebuilds its inner markup. */
  attach(host: HTMLElement): void {
    this.host.removeEventListener("change", this.onChange);
    this.host.removeEventListener("click", this.onClick);
    this.host = host;
    this.host.addEventListener("change", this.onChange);
    this.host.addEventListener("click", this.onClick);
    if (this.active && this.location) this.render();
  }

  show(shop: HistoryLocation): void {
    this.location = { lat: shop.lat, lng: shop.lng };
    this.active = true;
    const revision = ++this.revision;
    this.onPlaces([]);
    this.render();
    if (this.enabled) void this.load(revision);
  }

  close(): void {
    this.active = false;
    ++this.revision;
    this.onPlaces([]);
    this.host.replaceChildren();
  }

  private onChange = (event: Event): void => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>("[data-history-opt-in]");
    if (!input || !this.active || !this.location) return;
    this.enabled = input.checked;
    const revision = ++this.revision;
    this.onPlaces([]);
    this.render(true);
    if (this.enabled) void this.load(revision);
  };

  private onClick = (event: Event): void => {
    const retry = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-history-retry]");
    if (!retry || !this.active || !this.enabled) return;
    const revision = ++this.revision;
    this.render();
    void this.load(revision, true);
  };

  private render(restoreFocus = false): void {
    if (!this.active) return;
    this.host.innerHTML = `
      <section class="history" aria-labelledby="history-heading">
        <div class="history__header">
          <div>
            <p class="history__eyebrow">A little context, nearby</p>
            <h3 id="history-heading" class="history__title">History nearby</h3>
          </div>
          <label class="history__toggle">
            <input type="checkbox" data-history-opt-in aria-label="Load nearby history" ${this.enabled ? "checked" : ""}>
            <span>Show</span>
          </label>
        </div>
        <p class="history__intro">An optional, curated Tokyo pilot. Switch on to load up to four places within 2.5 km and show them on the map.</p>
        <div class="history__content" aria-live="polite" aria-atomic="true"></div>
      </section>`;
    if (this.enabled && this.location) {
      const content = this.host.querySelector<HTMLElement>(".history__content");
      if (content) content.innerHTML = `<p class="history__status" role="status">Loading nearby history…</p>`;
    }
    if (restoreFocus) this.host.querySelector<HTMLInputElement>("[data-history-opt-in]")?.focus();
  }

  private async load(revision: number, focusStatus = false): Promise<void> {
    const location = this.location;
    if (!location || !this.enabled || !this.active) return;
    const content = this.host.querySelector<HTMLElement>(".history__content");
    if (!content) return;

    if (!isTokyoHistoryLocation(location)) {
      content.innerHTML = `<p class="history__status" role="status" tabindex="-1">This shop is outside the Tokyo history pilot coverage.</p>${this.caveat()}`;
      if (focusStatus) content.querySelector<HTMLElement>("[role=status]")?.focus();
      return;
    }

    content.innerHTML = `<p class="history__status" role="status" tabindex="-1">Loading nearby history…</p>`;
    if (focusStatus) content.querySelector<HTMLElement>("[role=status]")?.focus();
    try {
      // The history data module and its data are deliberately not imported until opt-in.
      const history = await this.getHistory();
      if (!this.isCurrent(revision)) return;
      const dataset = await history.loadTokyoHistory();
      if (!this.isCurrent(revision)) return;
      const nearby = history.nearbyHistory(dataset, location);
      const currentContent = this.host.querySelector<HTMLElement>(".history__content");
      if (!currentContent) return;
      this.onPlaces(nearby.map(({place}) => ({id: place.id, nameEn: place.nameEn, lat: place.lat, lng: place.lng})));
      if (!nearby.length) {
        currentContent.innerHTML = `<p class="history__status" role="status" tabindex="-1">No curated history entries are mapped within 2.5 km of this shop yet.</p>${this.caveat()}`;
      } else {
        currentContent.innerHTML = `${nearby.map(({ place, distanceMeters }) => this.placeHtml(place, distanceMeters)).join("")}${this.caveat()}`;
      }
      if (focusStatus) this.host.querySelector<HTMLInputElement>("[data-history-opt-in]")?.focus();
    } catch {
      if (!this.isCurrent(revision)) return;
      const currentContent = this.host.querySelector<HTMLElement>(".history__content");
      if (!currentContent) return;
      currentContent.innerHTML = `<div class="history__error" role="status" tabindex="-1"><p>Nearby history could not be loaded.</p><button class="history__retry" type="button" data-history-retry>Retry</button></div>${this.caveat()}`;
      if (focusStatus) currentContent.querySelector<HTMLElement>("[role=status]")?.focus();
    }
  }

  private isCurrent(revision: number): boolean {
    return this.active && this.enabled && this.revision === revision;
  }

  private placeHtml(place: HistoryPlace, distanceMeters: number): string {
    const kind = place.kind === "landmark" ? "Landmark" : "Neighbourhood";
    const distance = distanceMeters < 1000
      ? `About ${number.format(Math.round(distanceMeters / 10) * 10)} m`
      : `About ${(distanceMeters / 1000).toFixed(1)} km`;
    const sources = place.sources ?? [];
    const sourceLink = (id: string): string => {
      const source = sources.find((entry) => entry.id === id);
      if (!source || !/^https?:\/\//i.test(source.url)) return "";
      return `<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.title || source.attribution || source.id)}</a>`;
    };
    const summaryRefs = place.summarySourceIds.map(sourceLink).filter(Boolean);
    const dates = place.dates.map((date) => {
      const refs = date.sourceIds.map(sourceLink).filter(Boolean);
      return `<div class="history__date"><dt>${esc(date.label)}</dt><dd>${date.value ? esc(date.value) : `<span class="history__unknown">Not verified</span>`}${refs.length ? `<span class="history__refs">${refs.join(" · ")}</span>` : ""}</dd></div>`;
    }).join("");
    const sourceItems = sources.map((source) => {
      const validUrl = /^https?:\/\//i.test(source.url);
      const validLicense = /^https?:\/\//i.test(source.licenseUrl);
      const link = validUrl
        ? `<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.title || source.attribution)}</a>`
        : esc(source.title || source.attribution);
      const usage = source.usage === "discovery" ? "Discovery link, not an evidence source"
        : source.usage === "adapted-text" ? "Adapted text"
        : "Evidence";
      const license = source.provider === "wikipedia" && source.usage === "adapted-text"
        ? `CC BY-SA 4.0 (<a href="${wikipediaLicenseUrl}" target="_blank" rel="noopener">license</a>)`
        : validLicense ? `<a href="${esc(source.licenseUrl)}" target="_blank" rel="noopener">${esc(source.license || "License")}</a>` : esc(source.license || "License not specified");
      return `<li>${link}<span class="history__source-meta">${usage} · ${esc(source.attribution)} · ${license}</span></li>`;
    }).join("");
    return `<article class="history__place" data-history-place="${esc(place.id)}" tabindex="-1">
      <div class="history__place-heading">
        <div><h4>${esc(place.nameEn)}</h4><p lang="ja" class="history__ja">${esc(place.nameJa)}</p></div>
        <span class="history__distance">${esc(distance)} · straight-line</span>
      </div>
      <p class="history__kind">${kind}</p>
      <p class="history__summary">${esc(place.summary)}${summaryRefs.length ? ` <span class="history__refs">(${summaryRefs.join(" · ")})</span>` : ""}</p>
      ${dates ? `<dl class="history__dates">${dates}</dl>` : ""}
      <details class="history__sources"><summary>Sources and attribution</summary><ul>${sourceItems}</ul></details>
      <p class="history__verified">Sources checked ${esc(place.verifiedOn)}</p>
    </article>`;
  }

  private caveat(): string {
    return `<p class="history__caveat">A curated pilot, not a complete record. Distances are approximate, not walking routes; neighbourhood points are representative, not boundaries. This is nearby context, not the history of the shop or its building. PLATEAU physical-building facts are separate. No history is inferred from Google imagery. No historical images are reused.</p>`;
  }

  focusPlace(id: string): void {
    const article = Array.from(this.host.querySelectorAll<HTMLElement>("[data-history-place]"))
      .find(element => element.dataset.historyPlace === id);
    article?.scrollIntoView({ block: "nearest" });
    article?.focus({ preventScroll: true });
  }
}
