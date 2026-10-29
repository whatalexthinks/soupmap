/**
 * The 3D map. Loaded lazily after first paint (see main.ts).
 *
 * Primary layer: Google Photorealistic 3D Tiles, streamed only (never cached,
 * proxied or modified), with Google's attribution left exactly as CesiumJS renders it.
 * Fallback: the Cesium globe with GSI aerial photos (or the GSI standard map),
 * used when there's no key or Google tiles fail. Never a blank screen.
 */
import "cesium/Build/Cesium/Widgets/widgets.css";
import "../styles/map-polish.css";
import {
  Color,
  Cartesian2 as ScreenPoint,
  Cartesian3,
  BoundingSphere,
  HeadingPitchRange,
  Math as CesiumMath,
  Credit,
  CustomHeightmapTerrainProvider,
  EllipsoidTerrainProvider,
  GoogleMaps,
  HeightReference,
  ImageryLayer,
  Rectangle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  TileMapServiceImageryProvider,
  UrlTemplateImageryProvider,
  Viewer,
  createGooglePhotorealistic3DTileset,
  buildModuleUrl,
  defined,
  type Cartesian2,
  type Cesium3DTileset,
} from "cesium";
import type { City } from "../data/cities.ts";
import type { Shop } from "../data/shops.ts";
import { creditHtml, getSource } from "../sources.ts";
import { CameraDirector } from "./camera.ts";
import { citySurfaceActive, movingScreenSpaceError, renderBudget, renderPixelRatio } from "./render-policy.ts";
import { PinLayer, type PickId } from "./pins.ts";
import type { EngineStatus, FallbackStyle, FlyOptions, MapEngine, MapHover, MapMode } from "./types.ts";

export interface EngineOptions {
  container: HTMLElement;
  /** Where Cesium puts its credit lightbox, so it layers above our panels. */
  creditViewport: HTMLElement;
  googleKey: string;
  shops: readonly Shop[];
  initialVisibleShops?: readonly Shop[];
  initialLocation?: {lat:number;lng:number};
  initialCity?: City;
  initialShop?: Shop;
  playOpening: boolean;
  reducedMotion: boolean;
  /** Phones and low-end devices: fewer, coarser tiles. */
  lowPower: boolean;
  onStatus: (status: EngineStatus) => void;
}

/** Japan, generously: fallback imagery is requested only inside this box. */
const JAPAN = Rectangle.fromDegrees(122, 20, 154, 46.5);
const GOOGLE_TIMEOUT_MS = 12_000;

/** A map click that a feature module (e.g. PLATEAU) may claim. Return true to consume it. */
export type MapClickHandler = (picked: unknown, position: Cartesian2) => boolean;

function timeout<T extends { destroy(): void }>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; reject(new Error(`${label} timed out after ${ms} ms`)); }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        if (timedOut) value.destroy(); else resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function gsiProvider(style: FallbackStyle): UrlTemplateImageryProvider {
  const id = style === "photo" ? "gsi-seamlessphoto" : "gsi-std";
  const provider = new UrlTemplateImageryProvider({
    url: getSource(id).endpoints?.[0] ?? "",
    minimumLevel: style === "photo" ? 2 : 5,
    maximumLevel: 18,
    rectangle: JAPAN,
    credit: new Credit(creditHtml(id), true),
  });
  // Missing tiles (open sea, edges) are expected. A listener keeps Cesium from logging each one.
  provider.errorEvent.addEventListener(() => undefined);
  return provider;
}

export class MapEngineImpl implements MapEngine {
  readonly viewer: Viewer;
  readonly pins: PinLayer;
  readonly director: CameraDirector;
  private googleSurfaceReady = false;
  private citySurface = false;
  private graphicsLost = false;
  private cameraMoving = false;
  googleTileset: Cesium3DTileset | undefined;

  private _mode: MapMode = "google";
  private fallbackStyle: FallbackStyle = "photo";
  private fallbackLayer: ImageryLayer | undefined;
  private flatGround: number | null = null;
  private readonly pickHandlers: Array<(slug: string) => void> = [];
  private readonly hoverHandlers: Array<(hover: MapHover | null) => void> = [];
  private readonly interactionHandlers: Array<() => void> = [];
  private readonly clickHandlers: MapClickHandler[] = [];

  constructor(private readonly options: EngineOptions) {
    this.viewer = new Viewer(options.container, {
      baseLayer: false,
      geocoder: false,
      baseLayerPicker: false,
      timeline: false,
      animation: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      scene3DOnly: true,
      // Render only when something changes: saves battery on phones.
      requestRenderMode: true,
      maximumRenderTimeChange: Number.POSITIVE_INFINITY,
      useBrowserRecommendedResolution: false,
      msaaSamples: options.lowPower ? 1 : 4,
      creditViewport: options.creditViewport,
    });
    // Cesium's default backing buffer is 1× CSS pixels, which softens text and
    // billboards on retina displays. Cap the multiplier to keep mobile GPUs cool.
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    this.viewer.resolutionScale = renderPixelRatio(options.lowPower, true, Infinity, dpr) / dpr;
    this.viewer.targetFrameRate = options.lowPower ? 30 : 60;

    const scene = this.viewer.scene;
    if (options.lowPower) {
      scene.highDynamicRange = false;
      scene.postProcessStages.fxaa.enabled = false;
    }
    scene.globe.baseColor = Color.fromCssColorString("#dfe3d8");
    scene.backgroundColor = Color.fromCssColorString("#cdd8ce");
    scene.globe.maximumScreenSpaceError = options.lowPower ? 3 : 2;
    const controller = scene.screenSpaceCameraController;
    controller.minimumZoomDistance = 25;
    controller.maximumZoomDistance = 5.0e7;

    this.pins = new PinLayer(this.viewer, options.shops, HeightReference.CLAMP_TO_3D_TILE, options.lowPower);
    this.director = new CameraDirector(this.viewer, options.reducedMotion, () => this.pins.primitives, options.initialLocation);
    if (options.playOpening || (!options.initialCity && !options.initialShop)) this.director.showPlanet();
    else if (options.initialShop) void this.director.shop(options.initialShop,0);
    else if (options.initialCity) void this.director.city(options.initialCity,0);
    this.viewer.camera.changed.addEventListener(()=>this.syncGlobeVisibility());
    this.installInput();
  }

  get mode(): MapMode {
    return this._mode;
  }

  /** Load Google 3D tiles, or fall back to GSI. Resolves once a layer is in place. */
  async start(): Promise<void> {
    // Bundled global imagery makes the opening Earth visible even before Google
    // tiles arrive, and outside Japan when the regional GSI fallback is active.
    // Base imagery and Google tiles are independent; do not delay the city
    // request until the bundled globe's metadata has finished loading.
    void TileMapServiceImageryProvider.fromUrl(
      buildModuleUrl("Assets/Textures/NaturalEarthII"),
      {credit:new Credit("Natural Earth II · public domain")},
    ).then(earth => {
      if (!this.viewer.isDestroyed()) {
        this.viewer.imageryLayers.addImageryProvider(earth, 0);
        this.viewer.scene.requestRender();
      }
    }).catch(() => console.warn("[soupmap] Base globe imagery unavailable; continuing with the city layer."));
    const key = this.options.googleKey;
    if (!key) {
      this.enableFallback("No Google Maps key configured");
      return;
    }
    try {
      GoogleMaps.defaultApiKey = key;
      const tileset = await timeout(
        createGooglePhotorealistic3DTileset(
          // We run with no geocoder at all, which satisfies Google's "Google geocoder only" rule.
          { key, onlyUsingWithGoogleGeocoder: true },
          {
            enableCollision: true, // required for CLAMP_TO_3D_TILE pins and camera collision
            ...renderBudget(this.options.lowPower),
          },
        ),
        GOOGLE_TIMEOUT_MS,
        "Google 3D tiles",
      );
      if (this._mode === "fallback") {
        tileset.destroy();
        return;
      }
      this.googleTileset = this.viewer.scene.primitives.add(tileset);
      tileset.maximumScreenSpaceError = movingScreenSpaceError(this.options.lowPower, this.cameraMoving, this.viewer.camera.positionCartographic.height);
      this.syncGlobeVisibility();
      this.watchGoogleTiles(tileset);
      const surfaceReady = () => {
        if (this._mode !== "google" || !this.citySurface || this.googleSurfaceReady) return;
        this.googleSurfaceReady = true;
        this.syncGlobeVisibility();
        this.viewer.scene.requestRender();
      };
      tileset.initialTilesLoaded.addEventListener(surfaceReady);
      tileset.allTilesLoaded.addEventListener(surfaceReady);
      this.options.onStatus({ kind: "ready", mode: "google" });
    } catch (error) {
      console.warn("[soupmap] Google 3D tiles unavailable, using GSI fallback.", error);
      this.enableFallback("Google 3D tiles could not load");
    }
  }

  private syncGlobeVisibility(): void {
    this.citySurface=citySurfaceActive(this.viewer.camera.positionCartographic.height,this.citySurface);
    if(!this.citySurface) this.googleSurfaceReady=false;
    if(this.googleTileset) this.googleTileset.show=this.citySurface;
    const show = this._mode !== "google" || !this.citySurface || !this.googleSurfaceReady;
    if (this.viewer.scene.globe.show !== show) {
      this.viewer.scene.globe.show = show;
      this.viewer.scene.requestRender();
    }
  }

  /** If the key is accepted but tiles keep failing (quota, billing, referrer), fall back. */
  private watchGoogleTiles(tileset: Cesium3DTileset): void {
    let loaded = 0;
    let failed = 0;
    tileset.tileLoad.addEventListener(() => {
      loaded++;
    });
    tileset.tileFailed.addEventListener(() => {
      failed++;
      if (loaded === 0 && failed >= 6) this.enableFallback("Google 3D tiles failed to load");
    });
  }

  private enableFallback(reason: string): void {
    if (this._mode === "fallback") return;
    this._mode = "fallback";
    if (this.googleTileset) {
      this.viewer.scene.primitives.remove(this.googleTileset);
      this.googleTileset = undefined;
    }
    this.viewer.scene.globe.show = true;
    this.syncPinHeights();
    this.applyFallbackLayer();
    this.options.onStatus({ kind: "ready", mode: "fallback", reason });
  }

  private applyFallbackLayer(): void {
    const layers = this.viewer.imageryLayers;
    if (this.fallbackLayer) layers.remove(this.fallbackLayer, true);
    this.fallbackLayer = layers.addImageryProvider(gsiProvider(this.fallbackStyle));
    this.viewer.scene.requestRender();
  }

  /**
   * A flat ground at `height` metres (ellipsoidal), or back to the plain ellipsoid with null.
   * PLATEAU's data view uses it so imagery lies at the buildings' base height
   * without moving the buildings (moving a tileset after load breaks picking).
   */
  setFlatGround(height: number | null): void {
    if (height === this.flatGround) return;
    this.flatGround = height;
    this.viewer.scene.terrainProvider =
      height === null
        ? new EllipsoidTerrainProvider()
        : new CustomHeightmapTerrainProvider({ width: 2, height: 2, callback: () => new Float32Array(4).fill(height) });
    this.syncPinHeights();
    this.viewer.scene.requestRender();
  }

  private syncPinHeights(): void {
    const onGoogleTiles = this._mode === "google" && this.flatGround === null;
    this.pins.setHeightReference(onGoogleTiles ? HeightReference.CLAMP_TO_3D_TILE : HeightReference.CLAMP_TO_GROUND);
  }

  setFallbackStyle(style: FallbackStyle): void {
    this.fallbackStyle = style;
    if (this._mode === "fallback") this.applyFallbackLayer();
  }

  private installInput(): void {
    const canvas = this.viewer.scene.canvas;
    document.addEventListener("visibilitychange",()=>{
      if(document.hidden) this.director.cancel();
      this.viewer.useDefaultRenderLoop = !document.hidden && !this.graphicsLost;
    });
    canvas.addEventListener("webglcontextlost",(event)=>{
      event.preventDefault();
      this.graphicsLost = true;
      this.director.cancel();
      this.viewer.useDefaultRenderLoop=false;
      this.options.onStatus({kind:"error",message:"The 3D map paused. Shop search, saved places and directions are still available."});
    });
    const setMoving = (moving: boolean) => {
      this.cameraMoving = moving;
      const height = this.viewer.camera.positionCartographic.height;
      const dpr = Math.max(window.devicePixelRatio || 1, 1);
      this.viewer.resolutionScale = renderPixelRatio(this.options.lowPower, moving, height, dpr) / dpr;
      if (this.googleTileset) {
        this.googleTileset.maximumScreenSpaceError = movingScreenSpaceError(this.options.lowPower, moving, height);
      }
      this.viewer.scene.requestRender();
    };
    this.viewer.camera.moveStart.addEventListener(() => setMoving(true));
    this.viewer.camera.moveEnd.addEventListener(() => setMoving(false));
    const notify = () => {
      this.director.cancel();
      this.interactionHandlers.forEach((h) => h());
    };
    canvas.addEventListener("pointerdown", notify, { passive: true });
    canvas.addEventListener("wheel", notify, { passive: true });

    const handler = new ScreenSpaceEventHandler(canvas);
    handler.setInputAction((event: { position: Cartesian2 }) => {
      const picked: unknown = this.viewer.scene.pick(event.position);
      const id = defined(picked) ? (picked as { id?: PickId }).id : undefined;
      if (id?.kind === "shop") {
        this.pickHandlers.forEach((h) => h(id.slug));
        return;
      }
      if (id?.kind === "cluster") {
        const sphere = this.pins.clusterSphere(id.clusterId);
        if (sphere) void this.director.sphere(sphere);
        return;
      }
      for (const claim of this.clickHandlers) {
        if (claim(picked, event.position)) return;
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    // Hover names a marker without a permanent label. Mouse only, throttled, and
    // skipped while the camera moves, so picking never competes with a drag.
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let pending: ScreenPoint | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hovered: string | null = null;
    const emit = (hover: MapHover | null) => {
      if ((hover?.slug ?? null) === hovered && !hover) return;
      hovered = hover?.slug ?? null;
      this.hoverHandlers.forEach((h) => h(hover));
    };
    handler.setInputAction((event: { endPosition: Cartesian2 }) => {
      pending = ScreenPoint.clone(event.endPosition, pending);
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (!pending || this.cameraMoving || this.graphicsLost) return emit(null);
        let id: PickId | undefined;
        try {
          const picked: unknown = this.viewer.scene.pick(pending, 6, 6);
          id = defined(picked) ? (picked as { id?: PickId }).id : undefined;
        } catch {
          id = undefined;
        }
        canvas.style.cursor = id?.kind === "shop" || id?.kind === "cluster" ? "pointer" : "";
        emit(id?.kind === "shop" ? { slug: id.slug, x: pending.x, y: pending.y } : null);
      }, 90);
    }, ScreenSpaceEventType.MOUSE_MOVE);
    canvas.addEventListener("pointerleave", () => {
      canvas.style.cursor = "";
      emit(null);
    });
  }

  /** Feature modules (PLATEAU building info) register here for map clicks. */
  addClickHandler(handler: MapClickHandler): () => void {
    this.clickHandlers.push(handler);
    return () => {
      const i = this.clickHandlers.indexOf(handler);
      if (i >= 0) this.clickHandlers.splice(i, 1);
    };
  }

  setShops(shops: readonly Shop[]): void {
    this.pins.setVisibleShops(shops);
  }

  setSelected(slug: string | null): void {
    this.pins.setSelected(slug);
  }

  setSaved(saved: ReadonlySet<string>): void {
    this.pins.setSaved(saved);
  }

  flyToShop(shop: Shop, options?: FlyOptions): Promise<void> {
    return this.director.shop(shop, options?.duration, options?.bottomInset);
  }

  flyToCity(city: City, options?: FlyOptions): Promise<void> {
    return this.director.city(city, options?.duration);
  }

  flyToOverview(options?: FlyOptions): Promise<void> {
    return this.director.overview(options?.duration);
  }

  zoom(direction: 1 | -1): void {
    this.cancelFlight();
    const amount = Math.max(25, this.viewer.camera.positionCartographic.height * 0.35);
    if (direction === 1) this.viewer.camera.zoomIn(amount); else this.viewer.camera.zoomOut(amount);
    this.viewer.scene.requestRender();
  }

  /** Rotate around the visible map center instead of pointing away from the city. */
  private reframe(heading: number, pitch: number): void {
    const camera = this.viewer.camera;
    const scene = this.viewer.scene;
    const center = new ScreenPoint(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2);
    const ray = camera.getPickRay(center);
    const target = ray ? scene.globe.pick(ray, scene) : undefined;
    if (!target) return;
    camera.flyToBoundingSphere(new BoundingSphere(target, 1), {
      offset: new HeadingPitchRange(heading, pitch, Cartesian3.distance(camera.positionWC, target)),
      duration: this.options.reducedMotion ? 0 : 0.7,
    });
  }

  togglePerspective(): boolean {
    const overhead = this.viewer.camera.pitch > CesiumMath.toRadians(-70);
    this.reframe(this.viewer.camera.heading, CesiumMath.toRadians(overhead ? -89 : -42));
    return overhead;
  }

  faceNorth(): void { this.reframe(0, this.viewer.camera.pitch); }

  playIntro(city: City): Promise<void> {
    return this.director.intro(city);
  }

  cancelFlight(): void {
    this.director.cancel();
  }

  onShopPicked(handler: (slug: string) => void): void {
    this.pickHandlers.push(handler);
  }

  onHover(handler: (hover: MapHover | null) => void): void {
    this.hoverHandlers.push(handler);
  }

  onUserInteraction(handler: () => void): void {
    this.interactionHandlers.push(handler);
  }
}

export async function createMapEngine(options: EngineOptions): Promise<MapEngineImpl> {
  const engine = new MapEngineImpl(options);
  engine.setShops(options.initialVisibleShops ?? options.shops);
  await engine.start();
  return engine;
}
