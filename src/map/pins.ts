/**
 * Shop pins and clusters.
 * - Pins are billboards clamped to the 3D tiles (CLAMP_TO_3D_TILE, verified against
 *   Cesium 1.146 docs) when Google 3D is active, and sit on the ellipsoid in fallback mode.
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
  NearFarScalar,
  VerticalOrigin,
  type Billboard,
  type Label,
  type Viewer,
} from "cesium";
import Supercluster from "supercluster";
import type { Shop } from "../data/shops";
import { CLUSTER_SIZE, PIN_SIZE, clusterGlyph, pinGlyph } from "./glyph";

export type PickId = { kind: "shop"; slug: string } | { kind: "cluster"; clusterId: number };

interface Pin {
  shop: Shop;
  billboard: Billboard;
  label: Label;
}

/** Above this zoom every shop is drawn individually. */
const MAX_CLUSTER_ZOOM = 12;
/** Labels appear when the camera is closer than this (metres). */
const LABEL_DISTANCE = 4500;

/** Rough Web-Mercator-style zoom from camera height, to drive Supercluster. */
export function heightToZoom(height: number): number {
  return Math.log2(3.5e7 / Math.max(height, 1));
}

export class PinLayer {
  private readonly pins = new Map<string, Pin>();
  private readonly pinCollection: BillboardCollection;
  private readonly labelCollection: LabelCollection;
  private readonly clusterCollection: BillboardCollection;
  private index = new Supercluster<{ slug: string }>({ radius: 64, maxZoom: MAX_CLUSTER_ZOOM, minPoints: 2 });
  private visible = new Set<string>();
  private selected: string | null = null;
  private clamp: boolean;

  constructor(
    private readonly viewer: Viewer,
    shops: readonly Shop[],
    clampTo3dTiles: boolean,
  ) {
    const scene = viewer.scene;
    this.clamp = clampTo3dTiles;
    this.pinCollection = scene.primitives.add(new BillboardCollection({ scene }));
    this.labelCollection = scene.primitives.add(new LabelCollection({ scene }));
    this.clusterCollection = scene.primitives.add(new BillboardCollection({ scene }));

    for (const shop of shops) {
      const position = Cartesian3.fromDegrees(shop.lng, shop.lat, 0);
      const billboard = this.pinCollection.add({
        position,
        image: pinGlyph(shop.broth),
        width: PIN_SIZE.width,
        height: PIN_SIZE.height,
        verticalOrigin: VerticalOrigin.BOTTOM,
        heightReference: this.heightReference(),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new NearFarScalar(800, 1.15, 3.0e6, 0.75),
        id: { kind: "shop", slug: shop.slug } satisfies PickId,
        show: false,
      });
      const label = this.labelCollection.add({
        position,
        text: shop.name,
        font: "600 14px 'Instrument Sans Variable', 'Instrument Sans', system-ui, sans-serif",
        fillColor: Color.fromCssColorString("#f3efe6"),
        outlineColor: Color.fromCssColorString("#0b0a16"),
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Color.fromCssColorString("rgba(13, 12, 30, 0.78)"),
        backgroundPadding: new Cartesian2(8, 5),
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -(PIN_SIZE.height + 6)),
        heightReference: this.heightReference(),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new DistanceDisplayCondition(0, LABEL_DISTANCE),
        id: { kind: "shop", slug: shop.slug } satisfies PickId,
        show: false,
      });
      this.pins.set(shop.slug, { shop, billboard, label });
    }

    const camera = viewer.camera;
    camera.percentageChanged = 0.05;
    camera.changed.addEventListener(() => this.refresh());
    camera.moveEnd.addEventListener(() => this.refresh());
  }

  private heightReference(): HeightReference {
    return this.clamp ? HeightReference.CLAMP_TO_3D_TILE : HeightReference.NONE;
  }

  /** Switch clamping when the map falls back from Google 3D to the GSI globe. */
  setClampTo3dTiles(clamp: boolean): void {
    this.clamp = clamp;
    for (const { billboard, label } of this.pins.values()) {
      billboard.heightReference = this.heightReference();
      label.heightReference = this.heightReference();
    }
    this.viewer.scene.requestRender();
  }

  setVisibleShops(shops: readonly Shop[]): void {
    this.visible = new Set(shops.map((s) => s.slug));
    this.index = new Supercluster<{ slug: string }>({ radius: 64, maxZoom: MAX_CLUSTER_ZOOM, minPoints: 2 });
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
    if (prev) prev.billboard.image = pinGlyph(prev.shop.broth, false) as unknown as string;
    this.selected = slug;
    const next = slug ? this.pins.get(slug) : undefined;
    if (next) next.billboard.image = pinGlyph(next.shop.broth, true) as unknown as string;
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

  refresh(): void {
    const height = this.viewer.camera.positionCartographic.height;
    const zoom = heightToZoom(height);
    const showAll = zoom > MAX_CLUSTER_ZOOM;

    const individually = new Set<string>();
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

    for (const [slug, pin] of this.pins) {
      const show = individually.has(slug);
      pin.billboard.show = show;
      pin.label.show = show;
    }
    this.viewer.scene.requestRender();
  }
}
