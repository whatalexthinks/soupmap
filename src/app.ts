/**
 * App orchestration: UI state, deep links, and the lazily loaded 3D map.
 * The UI works on its own; the map attaches when its chunk arrives.
 */
import type { BrothId } from "./data/broths";
import { BROTHS } from "./data/broths";
import { CITIES, cityBySlug } from "./data/cities";
import { ORDERED_SHOPS, shopBySlug, type Shop } from "./data/shops";
import { t } from "./i18n";
import type { MapEngineImpl } from "./map/engine";
import type { StreetView } from "./map/streetview";
import type { MapEngine } from "./map/types";
import { router } from "./router";
import { ShopCard } from "./ui/card";
import { MapControls } from "./ui/controls";
import { $, esc, isMobileLayout } from "./ui/dom";
import { Loader, toast } from "./ui/feedback";
import { Panel } from "./ui/panel";
import { BottomSheet } from "./ui/sheet";

function matches(shop: Shop, query: string, broths: ReadonlySet<BrothId>): boolean {
  if (broths.size && !broths.has(shop.broth)) return false;
  if (!query) return true;
  const city = CITIES.find((c) => c.name === shop.city);
  const broth = BROTHS[shop.broth];
  const haystack = [shop.name, shop.nameJa, shop.city, city?.nameJa, shop.neighborhood, shop.signatureBowl, broth.label, broth.labelJa]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((term) => haystack.includes(term));
}

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
  private readonly broths = new Set<BrothId>();
  private selected: string | null = null;
  private engine: MapEngine | null = null;
  private engineImpl: MapEngineImpl | null = null;
  private streetView: StreetView | null = null;
  private readonly googleKey = (import.meta.env.VITE_GOOGLE_MAPS_KEY ?? "").trim();

  private readonly loader = new Loader();
  private readonly sheet = new BottomSheet();
  private readonly panel: Panel;
  private readonly card: ShopCard;
  private readonly controls: MapControls;

  constructor() {
    this.panel = new Panel(ORDERED_SHOPS, {
      onQuery: (q) => {
        this.query = q;
        this.refresh();
      },
      onToggleBroth: (id) => {
        if (this.broths.has(id)) this.broths.delete(id);
        else this.broths.add(id);
        this.panel.setBrothPressed(this.broths);
        this.refresh();
      },
      onCity: (slug) => this.jumpToCity(slug),
      onSelect: (slug) => this.select(slug, { fly: true, focus: true }),
      onTrail: () => undefined,
    });

    this.card = new ShopCard({
      onClose: () => this.closeCard(),
      onStandOutside: (shop) => void this.openStreetView(shop),
      onBuildingInfo: () => undefined,
      onStepInside: () => undefined,
      onCopyLink: (shop) => this.copyLink(shop),
    });

    this.controls = new MapControls({
      onOverview: () => void this.engine?.flyToOverview(),
      onBuildingToggle: () => undefined,
      onFallbackStyle: (style) => this.engine?.setFallbackStyle(style),
    });
  }

  start(): void {
    this.refresh();
    const initial = router.initial();
    if (initial) this.select(initial, { fly: false, focus: false });
    router.onChange((slug) => (slug ? this.select(slug, { fly: true, focus: false }) : this.closeCard()));

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !e.defaultPrevented) this.onEscape();
    });
    this.panel.searchInput.addEventListener("focus", () => this.sheet.ensureOpen());
    $("#pano-back").addEventListener("click", () => this.closeStreetView());

    afterFirstPaint(() => void this.loadMap());
  }

  private filtered(): readonly Shop[] {
    return ORDERED_SHOPS.filter((s) => matches(s, this.query, this.broths));
  }

  private refresh(): void {
    const shops = this.filtered();
    this.panel.renderList(shops, this.selected);
    this.engine?.setShops(shops);
  }

  // ── Selection ────────────────────────────────────────────────────────────

  select(slug: string, options: { fly: boolean; focus: boolean }): void {
    const shop = shopBySlug.get(slug);
    if (!shop) return;
    this.selected = slug;
    this.card.open(shop, { focus: options.focus, buildingAvailable: false });
    this.panel.markSelected(slug);
    router.set(slug);
    this.engine?.setSelected(slug);
    if (options.fly) void this.engine?.flyToShop(shop, { bottomInset: this.bottomInset() });
    void this.checkStreetView(shop);
  }

  /** On phones the card covers the bottom of the map; frame shops above it. */
  private bottomInset(): number {
    if (!isMobileLayout() || !this.selected) return 0;
    const card = document.getElementById("card");
    const covered = card && !card.hidden ? window.innerHeight - card.getBoundingClientRect().top : 0;
    return Math.min(Math.max(covered / window.innerHeight, 0), 0.8);
  }

  closeCard(): void {
    const previous = this.selected;
    const hadFocus = this.card.contains(document.activeElement);
    this.selected = null;
    this.card.close();
    this.panel.markSelected(null);
    router.set(null);
    this.engine?.setSelected(null);
    if (previous && hadFocus) this.panel.focusRow(previous);
  }

  private onEscape(): void {
    if (this.streetView?.isOpen) this.closeStreetView();
    else if (this.selected) this.closeCard();
  }

  private jumpToCity(slug: string): void {
    if (isMobileLayout()) this.sheet.setSnap("peek");
    if (slug === "all") {
      void this.engine?.flyToOverview();
      return;
    }
    const city = cityBySlug.get(slug);
    if (city) void this.engine?.flyToCity(city);
  }

  private async copyLink(shop: Shop): Promise<void> {
    try {
      await navigator.clipboard.writeText(router.shareUrl(shop.slug));
      toast(t("linkCopied"));
    } catch {
      toast(t("copyFailed"), 3500);
    }
  }

  // ── Street View ("Stand outside") ────────────────────────────────────────

  private streetViewUsable(): boolean {
    return !!this.streetView && this.engine?.mode === "google";
  }

  /** Show "Stand outside" only if an outdoor panorama exists near the shop. */
  private async checkStreetView(shop: Shop): Promise<void> {
    if (!this.streetViewUsable() || !this.streetView) {
      this.card.setStreetView("unavailable");
      return;
    }
    this.card.setStreetView("unknown");
    const info = await this.streetView.find(shop);
    if (this.card.current?.slug !== shop.slug) return;
    this.card.setStreetView(info ? "available" : "unavailable");
  }

  private async openStreetView(shop: Shop): Promise<void> {
    if (!this.streetViewUsable() || !this.streetView) return;
    this.card.setStreetView("loading");
    const info = await this.streetView.open(shop);
    if (!info) {
      this.card.setStreetView("unavailable");
      toast(t("streetViewFailed"));
      return;
    }
    const date = info.date ? ` · ${esc(info.date)}` : "";
    $("#pano-label").innerHTML = `<strong>${esc(t("streetViewOf", { name: shop.name }))}</strong> · ${esc(info.copyright)}${date}`;
    $("#pano-bar").hidden = false;
    document.body.classList.add("is-pano");
    $("#pano-back").focus();
  }

  private closeStreetView(): void {
    if (!this.streetView?.isOpen) return;
    this.streetView.close();
    $("#pano-bar").hidden = true;
    document.body.classList.remove("is-pano");
    this.card.setStreetView("available");
    document.querySelector<HTMLButtonElement>('[data-action="stand-outside"]')?.focus();
  }

  // ── Map ──────────────────────────────────────────────────────────────────

  private async loadMap(): Promise<void> {
    if (!webglAvailable()) {
      this.loader.fail(t("mapUnavailable"));
      return;
    }
    try {
      window.CESIUM_BASE_URL = __CESIUM_BASE_URL__;
      const { createMapEngine } = await import("./map/engine");
      const engine = await createMapEngine({
        container: $("#cesium"),
        creditViewport: $("#credit-viewport"),
        googleKey: this.googleKey,
        shops: ORDERED_SHOPS,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        lowPower: matchMedia("(pointer: coarse)").matches || (navigator.hardwareConcurrency ?? 8) <= 4,
        onStatus: (status) => this.controls.setStatus(status),
      });
      this.engine = engine;
      this.engineImpl = engine;
      this.trackCreditBar();
      if (this.googleKey && engine.mode === "google") {
        const { StreetView } = await import("./map/streetview");
        this.streetView = new StreetView(engine, this.googleKey);
      }
      engine.onShopPicked((slug) => this.select(slug, { fly: true, focus: false }));
      engine.onUserInteraction(() => {
        if (isMobileLayout() && !this.selected) this.sheet.setSnap("peek");
      });
      engine.setShops(this.filtered());
      engine.setSelected(this.selected);
      this.loader.done();

      const shop = this.selected ? shopBySlug.get(this.selected) : undefined;
      if (shop) void this.checkStreetView(shop);
      if (shop) {
        await engine.flyToOverview({ duration: 0 });
        await engine.flyToShop(shop, { bottomInset: this.bottomInset() });
      } else {
        await this.playIntro(engine);
      }
    } catch (error) {
      console.warn("[soupmap] 3D map unavailable", error);
      this.loader.fail(t("mapUnavailable"));
    }
  }

  /** Intro flyover, skippable on any interaction. */
  private async playIntro(engine: MapEngine): Promise<void> {
    const events = ["pointerdown", "wheel", "keydown", "touchstart"] as const;
    const skip = () => engine.cancelFlight();
    for (const type of events) window.addEventListener(type, skip, { capture: true, passive: true, once: true });
    await engine.playIntro();
    for (const type of events) window.removeEventListener(type, skip, { capture: true });
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
