/** Sidebar (desktop) / bottom sheet (mobile): search, broth chips, cities, trail, shop list. */
import type { BrothId } from "../data/broths.ts";
import type { Shop } from "../data/shops.ts";
import { t } from "../i18n.ts";
import { brothChipsHtml, cityButtonsHtml, resultCountText, shopListHtml } from "../render/templates.ts";
import { $ } from "./dom.ts";
import { icon } from "./icons.ts";

export interface PanelHandlers {
  onQuery(query: string): void;
  onToggleBroth(broth: BrothId): void;
  onCity(citySlug: string | "all"): void;
  onSelect(slug: string): void;
  onTrail(): void;
}

export class Panel {
  private readonly list = $<HTMLUListElement>("#shop-list");
  private readonly count = $("#result-count");
  private readonly chips = $("#broth-chips");
  private readonly cities = $("#city-buttons");
  private readonly search = $<HTMLInputElement>("#shop-search");
  private readonly trail = $<HTMLButtonElement>("#trail-btn");

  constructor(allShops: readonly Shop[], handlers: PanelHandlers) {
    // Prerendered at build time; render here too so dev and prod behave the same.
    if (!this.chips.querySelector(".chip")) this.chips.innerHTML = brothChipsHtml(allShops);
    if (!this.cities.querySelector(".city-btn")) this.cities.innerHTML = cityButtonsHtml(allShops);

    let timer = 0;
    this.search.addEventListener("input", () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => handlers.onQuery(this.search.value.trim()), 80);
    });
    this.search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const first = this.list.querySelector<HTMLAnchorElement>(".shop-row");
        if (first?.dataset.slug) handlers.onSelect(first.dataset.slug);
      }
    });

    this.list.addEventListener("click", (e) => {
      const row = (e.target as Element).closest<HTMLAnchorElement>(".shop-row");
      if (!row?.dataset.slug) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let "open in new tab" work
      e.preventDefault();
      handlers.onSelect(row.dataset.slug);
    });

    this.chips.addEventListener("click", (e) => {
      const chip = (e.target as Element).closest<HTMLButtonElement>(".chip");
      if (chip?.dataset.broth) handlers.onToggleBroth(chip.dataset.broth as BrothId);
    });

    this.cities.addEventListener("click", (e) => {
      const btn = (e.target as Element).closest<HTMLButtonElement>(".city-btn");
      if (btn?.dataset.city) handlers.onCity(btn.dataset.city);
    });

    this.trail.addEventListener("click", () => handlers.onTrail());
  }

  renderList(shops: readonly Shop[], selected: string | null): void {
    this.list.innerHTML = shopListHtml(shops, selected);
    this.count.textContent = resultCountText(shops.length);
  }

  setBrothPressed(pressed: ReadonlySet<BrothId>): void {
    for (const chip of this.chips.querySelectorAll<HTMLButtonElement>(".chip")) {
      chip.setAttribute("aria-pressed", String(pressed.has(chip.dataset.broth as BrothId)));
    }
  }

  markSelected(slug: string | null): void {
    for (const row of this.list.querySelectorAll<HTMLAnchorElement>(".shop-row")) {
      if (row.dataset.slug === slug) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    }
  }

  focusRow(slug: string): void {
    this.list.querySelector<HTMLAnchorElement>(`.shop-row[data-slug="${CSS.escape(slug)}"]`)?.focus();
  }

  setTrailPlaying(playing: boolean): void {
    this.trail.setAttribute("aria-pressed", String(playing));
    $("#trail-icon").innerHTML = icon(playing ? "stop" : "play");
    $("#trail-title").textContent = playing ? t("trailStop") : t("trailTitle");
    $("#trail-sub").textContent = playing ? t("trailStopSub") : t("trailSub");
  }

  get searchInput(): HTMLInputElement {
    return this.search;
  }
}
