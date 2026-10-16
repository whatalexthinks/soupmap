/**
 * "Building info": PLATEAU building 3D Tiles on top of the Google tiles.
 *
 * Two configurations, each set when the tileset is created (moving a tileset after
 * load breaks picking, and a lifted tileset over custom terrain never finishes loading):
 *
 * - Over Google: near-invisible buildings, lifted 2 m so a highlighted roof clears
 *   Google's photogrammetry. Picking hides the Google tileset for one synchronous pick,
 *   so the click reaches the PLATEAU building (no visible flicker).
 * - "Data view": Google hidden; PLATEAU buildings in a clean architectural style over
 *   PLATEAU ortho imagery, draped on a flat ground at the buildings' base height.
 *   Used automatically on the GSI fallback. Toggling reloads the tileset (browser-cached).
 *
 * The picked building gets an amber highlight. PLATEAU streaming is a trial service with
 * no SLA: 8 s timeouts, silent failure to a "Building data unavailable" chip.
 */
import {
  Cartesian3,
  Cesium3DTileFeature,
  Cesium3DTileStyle,
  Cesium3DTileset,
  Color,
  Credit,
  Ellipsoid,
  ImageryLayer,
  Matrix4,
  Rectangle,
  UrlTemplateImageryProvider,
  type Cartesian2,
} from "cesium";
import { creditHtml, getSource } from "../sources.ts";
import type { MapEngineImpl } from "./engine.ts";
import { readBuildingFacts, type BuildingFacts } from "./plateau-attributes.ts";

export interface PlateauTilesetRef {
  cityCode: string;
  name: string;
  lod: string;
  texture: boolean;
  year: number | null;
  url: string;
}

export type BuildingEvent =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "unavailable" }
  | { kind: "picked"; facts: BuildingFacts }
  | { kind: "missed" };

const TIMEOUT_MS = 8000;
const LIFT_M = 2;
const AMBER = "#f2a541";

const debug = new URLSearchParams(location.search).get("debug") === "plateau";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`PLATEAU timed out after ${ms} ms`)), ms)),
  ]);
}

/** Root bounding region of a PLATEAU tileset, if it has one (it normally does). */
function rootRegion(tileset: Cesium3DTileset): { rectangle?: Rectangle; minimumHeight?: number } {
  // Cesium3DTile.boundingVolume (a TileBoundingRegion) isn't in Cesium's public types.
  const root = tileset.root as unknown as { boundingVolume?: { rectangle?: Rectangle; minimumHeight?: number } };
  return { rectangle: root.boundingVolume?.rectangle, minimumHeight: root.boundingVolume?.minimumHeight };
}

interface Target {
  cityCode: string;
  ref: PlateauTilesetRef;
  anchor: { lat: number; lng: number };
  fallbackGroundHeight: number;
}

export class BuildingInfo {
  private target: Target | undefined;
  private tileset: Cesium3DTileset | undefined;
  private pickedId: string | null = null;
  private pickedFeature: Cesium3DTileFeature | undefined;
  private dataView = false;
  private orthoLayer: ImageryLayer | undefined;
  private removeClick: (() => void) | undefined;
  private generation = 0;
  /** CC BY 4.0 attribution, on screen whenever PLATEAU buildings are. */
  private readonly credit = new Credit(creditHtml("plateau-buildings"), true);

  constructor(
    private readonly engine: MapEngineImpl,
    private readonly index: ReadonlyMap<string, PlateauTilesetRef>,
    private readonly lowPower: boolean,
    private readonly emit: (event: BuildingEvent) => void,
  ) {}

  has(cityCode: string): boolean {
    return this.index.has(cityCode);
  }

  /** On, or on its way (loading). */
  get active(): boolean {
    return this.target !== undefined;
  }

  get isDataView(): boolean {
    return this.dataView;
  }

  get activeCityCode(): string | undefined {
    return this.target?.cityCode;
  }

  /** @param anchor a point in the city, for the direction of "up" when lifting the layer */
  async enable(cityCode: string, fallbackGroundHeight: number, anchor: { lat: number; lng: number }): Promise<boolean> {
    const ref = this.index.get(cityCode);
    if (!ref) {
      this.emit({ kind: "unavailable" });
      return false;
    }
    if (this.target?.cityCode === cityCode) return true;
    this.disable();
    this.target = { cityCode, ref, anchor, fallbackGroundHeight };
    this.dataView = this.engine.mode === "fallback";
    this.removeClick = this.engine.addClickHandler((_picked, position) => this.onClick(position));
    return this.load();
  }

  async setDataView(on: boolean): Promise<void> {
    if (on === this.dataView || !this.target) return;
    this.dataView = on;
    this.pickedId = null;
    this.pickedFeature = undefined;
    await this.load();
  }

  disable(): void {
    this.generation++;
    this.removeClick?.();
    this.removeClick = undefined;
    this.removeTileset();
    this.dataView = false;
    this.applyScene(undefined);
    this.target = undefined;
    this.pickedId = null;
    this.pickedFeature = undefined;
    this.engine.viewer.scene.requestRender();
  }

  /** (Re)create the tileset for the current configuration. */
  private async load(): Promise<boolean> {
    const target = this.target;
    if (!target) return false;
    const generation = ++this.generation;
    this.removeTileset();
    this.emit({ kind: "loading" });

    const lift = this.dataView ? 0 : LIFT_M;
    const up = Ellipsoid.WGS84.geodeticSurfaceNormal(Cartesian3.fromDegrees(target.anchor.lng, target.anchor.lat), new Cartesian3());
    try {
      const tileset = await withTimeout(
        Cesium3DTileset.fromUrl(target.ref.url, {
          modelMatrix: Matrix4.fromTranslation(Cartesian3.multiplyByScalar(up, lift, new Cartesian3())),
          maximumScreenSpaceError: this.lowPower ? 24 : 16,
          cacheBytes: (this.lowPower ? 96 : 192) * 1024 * 1024,
          showCreditsOnScreen: true,
        }),
        TIMEOUT_MS,
      );
      if (generation !== this.generation) {
        tileset.destroy();
        return false;
      }
      this.tileset = this.engine.viewer.scene.primitives.add(tileset);
      this.engine.viewer.creditDisplay.addStaticCredit(this.credit);
      this.watch(tileset, generation);
      this.applyScene(rootRegion(tileset).minimumHeight ?? target.fallbackGroundHeight);
      this.applyStyle();
      return true; // "ready" is emitted when the first building tile arrives (see watch)
    } catch (error) {
      if (generation === this.generation) {
        if (debug) console.info("[soupmap] PLATEAU tileset failed to load", error);
        this.fail();
      }
      return false;
    }
  }

  private removeTileset(): void {
    if (!this.tileset) return;
    this.engine.viewer.scene.primitives.remove(this.tileset);
    this.engine.viewer.creditDisplay.removeStaticCredit(this.credit);
    this.tileset = undefined;
  }

  /**
   * Ready once the first building tile has loaded (so "click a building" is true).
   * No tile within 8 s, or repeated failures before any success: give up quietly.
   */
  private watch(tileset: Cesium3DTileset, generation: number): void {
    let loaded = 0;
    let failed = 0;
    tileset.tileLoad.addEventListener(() => {
      loaded++;
      if (loaded === 1 && generation === this.generation) this.emit({ kind: "ready" });
    });
    tileset.tileFailed.addEventListener((error: { url?: string; message?: string }) => {
      if (debug) console.info("[soupmap] PLATEAU tile failed", error.url, error.message);
      failed++;
      if (loaded === 0 && failed >= 3 && generation === this.generation) this.fail();
    });
    setTimeout(() => {
      if (loaded === 0 && generation === this.generation && this.tileset === tileset) this.fail();
    }, TIMEOUT_MS);
  }

  private fail(): void {
    if (debug) console.info("[soupmap] PLATEAU building data unavailable");
    this.disable();
    this.emit({ kind: "unavailable" });
  }

  /** Google tiles vs. data view (flat ground + PLATEAU ortho). `baseHeight` undefined = restore. */
  private applyScene(baseHeight: number | undefined): void {
    const scene = this.engine.viewer.scene;
    const google = this.engine.googleTileset;
    if (this.dataView && baseHeight !== undefined) {
      if (google) google.show = false;
      scene.globe.show = true;
      this.engine.setFlatGround(baseHeight);
      this.addOrtho();
    } else {
      if (this.orthoLayer) this.engine.viewer.imageryLayers.remove(this.orthoLayer, true);
      this.orthoLayer = undefined;
      this.engine.setFlatGround(null);
      if (google && this.engine.mode === "google") {
        google.show = true;
        scene.globe.show = false;
      }
    }
    scene.requestRender();
  }

  private addOrtho(): void {
    if (this.orthoLayer || !this.tileset) return;
    const source = getSource("plateau-ortho");
    const provider = new UrlTemplateImageryProvider({
      url: source.endpoints?.[0] ?? "",
      minimumLevel: 10,
      maximumLevel: 19,
      // Only request tiles over this city's buildings: PLATEAU-Ortho covers PLATEAU cities only.
      rectangle: rootRegion(this.tileset).rectangle ?? Rectangle.MAX_VALUE,
      credit: new Credit(creditHtml("plateau-ortho"), true),
    });
    provider.errorEvent.addEventListener(() => undefined);
    this.orthoLayer = this.engine.viewer.imageryLayers.addImageryProvider(provider);
  }

  /** Near-invisible (or architectural in data view), with the picked building in amber. */
  private applyStyle(): void {
    const tileset = this.tileset;
    if (!tileset) return;
    const base = this.dataView ? "color('#ebe7f3', 1.0)" : "color('#ffffff', 0.03)";
    const highlight = this.dataView ? `color('${AMBER}', 1.0)` : `color('${AMBER}', 0.6)`;
    const conditions: Array<[string, string]> = [];
    if (this.pickedId !== null) conditions.push([`\${gml_id} === ${JSON.stringify(this.pickedId)}`, highlight]);
    conditions.push(["true", base]);
    tileset.style = new Cesium3DTileStyle({ color: { conditions } });

    if (this.pickedId === null && this.pickedFeature) {
      // No gml_id to style by: colour the feature directly.
      try {
        this.pickedFeature.color = Color.fromCssColorString(AMBER).withAlpha(this.dataView ? 1 : 0.6);
      } catch {
        this.pickedFeature = undefined;
      }
    }
    this.engine.viewer.scene.requestRender();
  }

  private pick(position: Cartesian2): Cesium3DTileFeature | undefined {
    const scene = this.engine.viewer.scene;
    const google = this.engine.googleTileset;
    const googleShown = google?.show ?? false;
    if (google) google.show = false;
    try {
      const picked: unknown = scene.pick(position);
      if (picked instanceof Cesium3DTileFeature && picked.tileset === this.tileset) return picked;
      const drilled: unknown[] = scene.drillPick(position, 4);
      return drilled.find((p): p is Cesium3DTileFeature => p instanceof Cesium3DTileFeature && p.tileset === this.tileset);
    } finally {
      if (google) google.show = googleShown;
    }
  }

  private onClick(position: Cartesian2): boolean {
    if (!this.tileset) return false;
    const feature = this.pick(position);
    if (!feature) {
      this.emit({ kind: "missed" });
      return true;
    }
    const props: Record<string, unknown> = {};
    for (const id of feature.getPropertyIds()) props[id] = feature.getProperty(id);
    if (debug) console.info("[soupmap] PLATEAU feature properties", Object.keys(props), props);

    const gmlId = props.gml_id;
    this.pickedId = typeof gmlId === "string" ? gmlId : null;
    this.pickedFeature = feature;
    this.applyStyle();
    this.emit({ kind: "picked", facts: readBuildingFacts(props) });
    return true;
  }
}
