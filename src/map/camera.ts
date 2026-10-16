/**
 * Camera choreography: intro flyover, overview, city and shop framing.
 */
import {
  BoundingSphere,
  Cartesian3,
  Cartographic,
  EasingFunction,
  HeadingPitchRange,
  Math as CesiumMath,
  type Viewer,
} from "cesium";
import { cityByName, type City } from "../data/cities";
import type { Shop } from "../data/shops";

interface View {
  lng: number;
  lat: number;
  height: number;
  heading: number;
  pitch: number;
}

/** High over the Pacific, looking north across the whole archipelago. */
export const OVERVIEW: View = { lng: 137.4, lat: 24.6, height: 2_300_000, heading: -6, pitch: -55 };
const INTRO_START: View = { lng: 136.6, lat: 17.0, height: 4_600_000, heading: -4, pitch: -50 };
/** South of central Tokyo, looking north over the city. */
const INTRO_END: View = { lng: 139.745, lat: 35.575, height: 9_000, heading: 6, pitch: -32 };

export const SHOP_PITCH = -35;
export const SHOP_RANGE = 600;
export const SHOP_DURATION = 3;

function viewToCamera(v: View) {
  return {
    destination: Cartesian3.fromDegrees(v.lng, v.lat, v.height),
    orientation: {
      heading: CesiumMath.toRadians(v.heading),
      pitch: CesiumMath.toRadians(v.pitch),
      roll: 0,
    },
  };
}

export class CameraDirector {
  constructor(
    private readonly viewer: Viewer,
    private readonly reducedMotion: boolean,
    /** Primitives to ignore when sampling the ground (our own pins). */
    private readonly excludeFromSampling: () => object[] = () => [],
  ) {}

  private duration(requested: number | undefined, fallback: number): number {
    return this.reducedMotion ? 0 : (requested ?? fallback);
  }

  setView(v: View): void {
    this.viewer.camera.setView(viewToCamera(v));
    this.viewer.scene.requestRender();
  }

  cancel(): void {
    this.viewer.camera.cancelFlight();
  }

  private flyTo(v: View, duration: number, extra: { maximumHeight?: number } = {}): Promise<void> {
    return new Promise((resolve) => {
      this.viewer.camera.flyTo({
        ...viewToCamera(v),
        duration,
        easingFunction: EasingFunction.QUADRATIC_IN_OUT,
        complete: () => resolve(),
        cancel: () => resolve(),
        ...extra,
      });
    });
  }

  private flyToSphere(sphere: BoundingSphere, offset: HeadingPitchRange, duration: number): Promise<void> {
    return new Promise((resolve) => {
      this.viewer.camera.flyToBoundingSphere(sphere, {
        offset,
        duration,
        easingFunction: EasingFunction.QUADRATIC_IN_OUT,
        complete: () => resolve(),
        cancel: () => resolve(),
      });
    });
  }

  overview(duration?: number): Promise<void> {
    const d = this.duration(duration, 2.5);
    if (d === 0) {
      this.setView(OVERVIEW);
      return Promise.resolve();
    }
    return this.flyTo(OVERVIEW, d);
  }

  /** High over the archipelago, easing toward Tokyo. */
  async intro(): Promise<void> {
    if (this.reducedMotion) {
      this.setView(OVERVIEW);
      return;
    }
    this.setView(INTRO_START);
    await this.flyTo(INTRO_END, 9, { maximumHeight: INTRO_START.height });
  }

  city(city: City, duration?: number): Promise<void> {
    const center = Cartesian3.fromDegrees(city.lng, city.lat, city.groundHeight);
    return this.flyToSphere(
      new BoundingSphere(center, 500),
      new HeadingPitchRange(CesiumMath.toRadians(city.heading), CesiumMath.toRadians(-42), 6500),
      this.duration(duration, 3),
    );
  }

  sphere(sphere: BoundingSphere, duration?: number): Promise<void> {
    const range = Math.max(sphere.radius * 3.2, 3500);
    return this.flyToSphere(
      sphere,
      new HeadingPitchRange(0, CesiumMath.toRadians(-50), range),
      this.duration(duration, 2.5),
    );
  }

  /**
   * Three-quarter street view of a shop: flyToBoundingSphere with pitch ≈ -35°,
   * range ≈ 600 m, ≈ 3 s. We first aim at the city's rough ground height, then
   * nudge to the real surface once the tiles under the shop have rendered.
   */
  async shop(shop: Shop, duration?: number): Promise<void> {
    const city = cityByName.get(shop.city);
    const heading = CesiumMath.toRadians(city?.heading ?? 0);
    const offset = new HeadingPitchRange(heading, CesiumMath.toRadians(SHOP_PITCH), SHOP_RANGE);
    const guess = city?.groundHeight ?? 40;
    const sphere = new BoundingSphere(Cartesian3.fromDegrees(shop.lng, shop.lat, guess), 25);
    await this.flyToSphere(sphere, offset, this.duration(duration, SHOP_DURATION));

    const actual = this.sampleGroundHeight(shop);
    if (actual !== undefined && Math.abs(actual - guess) > 20) {
      const refined = new BoundingSphere(Cartesian3.fromDegrees(shop.lng, shop.lat, actual), 25);
      await this.flyToSphere(refined, offset, this.duration(undefined, 0.9));
    }
  }

  private sampleGroundHeight(shop: Shop): number | undefined {
    const scene = this.viewer.scene;
    if (!scene.sampleHeightSupported) return undefined;
    try {
      const h = scene.sampleHeight(Cartographic.fromDegrees(shop.lng, shop.lat), this.excludeFromSampling());
      return Number.isFinite(h) ? h : undefined;
    } catch {
      return undefined;
    }
  }
}
