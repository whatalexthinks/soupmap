/** Sidebar (desktop) / bottom sheet (mobile): search, broth chips, cities, trail, shop list. */
import type { SortOrder } from "../discovery.ts";
import type { BrothId } from "../data/broths.ts";
import type { Shop } from "../data/shops.ts";
import type { CuisineId } from "../cuisines.ts";
import { getNameLanguage, type NameLanguage } from "../names.ts";
import { t } from "../i18n.ts";
import { brothChipsHtml, cityButtonsHtml, resultCountText, shopListHtml } from "../render/templates.ts";
import { $ } from "./dom.ts";
import { icon } from "./icons.ts";
import { ShortlistShare } from "./shortlist-share.ts";
import { router } from "../router.ts";
import type { SharedShortlist } from "../shortlist.ts";

export interface PanelHandlers {
  onQuery(query: string): void;
  onToggleBroth(broth: BrothId): void;
  onCity(citySlug: string | "all"): void;
  onSelect(slug: string): void;
  onTrail(): void;
  onSave(slug: string): void;
  onSavedOnly(savedOnly: boolean): void;
  onShared(): void;
  onSort(sort: SortOrder): void;
  onCuisine(cuisine: CuisineId | "all"): void;
  onNameLanguage(language: NameLanguage): void;
  onHideChains(hide: boolean): void;
  onReset(): void;
  onSurprise(): void;
}

export class Panel {
  private readonly list = $<HTMLUListElement>("#shop-list");
  private readonly count = $("#result-count");
  private readonly chips = $("#broth-chips");
  private readonly cities = $("#city-buttons");
  private readonly search = $<HTMLInputElement>("#shop-search");
  private readonly cuisine = $<HTMLSelectElement>("#cuisine-filter");
  private readonly nameLanguage = $<HTMLSelectElement>("#name-language");
  private readonly sort = $<HTMLSelectElement>("#shop-sort");
  private readonly hideChains = $<HTMLInputElement>("#hide-chains");
  private readonly trail = $<HTMLButtonElement>("#trail-btn");
  private pageLimit = 100;
  private lastShops: readonly Shop[] = [];
  private lastSelected: string | null = null;
  private lastSaved: ReadonlySet<string> = new Set();
  private lastSavedOnly = false;
  private currentNameLanguage: NameLanguage = getNameLanguage();
  private readonly share: ShortlistShare;
  private readonly sharedTab: HTMLButtonElement;
  private sharedActive = false;

  constructor(allShops: readonly Shop[], handlers: PanelHandlers) {
    this.share = new ShortlistShare($('#shortlist-share'), ids => router.shortlistUrl(ids));
    this.sharedTab = document.createElement('button');
    this.sharedTab.type = 'button';
    this.sharedTab.id = 'shared-tab';
    this.sharedTab.textContent = 'Shared list';
    this.sharedTab.hidden = true;
    this.sharedTab.setAttribute('aria-pressed', 'false');
    $('#saved-tab').after(this.sharedTab);
    this.sharedTab.addEventListener('click', () => handlers.onShared());
    $('#share-shortlist').addEventListener('click', () => {
      $('#share-shortlist').focus();
      this.share.open(allShops.filter(s => this.lastSaved.has(s.slug)));
    });
    const coverage = document.createElement("p");
    coverage.className = "catalog-note";
    const openCount = allShops.filter(s => s.slug.startsWith("open-")).length;
    coverage.textContent = `Japan pilot · ${allShops.length.toLocaleString()} mapped locations, including ${openCount.toLocaleString()} open-data listings. Coverage and details are unverified. English names where available; generated romanization otherwise. Some names remain Japanese.`;
    $("#panel-body").insertBefore(coverage, $("#panel-body").firstElementChild);
    // Prerendered at build time; render here too so dev and prod behave the same.
    if (!this.chips.querySelector(".chip")) this.chips.innerHTML = brothChipsHtml(allShops);
    if (!this.cities.querySelector(".city-btn")) this.cities.innerHTML = cityButtonsHtml(allShops);
    this.nameLanguage.value = this.currentNameLanguage;

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
      const btn = (e.target as Element).closest<HTMLAnchorElement>(".city-btn");
      if (!btn?.dataset.city || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      handlers.onCity(btn.dataset.city);
    });

    this.trail.addEventListener("click", () => handlers.onTrail());
    $('#explore-tab').addEventListener('click', () => handlers.onSavedOnly(false));
    $('#saved-tab').addEventListener('click', () => handlers.onSavedOnly(true));
    $('#clear-filters').addEventListener('click', () => { clearTimeout(timer); handlers.onReset(); });
    $('#surprise-btn').addEventListener('click', () => handlers.onSurprise());
    this.sort.addEventListener('change', e => handlers.onSort((e.target as HTMLSelectElement).value as SortOrder));
    this.cuisine.addEventListener("change", () => handlers.onCuisine(this.cuisine.value as CuisineId | "all"));
    this.nameLanguage.addEventListener("change", () => handlers.onNameLanguage(this.nameLanguage.value as NameLanguage));
    this.hideChains.addEventListener("change", () => handlers.onHideChains(this.hideChains.checked));
  }

  renderList(shops: readonly Shop[], selected: string | null, saved: ReadonlySet<string>, savedOnly: boolean): void {
    if (shops.length !== this.lastShops.length || shops.some((s, i) => s.slug !== this.lastShops[i]?.slug)) this.pageLimit = 100;
    this.lastShops = shops; this.lastSelected = selected; this.lastSaved = saved; this.lastSavedOnly = savedOnly;
    this.drawList();
    $('#saved-count').textContent = String(saved.size);
    $('#saved-tab').setAttribute('aria-pressed', String(savedOnly));
    $('#explore-tab').setAttribute('aria-pressed', String(!savedOnly && !this.sharedActive));
    $('#saved-note').hidden = !savedOnly;
    $('#share-shortlist').hidden = !savedOnly;
    $<HTMLButtonElement>('#share-shortlist').disabled = !saved.size;
    this.share.updateSaved(saved);
    if (!savedOnly) $('#shortlist-share').hidden = true;
    $<HTMLButtonElement>('#surprise-btn').disabled = !shops.length;
    this.count.textContent = resultCountText(shops.length);
  }

  private drawList(): void {
    const index = this.lastSelected ? this.lastShops.findIndex(s => s.slug === this.lastSelected) : -1;
    const selected = index >= this.pageLimit ? this.lastShops[index] : undefined;
    const ordered = selected ? [selected, ...this.lastShops.filter(s => s.slug !== selected.slug)] : this.lastShops;
    this.list.innerHTML = shopListHtml(ordered, this.lastSelected, this.lastSaved, this.lastSavedOnly, this.pageLimit, this.currentNameLanguage);
    if (this.sharedActive && !ordered.length) {
      this.list.innerHTML = '<li class="empty-state">No available shops match this shared list. Check the link notice above or reset your filters.</li>';
    }
    if (this.sharedActive && location.hash.startsWith('#shortlist=')) {
      for (const row of this.list.querySelectorAll<HTMLAnchorElement>('.shop-row')) {
        const params = new URLSearchParams(location.hash.slice(1));
        params.set('shop', row.dataset.slug!);
        row.href = `#${params}`;
      }
    }
  }

  setShared(shared: SharedShortlist | null, active: boolean): void {
    this.sharedActive = active;
    this.sharedTab.hidden = !shared;
    this.sharedTab.setAttribute('aria-pressed', String(active));
    $('#shared-shortlist').hidden = !active;
    $('#shared-note').textContent = shared?.error ?? (shared
      ? `${shared.ids.length} available shops. ${shared.missing ? `${shared.missing} shops are no longer available. ` : ''}Save shops individually to your own places; your existing saves stay unchanged.`
      : '');
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
    for (const link of this.cities.querySelectorAll<HTMLAnchorElement>('[data-city]')) {
      if (link.dataset.city === slug) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  }

  setCuisine(cuisine: CuisineId | "all"): void {
    this.cuisine.value = cuisine;
  }

  setHideChains(hide: boolean): void {
    this.hideChains.checked = hide;
  }

  setNameLanguage(language: NameLanguage): void {
    this.currentNameLanguage = language;
    this.nameLanguage.value = language;
    this.share.setNameLanguage(language);
    this.drawList();
  }

  setSort(sort: SortOrder): void {
    this.sort.value = sort;
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
