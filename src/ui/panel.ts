/** Sidebar (desktop) / bottom sheet (mobile): search, broth chips, cities, trail, shop list. */
import type { SortOrder } from "../discovery.ts";
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
  onSave(slug: string): void;
  onSavedOnly(savedOnly: boolean): void;
  onSort(sort: SortOrder): void;
  onReset(): void;
  onSurprise(): void;
}

export class Panel {
  private readonly list = $<HTMLUListElement>("#shop-list");
  private readonly count = $("#result-count");
  private readonly chips = $("#broth-chips");
  private readonly cities = $("#city-buttons");
  private readonly search = $<HTMLInputElement>("#shop-search");
  private readonly trail = $<HTMLButtonElement>("#trail-btn");
  private pageLimit = 100;
  private lastShops: readonly Shop[] = [];
  private lastSelected: string | null = null;
  private lastSaved: ReadonlySet<string> = new Set();
  private lastSavedOnly = false;

  constructor(allShops: readonly Shop[], handlers: PanelHandlers) {
    const coverage = document.createElement("p");
    coverage.className = "catalog-note";
    const openCount = allShops.filter(s => s.slug.startsWith("open-")).length;
    coverage.textContent = `${allShops.length.toLocaleString()} locations across Japan · ${openCount.toLocaleString()} open-data listings. Coverage and shop details are unverified. Choose All Japan to search nationwide.`;
    this.search.parentElement?.insertAdjacentElement("afterend", coverage);
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
        clearTimeout(timer);
        handlers.onQuery(this.search.value.trim());
        const first = this.list.querySelector<HTMLAnchorElement>(".shop-row");
        if (first?.dataset.slug) handlers.onSelect(first.dataset.slug);
      }
    });

    this.list.addEventListener("click", (e) => {
      if ((e.target as Element).closest("[data-load-more]")) {
        this.pageLimit += 100;
        this.drawList();
        return;
      }
      const save = (e.target as Element).closest<HTMLButtonElement>('[data-save]');
      if (save?.dataset.save) { handlers.onSave(save.dataset.save); return; }
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
    $('#explore-tab').addEventListener('click', () => handlers.onSavedOnly(false));
    $('#saved-tab').addEventListener('click', () => handlers.onSavedOnly(true));
    $('#clear-filters').addEventListener('click', () => { clearTimeout(timer); handlers.onReset(); });
    $('#surprise-btn').addEventListener('click', () => handlers.onSurprise());
    $<HTMLSelectElement>('#shop-sort').addEventListener('change', e => handlers.onSort((e.target as HTMLSelectElement).value as SortOrder));
  }

  renderList(shops: readonly Shop[], selected: string | null, saved: ReadonlySet<string>, savedOnly: boolean): void {
    if (shops.length !== this.lastShops.length || shops.some((s, i) => s.slug !== this.lastShops[i]?.slug)) this.pageLimit = 100;
    this.lastShops = shops; this.lastSelected = selected; this.lastSaved = saved; this.lastSavedOnly = savedOnly;
    this.drawList();
    $('#saved-count').textContent = String(saved.size);
    $('#saved-tab').setAttribute('aria-pressed', String(savedOnly));
    $('#explore-tab').setAttribute('aria-pressed', String(!savedOnly));
    $('#saved-note').hidden = !savedOnly;
    $<HTMLButtonElement>('#surprise-btn').disabled = !shops.length;
    this.count.textContent = resultCountText(shops.length);
  }

  private drawList(): void {
    const index = this.lastSelected ? this.lastShops.findIndex(s => s.slug === this.lastSelected) : -1;
    const selected = index >= this.pageLimit ? this.lastShops[index] : undefined;
    const ordered = selected ? [selected, ...this.lastShops.filter(s => s.slug !== selected.slug)] : this.lastShops;
    this.list.innerHTML = shopListHtml(ordered, this.lastSelected, this.lastSaved, this.lastSavedOnly, this.pageLimit);
  }

  setBrothPressed(pressed: ReadonlySet<BrothId>): void {
    $('#filter-count').textContent = pressed.size ? `${pressed.size} selected` : 'All styles';
    for (const chip of this.chips.querySelectorAll<HTMLButtonElement>(".chip")) {
      chip.setAttribute("aria-pressed", String(pressed.has(chip.dataset.broth as BrothId)));
    }
  }

  markSelected(slug: string | null): void {
    this.lastSelected = slug;
    if (slug && this.lastShops.findIndex(s => s.slug === slug) >= this.pageLimit) this.drawList();
    for (const row of this.list.querySelectorAll<HTMLAnchorElement>(".shop-row")) {
      row.closest('li')?.classList.toggle('is-selected', row.dataset.slug === slug);
      if (row.dataset.slug === slug) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    }
  }

  setCity(slug: string): void {
    for (const button of this.cities.querySelectorAll<HTMLButtonElement>('[data-city]')) {
      button.setAttribute('aria-pressed', String(button.dataset.city === slug));
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
