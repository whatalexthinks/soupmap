/**
 * App orchestration: UI state, deep links, and the lazily loaded 3D map.
 * The UI works on its own; the map attaches when its chunk arrives.
 */
import { discover, parseSaved, SAVED_KEY, type SortOrder } from "./discovery.ts";
import type { BrothId } from "./data/broths.ts";
import { CITIES, cityBySlug } from "./data/cities.ts";
import plateauData from "./data/plateau-tilesets.json" with { type: "json" };
import { ORDERED_SHOPS, shopBySlug, type Shop } from "./data/shops.ts";
import { TRAILS } from "./data/trails.ts";
import { STARTUP_CITY_SLUG, claimOpening } from "./startup.ts";
import { t } from "./i18n.ts";
import type { MapEngineImpl } from "./map/engine.ts";
import type { BuildingEvent, BuildingInfo, PlateauTilesetRef } from "./map/plateau.ts";
import { StreetView } from "./map/streetview.ts";
import { type CuisineId } from "./cuisines.ts";
import { displayName, restoreNameLanguage, getNameLanguage, setNameLanguage, type NameLanguage } from "./names.ts";
import { router } from "./router.ts";
import { TrailPlayer } from "./trail.ts";
import { BuildingPanel } from "./ui/building-panel.ts";
import { ShopCard } from "./ui/card.ts";
import { MapControls } from "./ui/controls.ts";
import { $, esc, isMobileLayout } from "./ui/dom.ts";
import { Loader, toast } from "./ui/feedback.ts";
import { Panel } from "./ui/panel.ts";
import { BottomSheet } from "./ui/sheet.ts";
import { SplatModal } from "./ui/splat-modal.ts";
import type { SharedShortlist } from "./shortlist.ts";

/** PLATEAU building tilesets by municipality code (from scripts/fetch-plateau-catalog.ts). */
const PLATEAU_INDEX: ReadonlyMap<string, PlateauTilesetRef> = new Map(
  (plateauData as { tilesets: PlateauTilesetRef[] }).tilesets.map((t) => [t.cityCode, t]),
);

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function afterFirstPaint(fn: () => void): void {
  requestAnimationFrame(() => setTimeout(fn, 0));
}

export class App {
  private query = "";
  private city: string = STARTUP_CITY_SLUG;
  private navigationRevision = 0;
  private sort: SortOrder = 'guide';
  private cuisine: CuisineId | 'all' = 'all';
  private origin: {lat:number;lng:number} | null = null;
  private locationRequest = 0;
  private savedOnly = false;
  private shared: SharedShortlist | null = null;
  private sharedActive = false;
  private sharedHash = '';
  private readonly saved = this.readSaved();
  private inspectBuildings = false;
  private autoBuildings = true;
  private aerialImagery = true;
  private buildingRequest = 0;
  private mapStarted = false;
  private readSaved(): Set<string> {
    try { return parseSaved(localStorage.getItem(SAVED_KEY), new Set(shopBySlug.keys())); }
    catch { return new Set(); }
  }
  private readonly broths = new Set<BrothId>();
  private selected: string | null = null;
  private engine: MapEngineImpl | null = null;
  private streetView: StreetView | null = null;
  private streetViewRequest = 0;
  private buildingInfo: BuildingInfo | null = null;
  private lowPower = false;
  private readonly googleKey = (import.meta.env?.VITE_GOOGLE_MAPS_KEY ?? "").trim();

  private readonly loader = new Loader();
  private readonly sheet = new BottomSheet();
  private readonly panel: Panel;
  private readonly card: ShopCard;
  private readonly controls: MapControls;
  private readonly buildingPanel: BuildingPanel;
  private readonly splat = new SplatModal();
  private readonly trail = new TrailPlayer({
    visit: (slug) => this.visitStop(slug),
    announce: (message) => toast(message, 2600),
    onChange: (playing) => this.panel.setTrailPlaying(playing),
    cancelFlight: () => this.engine?.cancelFlight(),
  });

  constructor() {
    $(".brand").addEventListener("click",event=>{
      if(event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      this.sharedActive = false;
      router.clearShortlist();
      this.resetFilters();
    });
    restoreNameLanguage();
    if (this.googleKey) this.streetView = new StreetView(this.googleKey);
    this.panel = new Panel(ORDERED_SHOPS, {
      onQuery: (q) => {
        this.trail.stop();
        this.query = q;
        this.refresh();
      },
      onToggleBroth: (id) => {
        this.trail.stop();
        if (this.broths.has(id)) this.broths.delete(id);
        else this.broths.add(id);
        this.panel.setBrothPressed(this.broths);
        this.refresh();
      },
      onCity: (slug) => this.jumpToCity(slug),
      onSelect: (slug) => {
        this.trail.stop();
        this.select(slug, { fly: true, focus: true });
      },
      onTrail: () => this.toggleTrail(),
      onSave: slug => this.toggleSaved(slug),
      onSavedOnly: savedOnly => {
        this.trail.stop();
        this.sharedActive = false;
        router.clearShortlist();
        this.savedOnly = savedOnly;
        this.resetFilters();
        this.closeCard();
        this.sheet.ensureOpen();
      },
      onShared: () => this.showShared(),
      onSort: sort => { void this.changeSort(sort); },
      onCuisine: cuisine => {
        this.trail.stop();
        this.cuisine = cuisine;
        this.refresh();
      },
      onNameLanguage: language => this.changeNameLanguage(language),
      onReset: () => this.resetFilters(),
      onSurprise: () => {
        const choices = this.filtered().filter(s => s.slug !== this.selected);
        const shop = choices[Math.floor(Math.random() * choices.length)] ?? this.filtered()[0];
        if (shop) { this.trail.stop(); this.select(shop.slug, { fly: true, focus: true }); }
      },
    });
    this.panel.setNameLanguage(getNameLanguage());

    this.card = new ShopCard({
      onSave: shop => this.toggleSaved(shop.slug),
      onClose: () => {
        this.trail.stop();
        this.closeCard();
      },
      onStandOutside: (shop) => void this.openStreetView(shop),
      onBuildingInfo: () => void this.toggleBuilding(),
      onStepInside: (shop) => {
        this.trail.stop();
        void this.splat.show(shop);
      },
      onCopyLink: (shop) => this.copyLink(shop),
    });

    this.controls = new MapControls({
      onOverview: () => this.jumpToCity('all'),
      onZoom: direction => this.engine?.zoom(direction),
      onTilt: () => this.engine?.togglePerspective(),
      onNorth: () => this.engine?.faceNorth(),
      onBuildingToggle: () => void this.toggleBuilding(),
      onFallbackStyle: style => {
        this.aerialImagery = style === 'photo';
        this.engine?.setFallbackStyle(style);
        this.buildingInfo?.setAerialImagery(this.aerialImagery);
      },
    });

    this.buildingPanel = new BuildingPanel({
      onClose: () => this.turnOffBuilding(),
      onDataView: () => {
        if (this.buildingInfo?.active) void this.buildingInfo.setDataView(!this.buildingInfo.isDataView);
      },
    });
  }

  start(): void {
    this.shared = router.shortlist();
    if (this.shared) this.sharedHash = location.hash;
    this.sharedActive = !!this.shared;
    if (this.shared) this.city = 'all';
    const initial = router.initial();
    if (initial && !this.shared) this.city = CITIES.find(c => c.name === shopBySlug.get(initial)?.city)?.slug ?? 'all';
    this.refresh();
    this.updateLocation();
    if (initial) this.select(initial, { fly: false, focus: false });
    if (this.shared) this.sheet.ensureOpen();
    router.onChange((slug) => {
      const shared = router.shortlist();
      if (shared) {
        this.shared = shared;
        this.sharedHash = location.hash;
        this.showShared(false);
      } else if (this.sharedActive) {
        this.sharedActive = false;
        this.resetFilters();
      }
      if (slug) this.select(slug, { fly: true, focus: false });
      else this.closeCard();
    });

    document.addEventListener("keydown", (e) => {
      const typing = (e.target as HTMLElement).matches('input, textarea, select, [contenteditable]');
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault(); this.closeCard(); this.panel.searchInput.focus();
      }
      if (e.key === "Escape" && !e.defaultPrevented) this.onEscape();
    });
    this.panel.searchInput.addEventListener("focus", () => this.sheet.ensureOpen());
    $("#pano-back").addEventListener("click", () => this.closeStreetView());
    window.addEventListener("soupmap:google-auth-error", () => {
      this.closeStreetView();
      this.card.setStreetView("unavailable", "Google denied the interactive viewer. Enable Maps JavaScript API on this project and key, check billing and website restrictions, then reload.");
      toast("Google denied interactive Street View. Check Maps JavaScript API access.", 5000);
    });
    window.addEventListener("soupmap:streetview-error", () => {
      const shop = this.card.current;
      this.closeStreetView();
      if (shop) this.card.setStreetView("unavailable", this.streetView?.unavailableReason(shop));
      toast("This panorama could not load. Try the Google Maps link.");
    });

    window.addEventListener('storage', e => {
      if (e.key !== SAVED_KEY && e.key !== null) return;
      const saved = this.readSaved();
      this.saved.clear(); saved.forEach(slug => this.saved.add(slug));
      this.refresh(); this.card.setSaved(!!this.selected && this.saved.has(this.selected));
    });
    afterFirstPaint(() => void this.loadMap());
  }

  private filtered(): readonly Shop[] {
    const source = this.sharedActive ? (this.shared?.ids ?? []).flatMap(id => {
      const shop = shopBySlug.get(id);
      return shop ? [shop] : [];
    }) : ORDERED_SHOPS;
    return discover(source, { query: this.query, city: this.city, sort: this.sort,
      broths: this.broths, savedOnly: this.savedOnly, saved: this.saved,
      cuisine: this.cuisine, origin: this.origin });
  }

  private refresh(): void {
    const shops = this.filtered();
    this.panel.setShared(this.shared, this.sharedActive);
    this.panel.renderList(shops, this.selected, this.saved, this.savedOnly);
    this.panel.setCity(this.city);
    this.panel.setCuisine(this.cuisine);
    $('#clear-filters').hidden = !this.query && !this.broths.size && this.city === 'all' && this.cuisine === 'all';
    this.engine?.setShops(shops);
    if (this.selected && !shops.some(shop => shop.slug === this.selected)) this.closeCard();
  }

  private showShared(updateUrl = true): void {
    if (!this.shared) return;
    if (updateUrl) history.replaceState(null, '', `${location.pathname}${location.search}${this.sharedHash}`);
    this.sharedActive = true;
    this.savedOnly = false;
    this.closeCard();
    this.resetFilters();
    this.sheet.ensureOpen();
  }

  private changeNameLanguage(language: NameLanguage): void {
    setNameLanguage(language);
    this.panel.setNameLanguage(language);
    this.refresh();
    this.engine?.pins.refreshNames();
    if (this.selected) this.select(this.selected, {fly:false, focus:false});
  }

  private async changeSort(sort: SortOrder): Promise<void> {
    const request = ++this.locationRequest;
    if (sort === "distance" && !this.origin) {
      this.panel.setSort(this.sort);
      if (!navigator.geolocation) {
        toast("Location is unavailable in this browser. Choose another sort.");
        return;
      }
      toast("Allow location access to sort the current results by distance.");
      try {
        const position = await new Promise<GeolocationPosition>((resolve,reject) =>
          navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:12000,maximumAge:300000,enableHighAccuracy:false}));
        if (request !== this.locationRequest) return;
        this.origin = {lat:position.coords.latitude,lng:position.coords.longitude};
      } catch {
        if (request === this.locationRequest) toast("Location was unavailable or not allowed. Your previous sort is unchanged.", 4000);
        return;
      }
    }
    if (request !== this.locationRequest) return;
    this.sort = sort;
    this.panel.setSort(sort);
    this.refresh();
  }

  private toggleSaved(slug: string): void {
    if (!shopBySlug.has(slug)) return;
    if (this.saved.has(slug)) this.saved.delete(slug); else this.saved.add(slug);
    let persistent = true;
    try { localStorage.setItem(SAVED_KEY, JSON.stringify([...this.saved])); }
    catch { persistent = false; }
    this.refresh();
    if (this.selected === slug) this.card.setSaved(this.saved.has(slug));
    const saveButton = [...document.querySelectorAll<HTMLButtonElement>('[data-save]')].find(b => b.dataset.save === slug);
    if (!document.body.classList.contains('has-card')) saveButton?.focus({ preventScroll: true });
    toast(persistent ? (this.saved.has(slug) ? 'Added to your saved places' : 'Removed from saved places') : 'Saved for this session. Browser storage is unavailable.');
  }

  private resetFilters(): void {
    ++this.navigationRevision;
    this.trail.stop();
    this.query = ''; this.city = 'all'; this.broths.clear(); this.cuisine = 'all';
    this.panel.searchInput.value = ''; this.panel.setBrothPressed(this.broths);
    this.refresh(); this.updateLocation();
    this.turnOffBuilding();
    void this.engine?.flyToOverview();
  }

  private updateLocation(): void {
    const city = cityBySlug.get(this.city);
    $('#map-city').textContent = city?.name ?? 'Earth';
    $('#map-city-ja').textContent = city?.nameJa ?? '';
    $('#map-coordinates').textContent = city
      ? `${Math.abs(city.lat).toFixed(4)}° ${city.lat < 0 ? 'S' : 'N'} · ${Math.abs(city.lng).toFixed(4)}° ${city.lng < 0 ? 'W' : 'E'}`
      : 'A WORLD OF SOUPS';
    $('#map-summary').textContent = this.sharedActive ? 'A shared soup shortlist · Save only the shops you want.'
      : this.savedOnly ? 'Your saved places, one bowl at a time.'
      : city ? `Japan pilot · ${city.slug === STARTUP_CITY_SLUG ? 'Tokyo test destination' : city.name}` : 'Worldwide atlas · Current listings: Japan pilot';
  }

  // ── Selection ────────────────────────────────────────────────────────────

  select(slug: string, options: { fly: boolean; focus: boolean }): void {
    ++this.navigationRevision;
    if (slug !== this.selected && (this.streetView?.isOpen || this.streetView?.isLoading)) this.closeStreetView();
    const shop = shopBySlug.get(slug);
    if (!shop) return;
    // Deep links and trail stops must remain visible in the current discovery state.
    if (!this.filtered().some(s => s.slug === slug)) {
      if (this.sharedActive && !this.shared?.ids.includes(slug)) {
        this.sharedActive = false;
        router.clearShortlist();
      }
      this.query = ''; this.broths.clear(); this.savedOnly = false; this.cuisine = 'all';
      this.city = CITIES.find(c => c.name === shop.city)?.slug ?? 'all';
      this.panel.searchInput.value = ''; this.panel.setBrothPressed(this.broths);
      this.refresh(); this.updateLocation();
    }
    this.selected = slug;
    this.sheet.setCovered(true);
    this.card.open(shop, { focus: options.focus, buildingAvailable: this.buildingAvailable(shop), saved: this.saved.has(shop.slug) });
    this.panel.markSelected(slug);
    router.set(slug);
    this.engine?.setSelected(slug);
    if (options.fly) void this.engine?.flyToShop(shop, { bottomInset: this.bottomInset() });
    void this.checkStreetView(shop);
    void this.syncBuilding(shop);
  }

  /** On phones the card covers the bottom of the map; frame shops above it. */
  private bottomInset(): number {
    if (!isMobileLayout() || !this.selected) return 0;
    const card = document.getElementById("card");
    const map = $('#map').getBoundingClientRect();
    const covered = card && !card.hidden ? map.bottom - card.getBoundingClientRect().top : 0;
    return Math.min(Math.max(covered / Math.max(map.height, 1), 0), 0.8);
  }

  closeCard(): void {
    if (this.streetView?.isOpen || this.streetView?.isLoading) this.closeStreetView();
    const previous = this.selected;
    const hadFocus = this.card.contains(document.activeElement);
    this.selected = null;
    this.card.close();
    this.sheet.setCovered(false);
    this.panel.markSelected(null);
    router.set(null);
    this.engine?.setSelected(null);
    if (previous && hadFocus) {
      if(isMobileLayout()) this.sheet.focusHandle();
      else this.panel.focusRow(previous);
    }
  }

  private onEscape(): void {
    if (this.splat.open) return; // the dialog handles its own Escape
    if (this.trail.playing) this.trail.stop();
    else if (this.streetView?.isOpen || this.streetView?.isLoading) this.closeStreetView();
    else if (this.buildingPanel.open) this.turnOffBuilding();
    else if (this.selected) this.closeCard();
  }

  private jumpToCity(slug: string): void {
    ++this.navigationRevision;
    this.trail.stop();
    this.city = slug;
    this.closeCard(); this.refresh(); this.updateLocation();
    if (isMobileLayout()) this.sheet.setSnap('peek');
    if (slug === 'all') {
      this.turnOffBuilding();
      void this.engine?.flyToOverview();
      return;
    }
    const city = cityBySlug.get(slug);
    if (city) void this.engine?.flyToCity(city);
    const anchor = ORDERED_SHOPS.find(shop => shop.city === city?.name && PLATEAU_INDEX.has(shop.cityCode));
    if (anchor && this.engine?.mode === 'fallback' && this.autoBuildings) void this.turnOnBuilding(anchor);
    else this.turnOffBuilding();
  }

  private async copyLink(shop: Shop): Promise<void> {
    try {
      await navigator.clipboard.writeText(router.shareUrl(shop.slug));
      toast(t("linkCopied"));
    } catch {
      toast(t("copyFailed"), 3500);
    }
  }

  // ── Broth trails ─────────────────────────────────────────────────────────

  private toggleTrail(): void {
    if (this.trail.playing) {
      this.trail.stop();
      return;
    }
    const trail = TRAILS[0];
    if (!trail) return;
    this.sharedActive = false;
    router.clearShortlist();
    // Show the trail's broth on the map while touring.
    this.query = "";
    this.savedOnly = false;
    this.city = 'fukuoka'; this.updateLocation();
    this.panel.searchInput.value = "";
    this.broths.clear();
    this.broths.add(trail.broth);
    this.panel.setBrothPressed(this.broths);
    this.refresh();
    if (isMobileLayout()) this.sheet.setSnap("peek");
    void this.trail.play(trail);
  }

  private async visitStop(slug: string): Promise<void> {
    const shop = shopBySlug.get(slug);
    if (!shop) return;
    this.select(slug, { fly: false, focus: false });
    await this.engine?.flyToShop(shop, { bottomInset: this.bottomInset() });
  }

  // ── Street View ("Stand outside") ────────────────────────────────────────

  private streetViewUsable(): boolean {
    return !!this.streetView;
  }

  /** Show "Stand outside" only if an outdoor panorama exists near the shop. */
  private async checkStreetView(shop: Shop): Promise<void> {
    if (!this.streetViewUsable() || !this.streetView) {
      this.card.setStreetView("unavailable", this.googleKey
        ? "Interactive Street View is unavailable. You can also open it in Google Maps."
        : "In-app Street View needs a Google Maps key. You can still open it in Google Maps.");
      return;
    }
    this.card.setStreetView("unknown");
    const info = await this.streetView.find(shop);
    if (this.card.current?.slug !== shop.slug) return;
    this.card.setStreetView(info ? "available" : "unavailable", this.streetView.unavailableReason(shop));
  }

  private async openStreetView(shop: Shop): Promise<void> {
    if (!this.streetViewUsable() || !this.streetView) return;
    const request = ++this.streetViewRequest;
    this.card.setStreetView("loading");
    const info = await this.streetView.open(shop);
    if (request !== this.streetViewRequest) return;
    if (this.card.current?.slug !== shop.slug) {
      this.streetView.close();
      return;
    }
    if (!info) {
      this.card.setStreetView("unavailable", this.streetView.unavailableReason(shop));
      toast(t("streetViewFailed"));
      return;
    }
    $("#pano-label").innerHTML = `<strong>Exploring near ${esc(displayName(shop))}</strong><span class="pano__hint">Arrows to move · Drag to look · +/− to zoom</span>`;
    $("#pano-bar").hidden = false;
    document.body.classList.add("is-pano");
    $("#pano-back").focus();
  }

  private closeStreetView(): void {
    if (!this.streetView) return;
    ++this.streetViewRequest;
    this.streetView.close();
    $("#pano-bar").hidden = true;
    document.body.classList.remove("is-pano");
    this.card.setStreetView("available");
    document.querySelector<HTMLButtonElement>('[data-action="stand-outside"]')?.focus();
  }

  // ── Building info (PLATEAU) ──────────────────────────────────────────────

  private buildingAvailable(shop: Shop): boolean {
    return !!this.engine && PLATEAU_INDEX.has(shop.cityCode);
  }

  private updateBuildingToggles(shop: Shop | undefined): void {
    const active = !!this.buildingInfo?.active;
    const available = shop ? this.buildingAvailable(shop) : ORDERED_SHOPS.some(s => s.city === cityBySlug.get(this.city)?.name && PLATEAU_INDEX.has(s.cityCode));
    this.card.setBuildingInfo(available, active);
    this.controls.setBuildingToggle(available || active, active);
  }

  /** Follow the selection: switch tileset when the shop is in another ward. */
  private async syncBuilding(shop: Shop): Promise<void> {
    this.updateBuildingToggles(shop);
    const info = this.buildingInfo;
    if (!info?.active) {
      if (this.engine?.mode === 'fallback' && this.autoBuildings && this.buildingAvailable(shop)) await this.turnOnBuilding(shop);
      return;
    }
    if (info.activeCityCode === shop.cityCode) return;
    if (this.buildingAvailable(shop)) await this.turnOnBuilding(shop);
    else {
      this.turnOffBuilding();
      this.controls.flash(t("buildingNone"));
    }
  }

  private async toggleBuilding(): Promise<void> {
    if (this.buildingInfo?.active) {
      this.autoBuildings = false;
      this.turnOffBuilding();
      return;
    }
    const shop = this.selected ? shopBySlug.get(this.selected) : ORDERED_SHOPS.find(s => s.city === cityBySlug.get(this.city)?.name && PLATEAU_INDEX.has(s.cityCode));
    this.autoBuildings = true;
    this.inspectBuildings = true;
    if (shop) await this.turnOnBuilding(shop);
  }

  private async turnOnBuilding(shop: Shop): Promise<void> {
    const engine = this.engine;
    if (!engine || !PLATEAU_INDEX.has(shop.cityCode)) return;
    const request = ++this.buildingRequest;
    if (!this.buildingInfo) {
      const { BuildingInfo } = await import("./map/plateau.ts");
      if (request !== this.buildingRequest) return;
      this.buildingInfo ??= new BuildingInfo(engine, PLATEAU_INDEX, this.lowPower, (e) => this.onBuildingEvent(e));
    }
    const city = CITIES.find((c) => c.name === shop.city);
    this.buildingInfo.setAerialImagery(this.aerialImagery);
    await this.buildingInfo.enable(shop.cityCode, city?.groundHeight ?? 40, { lat: shop.lat, lng: shop.lng });
  }

  private turnOffBuilding(): void {
    this.buildingRequest++;
    this.inspectBuildings = false;
    this.buildingInfo?.disable();
    this.buildingPanel.hide();
    this.updateBuildingToggles(this.selected ? shopBySlug.get(this.selected) : undefined);
  }

  private onBuildingEvent(event: BuildingEvent): void {
    const dataView = !!this.buildingInfo?.isDataView;
    switch (event.kind) {
      case "loading":
        if (!this.inspectBuildings) break;
        this.buildingPanel.show({ kind: "loading" }, dataView, this.engine?.mode === "google");
        break;
      case "ready":
        if (!this.inspectBuildings) break;
        this.buildingPanel.show({ kind: "hint" }, dataView, this.engine?.mode === "google");
        break;
      case "missed":
        if (!this.inspectBuildings) break;
        this.buildingPanel.show({ kind: "hint" }, dataView, this.engine?.mode === "google");
        break;
      case "picked":
        this.inspectBuildings = true;
        this.buildingPanel.show({ kind: "facts", facts: event.facts }, dataView, this.engine?.mode === "google");
        break;
      case "unavailable":
        this.buildingPanel.hide();
        this.controls.flash(t("buildingUnavailable"));
        break;
    }
    this.updateBuildingToggles(this.selected ? shopBySlug.get(this.selected) : undefined);
  }

  // ── Map ──────────────────────────────────────────────────────────────────

  private async loadMap(): Promise<void> {
    if (this.mapStarted) return;
    this.mapStarted = true;
    if (!webglAvailable()) {
      this.loader.fail(t("mapUnavailable"));
      return;
    }
    this.lowPower = matchMedia("(pointer: coarse)").matches || (navigator.hardwareConcurrency ?? 8) <= 4;
    const firstOpening=claimOpening();
    const initialShop=this.selected ? shopBySlug.get(this.selected) : undefined;
    const initialCity=cityBySlug.get(this.city);
    const playOpening=firstOpening && !initialShop && !!initialCity
      && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      window.CESIUM_BASE_URL = __CESIUM_BASE_URL__;
      const { createMapEngine } = await import("./map/engine.ts");
      const engine = await createMapEngine({
        container: $("#cesium"),
        creditViewport: $("#credit-viewport"),
        googleKey: this.googleKey,
        shops: ORDERED_SHOPS,
        initialShop,
        initialCity,
        playOpening,
        initialLocation: (this.selected ? shopBySlug.get(this.selected) : undefined)
          ?? cityBySlug.get(this.city) ?? cityBySlug.get(STARTUP_CITY_SLUG),
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        lowPower: this.lowPower,
        onStatus: status => {
          this.controls.setStatus(status);
          if(status.kind==="error") toast(status.message,8000);
          if (status.kind === 'ready' && status.mode === 'fallback' && this.engine && this.autoBuildings) {
            const anchor = this.selected ? shopBySlug.get(this.selected) : ORDERED_SHOPS.find(s => s.city === cityBySlug.get(this.city)?.name && PLATEAU_INDEX.has(s.cityCode));
            if (anchor) void this.turnOnBuilding(anchor);
          }
        },
      });
      this.engine = engine;
      this.controls.setEnabled(true);
      // ?debug exposes the engine for inspection in the console and in browser tests.
      if (new URLSearchParams(location.search).has("debug")) Object.assign(window, { soupmap: engine });
      this.trackCreditBar();
      engine.onShopPicked((slug) => this.select(slug, { fly: true, focus: false }));
      engine.onUserInteraction(() => {
        ++this.navigationRevision;
        this.trail.stop();
        if (isMobileLayout() && !this.selected) this.sheet.setSnap("peek");
      });
      engine.setShops(this.filtered());
      engine.setSelected(this.selected);
      this.loader.done();

      const shop = this.selected ? shopBySlug.get(this.selected) : undefined;
      if (shop) {
        void this.checkStreetView(shop);
        this.updateBuildingToggles(shop);
      }
      if (shop) {
        const revision = this.navigationRevision;
        await engine.flyToShop(shop, { duration: 0, bottomInset: this.bottomInset() });
        if (revision === this.navigationRevision) void this.syncBuilding(shop);
      } else {
        const city = cityBySlug.get(this.city);
        const revision = this.navigationRevision;
        if (city && playOpening) {
          $('#map-city').textContent = 'Earth';
          $('#map-city-ja').textContent = '';
          $('#map-coordinates').textContent = 'A WORLD OF SOUPS';
          $('#map-summary').textContent = `Flying to ${city.name}${city.slug === STARTUP_CITY_SLUG ? ' · test destination' : ''}`;
          await engine.playIntro(city);
          this.updateLocation();
        }
        else if(city) await engine.flyToCity(city,{duration:0});
        else await engine.flyToOverview({ duration: 0 });
        const anchor = ORDERED_SHOPS.find(s => s.city === city?.name && PLATEAU_INDEX.has(s.cityCode));
        if (revision === this.navigationRevision && anchor && engine.mode === 'fallback' && this.autoBuildings) void this.turnOnBuilding(anchor);
      }
    } catch (error) {
      console.warn("[soupmap] 3D map unavailable", error);
      this.loader.fail(t("mapUnavailable"));
    }
  }

  /** Keep panels clear of Cesium's credit bar so attribution is never covered. */
  private trackCreditBar(): void {
    const bar = document.querySelector<HTMLElement>(".cesium-viewer-bottom");
    if (!bar) return;
    const update = () => {
      const h = Math.ceil(bar.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--credit-h", `${Math.max(h, 26) + 4}px`);
    };
    new ResizeObserver(update).observe(bar);
    update();
  }
}
