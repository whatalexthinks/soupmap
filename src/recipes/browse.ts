/**
 * Recipe index and browse pages: filter by any facet, search, and sort, with the state in the
 * URL (/recipes/?region=japan&diet=vegan&sort=quick) so a filtered view can be shared.
 * The static page already lists every recipe; this only hides and reorders cards.
 */
import { FACETS, type FacetId } from "./facets.ts";
import { savedRecipes } from "./storage.ts";

export type Ratings = Record<string, { average: number; count: number }>;

const DIFFICULTY = { easy: 0, medium: 1, project: 2 } as Record<string, number>;

export async function loadRatings(fetcher: typeof fetch = fetch): Promise<Ratings | null> {
  try {
    const response = await fetcher("/api/recipes/ratings", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return null;
    const data = await response.json() as { ratings?: Ratings };
    return data.ratings ?? null;
  } catch { return null; }
}

/** "★ 4.6 · 12" for cards. */
export function ratingText(rating?: { average: number; count: number }): string {
  return rating && rating.count ? `★ ${rating.average.toFixed(1)} · ${rating.count}` : "";
}

export function setupBrowse(root: Document, ratings: Promise<Ratings | null>): void {
  const form = root.querySelector<HTMLFormElement>("#r-controls");
  const grid = root.querySelector<HTMLElement>("#r-grid");
  if (!form || !grid) return;
  const cards = [...grid.querySelectorAll<HTMLElement>(".r-card")];
  const count = root.querySelector<HTMLElement>("#r-count")!;
  const empty = root.querySelector<HTMLElement>("#r-empty")!;
  let scores: Ratings = {};
  const saved = savedRecipes();

  // A browse page (/recipes/region/japan/) only lists its own recipes; hide that filter.
  const locked = location.pathname.match(/^\/recipes\/([a-z-]+)\/([a-z-]+)\/$/);
  if (locked) form.querySelector<HTMLElement>(`[name="${locked[1]}"]`)?.closest("label")?.setAttribute("hidden", "");
  if (saved.size) {
    form.querySelector(".r-filters")!.insertAdjacentHTML("beforeend",
      `<label class="r-filter r-filter--check"><input type="checkbox" name="saved" value="1" /> Saved (${saved.size})</label>`);
  }

  const params = new URLSearchParams(location.search);
  for (const element of form.elements) {
    const field = element as HTMLInputElement | HTMLSelectElement;
    if (!field.name) continue;
    const value = params.get(field.name);
    if (value === null) continue;
    if (field instanceof HTMLInputElement && field.type === "checkbox") field.checked = value === "1";
    else if (field instanceof HTMLSelectElement ? [...field.options].some(o => o.value === value) : true) field.value = value;
  }

  const apply = (updateUrl: boolean) => {
    const data = new FormData(form);
    const query = String(data.get("q") ?? "").trim().toLowerCase();
    const filters = FACETS.map(f => [f.id, String(data.get(f.id) ?? "")] as [FacetId, string]).filter(([, v]) => v);
    const onlySaved = data.get("saved") === "1";
    const sort = String(data.get("sort") ?? "");
    let shown = 0;
    for (const card of cards) {
      const match = filters.every(([facet, value]) => (card.dataset[facet] ?? "").split(" ").includes(value))
        && (!query || query.split(/\s+/).every(word => card.dataset.search!.includes(word)))
        && (!onlySaved || saved.has(card.dataset.slug!));
      card.hidden = !match;
      if (match) shown++;
    }
    const n = (card: HTMLElement, key: string) => Number(card.dataset[key]);
    const rating = (card: HTMLElement) => scores[card.dataset.slug!];
    const order: Record<string, (a: HTMLElement, b: HTMLElement) => number> = {
      quick: (a, b) => n(a, "total") - n(b, "total"),
      easy: (a, b) => DIFFICULTY[a.dataset.difficulty!]! - DIFFICULTY[b.dataset.difficulty!]! || n(a, "active") - n(b, "active"),
      few: (a, b) => n(a, "ingredients") - n(b, "ingredients"),
      rated: (a, b) => (rating(b)?.average ?? 0) - (rating(a)?.average ?? 0) || (rating(b)?.count ?? 0) - (rating(a)?.count ?? 0),
      reviewed: (a, b) => (rating(b)?.count ?? 0) - (rating(a)?.count ?? 0),
      az: (a, b) => a.dataset.title!.localeCompare(b.dataset.title!),
    };
    const byOrder = (a: HTMLElement, b: HTMLElement) => n(a, "order") - n(b, "order");
    const compare = order[sort];
    grid.append(...[...cards].sort((a, b) => (compare?.(a, b) || 0) || byOrder(a, b)));
    count.textContent = shown === cards.length ? `${cards.length} recipes` : `${shown} of ${cards.length} recipes`;
    empty.hidden = shown > 0;
    if (updateUrl) {
      const url = new URL(location.href);
      for (const key of ["q", "sort", "saved", ...FACETS.map(f => f.id)]) url.searchParams.delete(key);
      if (query) url.searchParams.set("q", query);
      for (const [facet, value] of filters) url.searchParams.set(facet, value);
      if (onlySaved) url.searchParams.set("saved", "1");
      if (sort) url.searchParams.set("sort", sort);
      history.replaceState(history.state, "", url);
    }
  };

  form.hidden = false;
  form.addEventListener("input", () => apply(true));
  form.addEventListener("change", () => apply(true));
  form.addEventListener("submit", e => { e.preventDefault(); apply(true); });
  root.addEventListener("click", e => {
    if (!(e.target as Element).closest("[data-action=clear-filters]")) return;
    form.reset();
    apply(true);
  });
  apply(false);

  void ratings.then(result => {
    if (!result) return;
    scores = result;
    apply(false);
  });
}
