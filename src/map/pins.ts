/**
 * Shop pins and clusters.
 * - Pins are billboards clamped to the 3D tiles (CLAMP_TO_3D_TILE: tiles only, verified
 *   against the Cesium 1.146 docs) when Google 3D is active, and CLAMP_TO_GROUND
 *   (terrain and tiles) on the GSI globe and in PLATEAU's data view.
 * - disableDepthTestDistance keeps buildings from hiding pins.
 * - Supercluster groups pins at country/region zoom.
 */
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
import Supercluster from "supercluster";
import type { Shop } from "../data/shops.ts";
import { CLUSTER_SIZE, PIN_SIZE, clusterGlyph, pinGlyph } from "./glyph.ts";

export type PickId = { kind: "shop"; slug: string } | { kind: "cluster"; clusterId: number };

interface Pin {
  shop: Shop;
  billboard: Billboard;
  label: Label;
  lastSeen: number;
}

/** Above this zoom every shop is drawn individually. */
const MAX_CLUSTER_ZOOM = 12;
/** Keep shop names for close navigation, not as a city-wide layer. */
const LABEL_DISTANCE = 2100;
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
  private index = new Supercluster<{ slug: string }>({ radius: 56, maxZoom: MAX_CLUSTER_ZOOM, minPoints: 2 });
  private visible = new Set<string>();
  private selected: string | null = null;
  private pinClock = 0;

  constructor(
    private readonly viewer: Viewer,
    shops: readonly Shop[],
    private heightRef: HeightReference,
  ) {
    const scene = viewer.scene;
    this.pinCollection = scene.primitives.add(new BillboardCollection({ scene }));
    this.labelCollection = scene.primitives.add(new LabelCollection({ scene }));
    this.clusterCollection = scene.primitives.add(new BillboardCollection({ scene }));

    for (const shop of shops) {
      this.catalog.set(shop.slug, shop);
    }

    const camera = viewer.camera;
    camera.percentageChanged = 0.05;
    camera.changed.addEventListener(() => this.refresh());
    camera.moveEnd.addEventListener(() => this.refresh());
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

  setVisibleShops(shops: readonly Shop[]): void {
    this.visible = new Set(shops.map((s) => s.slug));
    for (const shop of shops) this.catalog.set(shop.slug, shop);
    this.index = new Supercluster<{ slug: string }>({ radius: 56, maxZoom: MAX_CLUSTER_ZOOM, minPoints: 2 });
    this.index.load(
      shops.map((s) => ({
        type: "Feature" as const,
        properties: { slug: s.slug },
        geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
      })),
    );
    this.refresh();
  }

  setSelected(slug: string | null): void {
    const prev = this.selected ? this.pins.get(this.selected) : undefined;
    if (prev) this.setPinSelected(prev, false);
    this.selected = slug;
    const next = slug ? this.pins.get(slug) : undefined;
    if (next) this.setPinSelected(next, true);
    this.refresh();
  }

  /** Leaves of a cluster as a bounding sphere, for "zoom into cluster". */
  /** Primitives the camera should ignore when sampling ground height. */
  get primitives(): object[] {
    return [this.pinCollection, this.labelCollection, this.clusterCollection];
  }

  clusterSphere(clusterId: number): BoundingSphere | undefined {
    const leaves = this.index.getLeaves(clusterId, Infinity);
    if (!leaves.length) return undefined;
    const points = leaves.map((f) => {
      const [lng, lat] = f.geometry.coordinates as [number, number];
      return Cartesian3.fromDegrees(lng, lat, 0);
    });
    return BoundingSphere.fromPoints(points);
  }

  private setPinSelected(pin: Pin, selected: boolean): void {
    pin.billboard.image = pinGlyph(pin.shop.broth, selected) as unknown as string;
    pin.label.distanceDisplayCondition = new DistanceDisplayCondition(
      0,
      selected ? SELECTED_LABEL_DISTANCE : LABEL_DISTANCE,
    );
    pin.label.scale = selected ? 1.08 : 1;
  }

  private createPin(shop: Shop): Pin {
    const position = Cartesian3.fromDegrees(shop.lng, shop.lat, 0);
    const selected = shop.slug === this.selected;
    const billboard = this.pinCollection.add({
      position,
      image: pinGlyph(shop.broth, selected),
      width: PIN_SIZE.width,
      height: PIN_SIZE.height,
      verticalOrigin: VerticalOrigin.BOTTOM,
      heightReference: this.heightRef,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new NearFarScalar(800, 1.15, 3.0e6, 0.75),
      id: { kind: "shop", slug: shop.slug } satisfies PickId,
      show: true,
    });
    const label = this.labelCollection.add({
      position,
      text: shop.name,
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
      pixelOffset: new Cartesian2(0, -(PIN_SIZE.height + 4)),
      scaleByDistance: new NearFarScalar(250, 1, LABEL_DISTANCE, 0.82),
      heightReference: this.heightRef,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: new DistanceDisplayCondition(
        0,
        selected ? SELECTED_LABEL_DISTANCE : LABEL_DISTANCE,
      ),
      id: { kind: "shop", slug: shop.slug } satisfies PickId,
      show: true,
      scale: selected ? 1.08 : 1,
    });
    const pin = { shop, billboard, label, lastSeen: ++this.pinClock };
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
    if (this.pins.size <= MAX_CACHED_PINS) return;
    const stale = [...this.pins.entries()]
      .filter(([slug]) => !active.has(slug) && slug !== this.selected)
      .sort((a, b) => a[1].lastSeen - b[1].lastSeen);
    for (const [slug, pin] of stale) {
      if (this.pins.size <= MAX_CACHED_PINS) break;
      this.pinCollection.remove(pin.billboard);
      this.labelCollection.remove(pin.label);
      this.pins.delete(slug);
    }
  }

  refresh(): void {
    const height = this.viewer.camera.positionCartographic.height;
    const zoom = heightToZoom(height);
    const showAll = zoom > MAX_CLUSTER_ZOOM;

    const individually = new Set<string>();
    const viewRectangle = this.viewer.camera.computeViewRectangle(this.viewer.scene.globe.ellipsoid);
    this.clusterCollection.removeAll();

    if (showAll) {
      for (const slug of this.visible) individually.add(slug);
    } else {
      for (const feature of this.index.getClusters([-180, -85, 180, 85], Math.floor(zoom))) {
        const props = feature.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; slug?: string };
        if (props.cluster && props.cluster_id !== undefined && props.point_count) {
          const [lng, lat] = feature.geometry.coordinates as [number, number];
          this.clusterCollection.add({
            position: Cartesian3.fromDegrees(lng, lat, 0),
            image: clusterGlyph(props.point_count),
            width: CLUSTER_SIZE,
            height: CLUSTER_SIZE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            id: { kind: "cluster", clusterId: props.cluster_id } satisfies PickId,
          });
        } else if (props.slug) {
          individually.add(props.slug);
        }
      }
      // keep the selected shop visible even inside a cluster
      if (this.selected && this.visible.has(this.selected)) individually.add(this.selected);
    }

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
