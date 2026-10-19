export interface HistoryMapPlace {
  id: string;
  nameEn: string;
  lat: number;
  lng: number;
}

/** Broad central-Tokyo pilot bounds, not an administrative boundary or completeness claim. */
export function isTokyoHistoryLocation(location: { lat: number; lng: number }): boolean {
  return Number.isFinite(location.lat) && Number.isFinite(location.lng)
    && location.lat >= 35.55 && location.lat <= 35.82
    && location.lng >= 139.55 && location.lng <= 139.92;
}
