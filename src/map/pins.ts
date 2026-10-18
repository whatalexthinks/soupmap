/**
 * Shop pins and clusters.
 * - Pins are billboards clamped to the 3D tiles (CLAMP_TO_3D_TILE: tiles only, verified
 *   against the Cesium 1.146 docs) when Google 3D is active, and CLAMP_TO_GROUND
 *   (terrain and tiles) on the GSI globe and in PLATEAU's data view.
 * - disableDepthTestDistance keeps buildings from hiding pins.
 * - Supercluster groups pins at country/region zoom.
 */
import { displayName } from "../names.ts";
import {
  BillboardCollection,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Color,
  DistanceDisplayCondition,
  HeightReference,
  HorizontalOrigin,
  LabelCollection,
  LabelStyle,
  Math as CesiumMath,
  NearFarScalar,
  type Rectangle,
  VerticalOrigin,
  type Billboard,
  type Label,
  type Viewer,
} from "cesium";
import { ShopPinIndex, type MapBounds } from "./pin-index.ts";
import type { Shop } from "../data/shops.ts";
import {
  MARKER_SIZE, SELECTED_SIZE, clusterGlyph, clusterHeight, clusterLabel, markerColor, markerGlyph,
  markerImageId, markerKind, selectedGlyph, type MarkerKind,
} from "./glyph.ts";

export type PickId = { kind: "shop"; slug: string } | { kind: "cluster"; clusterId: number };

interface Pin {
  shop: Shop;
  billboard: Billboard;
  label: Label;
  lastSeen: number;
  /** Appearance key, so unchanged pins are not re-uploaded on every refresh. */
  look: string;
}

/**
 * Names are for close navigation, not a city-wide layer: imported locations only
 * label at street level, editor's picks a little further out, the selection always.
 */
const LABEL_DISTANCE: Record<MarkerKind, number> = { dot: 300, saved: 900, pick: 2500 };
const SELECTED_LABEL_DISTANCE = 14_000;
/** Bounded reuse cache: active pins plus recently visited viewports. */
const MAX_CACHED_PINS = 360;

/** Rough Web-Mercator-style zoom from camera height, to drive Supercluster. */
export function heightToZoom(height: number): number {
  // Calibrated so the country overview (~2,000 km up) clusters by region
  // and city views (< ~25 km) show every shop.
  return Math.log2(1.4e8 / Math.max(height, 1));
}

export class PinLayer {
  private readonly pins = new Map<string, Pin>();
  private readonly catalog = new Map<string, Shop>();
  private readonly pinCollection: BillboardCollection;
  private readonly labelCollection: LabelCollection;
  private readonly clusterCollection: BillboardCollection;
  private readonly index: ShopPinIndex;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private visible = new Set<string>();
  private selected: string | null = null;
  private saved: ReadonlySet<string> = new Set();
  private pinClock = 0;

  constructor(
    private readonly viewer: Viewer,
    shops: readonly Shop[],
    private heightRef: HeightReference,
    private readonly lowPower = false,
  ) {
    this.index = new ShopPinIndex(lowPower);
    const scene = viewer.scene;
    this.pinCollection = scene.primitives.add(new BillboardCollection({ scene }));
    this.labelCollection = scene.primitives.add(new LabelCollection({ scene }));
    this.clusterCollection = scene.primitives.add(new BillboardCollection({ scene }));

    for (const shop of shops) {
      this.catalog.set(shop.slug, shop);
    }

    const camera = viewer.camera;
    camera.percentageChanged = 0.05;
    camera.changed.addEventListener(() => {
      if (this.refreshTimer !== undefined) return;
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = undefined;
        this.refresh();
      }, lowPower ? 120 : 60);
    });
    camera.moveEnd.addEventListener(() => {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
      this.refresh();
    });
  }

  /** Switch clamping, e.g. when the map falls back from Google 3D to the GSI globe. */
  setHeightReference(heightRef: HeightReference): void {
    if (heightRef === this.heightRef) return;
    this.heightRef = heightRef;
    for (const { billboard, label } of this.pins.values()) {
      billboard.heightReference = heightRef;
      label.heightReference = heightRef;
    }
    this.viewer.scene.requestRender();
  }

  /** Hide every pin, label and cluster (e.g. inside a Street View panorama). */
  setVisible(show: boolean): void {
    this.pinCollection.show = show;
    this.labelCollection.show = show;
    this.clusterCollection.show = show;
    this.viewer.scene.requestRender();
  }

  refreshNames(): void {
    for (const { shop, label } of this.pins.values()) label.text = displayName(shop);
    this.viewer.scene.requestRender();
  }

  setVisibleShops(shops: readonly Shop[]): void {
    if (!this.index.setShops(shops)) return;
    this.visible = new Set(shops.map((s) => s.slug));
    for (const shop of shops) this.catalog.set(shop.slug, shop);
    this.refresh();
  }

  setSelected(slug: string | null): void {
    const prev = this.selected ? this.pins.get(this.selected) : undefined;
    this.selected = slug;
    if (prev) this.applyLook(prev);
    const next = slug ? this.pins.get(slug) : undefined;
    if (next) this.applyLook(next);
    this.refresh();
  }

  /** Shops in any of the visitor's lists get a vermilion ring. */
  setSaved(saved: ReadonlySet<string>): void {
    this.saved = new Set(saved);
    for (const pin of this.pins.values()) this.applyLook(pin);
    this.viewer.scene.requestRender();
  }

  /** The shop under a screen position, for hover tooltips. */
  shopAt(slug: string): Shop | undefined {
    return this.catalog.get(slug);
  }

  /** Leaves of a cluster as a bounding sphere, for "zoom into cluster". */
  /** Primitives the camera should ignore when sampling ground height. */
  get primitives(): object[] {
    return [this.pinCollection, this.labelCollection, this.clusterCollection];
  }

  clusterSphere(clusterId: number): BoundingSphere | undefined {
    const leaves = this.index.leaves(clusterId);
    if (!leaves.length) return undefined;
    const points = leaves.map((f) => {
      const [lng, lat] = f.geometry.coordinates as [number, number];
      return Cartesian3.fromDegrees(lng, lat, 0);
    });
    return BoundingSphere.fromPoints(points);
  }

  private applyLook(pin: Pin): void {
    const { shop, billboard, label } = pin;
    const selected = shop.slug === this.selected;
    const kind = markerKind(shop, this.saved.has(shop.slug));
    const color = markerColor(shop);
    const look = `${selected ? "selected" : kind}:${color}`;
    if (look === pin.look) return;
    pin.look = look;
    if (selected) {
      billboard.setImage(`selected:${color}`, selectedGlyph(color));
      billboard.width = SELECTED_SIZE.width;
      billboard.height = SELECTED_SIZE.height;
      billboard.verticalOrigin = VerticalOrigin.BOTTOM;
    } else {
      // Canvas images otherwise get a new random atlas ID for every billboard.
      billboard.setImage(markerImageId(kind, color), markerGlyph(kind, color));
      billboard.width = billboard.height = MARKER_SIZE[kind];
      billboard.verticalOrigin = VerticalOrigin.CENTER;
    }
    label.pixelOffset = new Cartesian2(0, selected ? -(SELECTED_SIZE.height + 4) : -(MARKER_SIZE[kind] / 2 + 4));
    label.distanceDisplayCondition = new DistanceDisplayCondition(0, selected ? SELECTED_LABEL_DISTANCE : LABEL_DISTANCE[kind]);
    label.scale = selected ? 1.08 : 1;
    this.viewer.scene.requestRender();
  }

  private createPin(shop: Shop): Pin {
    const position = Cartesian3.fromDegrees(shop.lng, shop.lat, 0);
    const billboard = this.pinCollection.add({
      position,
      heightReference: this.heightRef,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new NearFarScalar(600, 1.15, 2.0e6, 0.8),
      id: { kind: "shop", slug: shop.slug } satisfies PickId,
      show: true,
    });
    const label = this.labelCollection.add({
      position,
      text: displayName(shop),
      font: "600 12px 'Instrument Sans Variable', 'Instrument Sans', system-ui, sans-serif",
      fillColor: Color.fromCssColorString("#fffaf0"),
      outlineColor: Color.fromCssColorString("#242b25"),
      outlineWidth: 1.25,
      style: LabelStyle.FILL_AND_OUTLINE,
      showBackground: true,
      backgroundColor: Color.fromCssColorString("rgba(31, 39, 33, 0.88)"),
      backgroundPadding: new Cartesian2(6, 3),
      horizontalOrigin: HorizontalOrigin.CENTER,
      verticalOrigin: VerticalOrigin.BOTTOM,
      scaleByDistance: new NearFarScalar(250, 1, 3500, 0.82),
      heightReference: this.heightRef,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      id: { kind: "shop", slug: shop.slug } satisfies PickId,
      show: true,
    });
    const pin: Pin = { shop, billboard, label, lastSeen: ++this.pinClock, look: "" };
    this.applyLook(pin);
    this.pins.set(shop.slug, pin);
    return pin;
  }

  private insideView(shop: Shop, view: Rectangle | undefined): boolean {
    if (!view) return false;
    const longitude = CesiumMath.toRadians(shop.lng);
    const latitude = CesiumMath.toRadians(shop.lat);
    const longitudeVisible =
      view.west <= view.east
        ? longitude >= view.west && longitude <= view.east
        : longitude >= view.west || longitude <= view.east;
    return longitudeVisible && latitude >= view.south && latitude <= view.north;
  }

  private trimPinCache(active: Set<string>): void {
    const limit = this.lowPower ? 96 : MAX_CACHED_PINS;
    if (this.pins.size <= limit) return;
    const stale = [...this.pins.entries()]
      .filter(([slug]) => !active.has(slug) && slug !== this.selected)
      .sort((a, b) => a[1].lastSeen - b[1].lastSeen);
    for (const [slug, pin] of stale) {
      if (this.pins.size <= limit) break;
      this.pinCollection.remove(pin.billboard);
      this.labelCollection.remove(pin.label);
      this.pins.delete(slug);
    }
  }

  refresh(): void {
    const height = this.viewer.camera.positionCartographic.height;
    const zoom = heightToZoom(height);
    const individually = new Set<string>();
    const viewRectangle = this.viewer.camera.computeViewRectangle(this.viewer.scene.globe.ellipsoid);
    const bounds: MapBounds | undefined = viewRectangle ? [
      CesiumMath.toDegrees(viewRectangle.west), CesiumMath.toDegrees(viewRectangle.south),
      CesiumMath.toDegrees(viewRectangle.east), CesiumMath.toDegrees(viewRectangle.north),
    ] : undefined;
    this.clusterCollection.removeAll();

    for (const feature of this.index.query(bounds, zoom)) {
      const props = feature.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; slug?: string };
      if (props.cluster && props.cluster_id !== undefined && props.point_count) {
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        const glyph = clusterGlyph(props.point_count);
        const billboard = this.clusterCollection.add({
          position: Cartesian3.fromDegrees(lng, lat, 0),
          width: glyph.width,
          height: glyph.height,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          id: { kind: "cluster", clusterId: props.cluster_id } satisfies PickId,
        });
        billboard.setImage(`cluster:${clusterLabel(props.point_count)}:${clusterHeight(props.point_count)}`, glyph.canvas);
      } else if (props.slug) {
        individually.add(props.slug);
      }
    }
    // Keep the selected shop visible even inside a cluster.
    if (this.selected && this.visible.has(this.selected)) individually.add(this.selected);

    const active = new Set<string>();
    for (const slug of individually) {
      const shop = this.catalog.get(slug);
      if (!shop || (slug !== this.selected && !this.insideView(shop, viewRectangle))) continue;
      active.add(slug);
      const pin = this.pins.get(slug) ?? this.createPin(shop);
      pin.lastSeen = ++this.pinClock;
      pin.billboard.show = true;
      pin.label.show = true;
    }
    for (const [slug, pin] of this.pins) {
      if (active.has(slug)) continue;
      pin.billboard.show = false;
      pin.label.show = false;
    }
    this.trimPinCache(active);
    this.viewer.scene.requestRender();
  }
}
