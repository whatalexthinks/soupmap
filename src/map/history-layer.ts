/** Small opt-in overlay. Never reads tile attributes or derives historical facts. */
import { Cartesian2, Cartesian3, Color, DistanceDisplayCondition, HeightReference, LabelStyle, type Entity } from "cesium";
import type { HistoryMapPlace } from "../history-coverage.ts";
import type { MapEngineImpl } from "./engine.ts";

export class HistoryLayer {
  private entities: Entity[] = [];

  constructor(private readonly engine: MapEngineImpl, onPick: (id: string) => void) {
    engine.addClickHandler(picked => {
      const entity = (picked as { id?: Entity } | undefined)?.id;
      const id = entity?.id;
      if (typeof id !== "string" || !id.startsWith("history:")) return false;
      if (!this.entities.some(entry => entry === entity)) return false;
      onPick(id.slice("history:".length));
      return true;
    });
  }

  setPlaces(places: readonly HistoryMapPlace[]): void {
    const viewer = this.engine.viewer;
    for (const entity of this.entities) viewer.entities.remove(entity);
    this.entities = places.slice(0, 4).map(place => viewer.entities.add({
      id: `history:${place.id}`,
      position: Cartesian3.fromDegrees(place.lng, place.lat),
      point: {
        pixelSize: 12,
        color: Color.fromCssColorString("#8fc9b4"),
        outlineColor: Color.fromCssColorString("#173b30"),
        outlineWidth: 2,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new DistanceDisplayCondition(0, 25000),
      },
      label: {
        text: place.nameEn,
        font: "13px sans-serif",
        fillColor: Color.WHITE,
        outlineColor: Color.fromCssColorString("#173b30"),
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cartesian2(0, -24),
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new DistanceDisplayCondition(0, 12000),
      },
    }));
    viewer.scene.requestRender();
  }
}
