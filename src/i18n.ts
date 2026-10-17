/**
 * UI strings. English only in Phase 1; JA and RU slot in as extra dictionaries
 * with the same keys. Keep all visible copy here.
 */

const en = {
  tagline: "Japan's best soup shops, in 3D.",
  searchLabel: "Search shops",
  searchPlaceholder: "Search shops, cities, bowls",
  brothsLabel: "Broth",
  citiesLabel: "Jump to a city",
  allJapan: "All Japan",
  trailTitle: "The Tonkotsu Trail",
  trailSub: "3 bowls. One city. A deeper dive.",
  trailStop: "Stop the trail",
  trailStopSub: "Tour in progress. Stop any time.",
  resultCount: "{n} shops",
  resultCountOne: "1 shop",
  noResults: "No shops match. Try another broth or clear the search.",
  credits: "Data & credits",
  close: "Close",
  backToList: "Back to the list",
  signatureBowl: "Signature bowl",
  price: "Price",
  hours: "Hours",
  where: "Where",
  notVerified: "Not verified yet",
  checkBeforeYouGo: "Check before you go",
  unverifiedNote: "We haven't verified this shop's details on the ground yet. Check hours and location before you go.",
  standOutside: "Stand outside",
  buildingInfo: "Building info",
  stepInside: "Step inside",
  openInGoogleMaps: "Open in Google Maps",
  directions: "Directions",
  copyLink: "Copy link",
  linkCopied: "Link copied",
  copyFailed: "Couldn't copy. The link is in the address bar.",
  overview: "Show all of Japan",
  loading: "Warming up the broth…",
  loadingSlow: "Still simmering. Big city, lots of tiles.",
  mapUnavailable: "The map could not load. You can still explore shops, save places, and get directions.",
  fallbackTitle: "3D unavailable",
  fallbackBody: "Showing GSI aerial photos instead.",
  fallbackPhoto: "Aerial",
  fallbackMap: "Map",
  fallbackStyleLabel: "Fallback map style",
  backToMap: "Back to map",
  streetViewOf: "Street View outside {name}",
  streetViewLoading: "Finding the street…",
  streetViewFailed: "Street View couldn't load here.",
  photoBy: "Photo: {credit} ({license})",
  buildingTitle: "Building info",
  buildingHint: "Click a building to see what PLATEAU knows about it.",
  buildingLoading: "Loading building data…",
  buildingUnavailable: "Building data unavailable",
  buildingNone: "No PLATEAU building model for this city yet.",
  buildingNoAttributes: "PLATEAU has no readable details for this building.",
  buildingDataView: "Data view",
  buildingDataViewNote: "Showing PLATEAU buildings over the selected base map.",
  splatTitle: "Step inside",
  splatLoading: "Setting the table…",
  splatPlaceholder: "Placeholder scene. Our own capture of this shop is coming.",
  splatFailed: "This scene couldn't load.",
  skipToList: "Skip to shop search",
} as const;

export type StringKey = keyof typeof en;

const dictionaries: Record<string, Partial<Record<StringKey, string>>> = { en };
let current = "en";

export function setLocale(locale: string): void {
  if (dictionaries[locale]) current = locale;
}

export function t(key: StringKey, vars: Record<string, string | number> = {}): string {
  const template = dictionaries[current]?.[key] ?? en[key];
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}
