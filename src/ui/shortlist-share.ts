import type { Shop } from "../data/shops.ts";
import { displayName, type NameLanguage } from "../names.ts";
import { esc } from "./dom.ts";
import { SHORTLIST_LIMIT } from "../shortlist.ts";

const PAGE_SIZE = 100;
const MAX_SELECTION = SHORTLIST_LIMIT;

export class ShortlistShare {
  private readonly host: HTMLElement;
  private readonly onGenerate: (ids: readonly string[]) => string;
  private candidates: readonly Shop[] = [];
  private saved: ReadonlySet<string> = new Set();
  private selected = new Set<string>();
  private language: NameLanguage = "en";
  private page = 0;
  private generatedUrl = "";
  private previousFocus: HTMLElement | null = null;
  private openState = false;

  constructor(host: HTMLElement, onGenerate: (ids: readonly string[]) => string) {
    this.host = host;
    this.onGenerate = onGenerate;
    this.host.hidden = true;
    this.host.addEventListener("click", (event) => this.handleClick(event));
    this.host.addEventListener("change", (event) => this.handleChange(event));
    this.host.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.openState) {
        event.preventDefault();
        this.close();
      }
    });
  }

  open(shops: readonly Shop[]): void {
    if (!this.openState) {
      this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    this.openState = true;
    this.host.hidden = false;
    this.candidates = shops.filter(shop => this.saved.has(shop.slug));
    this.selected.clear();
    this.page = 0;
    this.generatedUrl = "";
    this.render();
    this.host.querySelector<HTMLButtonElement>("[data-shortlist-close]")?.focus();
  }

  setNameLanguage(language: NameLanguage): void {
    this.language = language;
    if (this.openState) this.render();
  }

  updateSaved(saved: ReadonlySet<string>): void {
    if (saved.size === this.saved.size && [...saved].every(id => this.saved.has(id))) return;
    this.saved = new Set(saved);
    this.candidates = this.candidates.filter(shop => saved.has(shop.slug));
    for (const id of this.selected) {
      if (!saved.has(id) || !this.candidates.some(shop => shop.slug === id)) this.selected.delete(id);
    }
    this.invalidateUrl();
    if (this.openState) this.render();
  }

  private handleClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-shortlist-close]")) {
      this.close();
      return;
    }
    if (target.closest("[data-shortlist-generate]")) {
      this.generate();
      return;
    }
    if (target.closest("[data-shortlist-copy]")) void this.copyUrl();
    if (target.closest("[data-shortlist-prev]") && this.page > 0) {
      this.page--;
      this.render();
      this.host.querySelector<HTMLButtonElement>("[data-shortlist-prev]")?.focus();
      return;
    }
    if (target.closest("[data-shortlist-next]") && (this.page + 1) * PAGE_SIZE < this.candidates.length) {
      this.page++;
      this.render();
      this.host.querySelector<HTMLButtonElement>("[data-shortlist-next]")?.focus();
    }
  }

  private handleChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches("[data-shortlist-shop]")) return;
    const id = target.value;
    if (target.checked) {
      if (this.selected.size >= MAX_SELECTION) {
        target.checked = false;
        this.setStatus(`You can select up to ${MAX_SELECTION} shops.`);
        return;
      }
      this.selected.add(id);
    } else {
      this.selected.delete(id);
    }
    this.invalidateUrl();
    this.render();
    this.host.querySelector<HTMLInputElement>(`[data-shortlist-shop][value="${CSS.escape(id)}"]`)?.focus();
  }

  private generate(): void {
    if (this.selected.size < 1 || this.selected.size > MAX_SELECTION) return;
    try {
      const url = this.onGenerate([...this.selected]);
      if (!url) throw new Error("A link could not be created. Please try again.");
      this.generatedUrl = url;
      this.render();
      this.setStatus("Your shortlist link is ready.");
      this.host.querySelector<HTMLInputElement>("[data-shortlist-url]")?.focus();
      this.host.querySelector<HTMLInputElement>("[data-shortlist-url]")?.select();
    } catch (error) {
      this.generatedUrl = "";
      this.render();
      this.setStatus(error instanceof Error ? error.message : "A link could not be created. Please try again.", true);
    }
  }

  private async copyUrl(): Promise<void> {
    const input = this.host.querySelector<HTMLInputElement>("[data-shortlist-url]");
    if (!input || !this.generatedUrl) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access unavailable");
      await navigator.clipboard.writeText(this.generatedUrl);
      this.setStatus("Link copied to clipboard.");
    } catch {
      input.focus();
      input.select();
      this.setStatus("Copy wasn’t available. The link is selected—copy it manually with your keyboard.", true);
    }
  }

  private close(): void {
    this.openState = false;
    this.generatedUrl = "";
    this.host.hidden = true;
    this.host.replaceChildren();
    this.previousFocus?.focus();
    this.previousFocus = null;
  }

  private invalidateUrl(): void {
    this.generatedUrl = "";
  }

  private setStatus(message: string, isError = false): void {
    const status = this.host.querySelector<HTMLElement>("[data-shortlist-status]");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("shortlist-share__status--error", isError);
    status.classList.toggle("shortlist-share__status--success", !isError && !!message);
  }

  private render(): void {
    const pageCount = Math.max(1, Math.ceil(this.candidates.length / PAGE_SIZE));
    this.page = Math.min(this.page, pageCount - 1);
    const visible = this.candidates.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE);
    const otherLanguage: NameLanguage = this.language === "en" ? "ja" : "en";
    const rows = visible.map(shop => {
      const primary = displayName(shop, this.language);
      const secondary = displayName(shop, otherLanguage);
      const checked = this.selected.has(shop.slug);
      const disabled = !checked && this.selected.size >= MAX_SELECTION;
      return `<label class="shortlist-share__shop${checked ? " is-selected" : ""}">
        <input type="checkbox" data-shortlist-shop value="${esc(shop.slug)}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
        <span class="shortlist-share__shop-names">
          <span class="shortlist-share__primary">${esc(primary)}</span>
          ${secondary && secondary !== primary ? `<span class="shortlist-share__secondary" lang="${otherLanguage}">${esc(secondary)}</span>` : ""}
        </span>
      </label>`;
    }).join("");

    this.host.innerHTML = `<section class="shortlist-share" role="region" aria-labelledby="shortlist-share-title">
      <header class="shortlist-share__header">
        <div>
          <p class="shortlist-share__eyebrow">SOUPMAP · SAVED PLACES</p>
          <h2 id="shortlist-share-title">Make a shortlist</h2>
          <p class="shortlist-share__intro">Choose up to 20 saved soup shops. Anyone with the link can view this snapshot. Later changes to your saves will not update or revoke it.</p>
        </div>
        <button class="shortlist-share__close" type="button" data-shortlist-close aria-label="Close shortlist selection">Close</button>
      </header>
      <div class="shortlist-share__summary">
        <strong><span data-shortlist-count>${this.selected.size}</span> / ${MAX_SELECTION}</strong>
        <span>selected</span>
        <span class="shortlist-share__saved-count">${this.candidates.length} saved ${this.candidates.length === 1 ? "shop" : "shops"}</span>
      </div>
      <fieldset class="shortlist-share__list">
        <legend class="sr-only">Saved soup shops</legend>
        ${rows || `<div class="shortlist-share__empty"><strong>No saved shops yet</strong><span>Save a few places in Soupmap, then come back to build a shortlist.</span></div>`}
      </fieldset>
      <nav class="shortlist-share__pagination" aria-label="Shortlist pages">
        <button type="button" data-shortlist-prev ${this.page === 0 ? "disabled" : ""}>Previous</button>
        <span>Page ${this.page + 1} of ${pageCount}</span>
        <button type="button" data-shortlist-next ${this.page + 1 >= pageCount ? "disabled" : ""}>Next</button>
      </nav>
      <div class="shortlist-share__actions">
        <button class="shortlist-share__generate" type="button" data-shortlist-generate ${this.selected.size === 0 ? "disabled" : ""}>Generate link</button>
        <button class="shortlist-share__cancel" type="button" data-shortlist-close>Cancel</button>
      </div>
      <div class="shortlist-share__link-area">
        <label for="shortlist-share-url">Generated link</label>
        <div class="shortlist-share__link-row">
          <input id="shortlist-share-url" data-shortlist-url type="text" readonly value="${esc(this.generatedUrl)}" placeholder="Your link will appear here">
          <button type="button" data-shortlist-copy ${this.generatedUrl ? "" : "disabled"}>Copy</button>
        </div>
      </div>
      <p class="shortlist-share__status" data-shortlist-status role="status" aria-live="polite"></p>
    </section>`;
  }
}
