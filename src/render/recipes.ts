/**
 * Soupmap Recipes: static pages for the index, browse pages (/recipes/<facet>/<value>/) and
 * each recipe. Readable without JavaScript; src/recipes/main.ts adds filtering, the scaler,
 * units, timers, cook mode, notes and reviews on top.
 */
import { esc } from "../ui/dom.ts";
import { inline, renderMarkdown, tagJapanese } from "../journal/markdown.ts";
import { verticalText } from "./journal.ts";
import { siteHeader } from "./shell.ts";
import { SWAP_HEADINGS, relatedRecipes, type Recipe, type Swaps } from "../recipes/content.ts";
import { FACETS, PAGE_FACETS, REGIONS, TYPES, facetById, facetLabel, type FacetId } from "../recipes/facets.ts";
import { findDurations, formatAmount, formatMinutes, isoDuration } from "../recipes/quantity.ts";
import { buyLink, disclosure, type AffiliateConfig } from "../recipes/pantry.ts";
import type { RecipePlaces } from "../recipes/places.ts";
import { recipeLinkBySlug } from "../recipes/catalog-links.ts";
import { styleHubPath } from "../guides/model.ts";
import { inSentence, sentence } from "./guides.ts";
import { displayName } from "../names.ts";
import { profileUrl } from "./directory.ts";
import { shortlistHash } from "../shortlist.ts";
import type { QualityInput } from "../seo/quality.ts";

export const RECIPES_NAME = "Soupmap Recipes";
const DESCRIPTION = "Soups worth making at home, from shoyu ramen and miso soup to phở, borscht and gumbo. Tested ratios, honest times, and tips from the people who cook them.";
/** The byline on every recipe, and the schema.org author. */
export const AUTHOR = "Soupmap Culinary Team";
/** schema.org recipeCuisine takes the cuisine, not the country. */
const CUISINE: Record<string, string> = {
  Bulgaria: "Bulgarian", China: "Chinese", Cuba: "Cuban", France: "French", Ghana: "Ghanaian", Greece: "Greek", India: "Indian",
  Italy: "Italian", Japan: "Japanese", Malaysia: "Malaysian", Mexico: "Mexican", Morocco: "Moroccan", Philippines: "Filipino",
  Portugal: "Portuguese", "South Korea": "Korean", Spain: "Spanish", Taiwan: "Taiwanese", Thailand: "Thai", Turkey: "Turkish",
  Ukraine: "Ukrainian", "United States": "American", Vietnam: "Vietnamese",
};
export const cuisineOf = (recipe: Pick<Recipe, "country">) => CUISINE[recipe.country] ?? recipe.country;

/** Build-time extras that don't live in the recipe files. */
export interface RecipeExtras {
  /** "Don't feel like cooking?" places, by recipe slug. */
  places?: ReadonlyMap<string, RecipePlaces>;
  /** Affiliate programmes for ingredient "Buy" links; none configured means no links. */
  affiliate?: AffiliateConfig;
}
/** Shown first under "Recommended" when present. */
const FEATURED = ["shoyu-ramen", "miso-soup", "pho-bo", "french-onion-soup", "tom-yum-goong", "tonjiru", "pozole-rojo", "kitsune-udon"];

export interface RecipePage {
  path: string;
  title: string;
  description: string;
  type: "website" | "article";
  main: string;
  recipe?: Recipe;
  /** Facet page: which facet and value. */
  browse?: { facet: FacetId; value: string };
  /** Set by the quality gate; index,follow when absent. */
  robots?: string;
  /** Site path of this page's share card (a recipe's photo wins when it has one). */
  image?: string;
}

export const recipePath = (slug: string) => `/recipes/${slug}/`;
export const browsePath = (facet: string, value: string) => `/recipes/${facet}/${value}/`;

/** Editor's order: featured first, then by region and kind. */
export function orderRecipes(recipes: readonly Recipe[]): Recipe[] {
  const region = new Map(REGIONS.map((r, i) => [r.id, i]));
  const type = new Map(TYPES.map((t, i) => [t.id, i]));
  const featured = (r: Recipe) => { const i = FEATURED.indexOf(r.slug); return i < 0 ? 99 : i; };
  return [...recipes].sort((a, b) => featured(a) - featured(b) || region.get(a.region)! - region.get(b.region)!
    || type.get(a.type)! - type.get(b.type)! || a.title.localeCompare(b.title));
}

const values = (recipe: Recipe, facet: FacetId): string[] => {
  const value = recipe[facet];
  return Array.isArray(value) ? value : [value];
};

/** The photo, or a quiet typographic panel until a licensed photo is added. */
function art(recipe: Recipe, size: "card" | "hero"): string {
  if (recipe.photo) {
    const p = recipe.photo;
    return `<img class="r-photo" src="${esc(size === "card" ? p.thumb : p.src)}" srcset="${esc(p.thumb)} 640w, ${esc(p.src)} 1600w"
      sizes="${size === "card" ? "(max-width: 720px) 100vw, 360px" : "(max-width: 900px) 100vw, 1100px"}" width="${p.width}" height="${p.height}"
      alt="${esc(p.alt)}" ${size === "card" ? 'loading="lazy" ' : 'fetchpriority="high" '}decoding="async" />`;
  }
  const long = [...recipe.mark].length > 4 ? " is-long" : "";
  return `<span class="r-art r-art--${recipe.type}" aria-hidden="true"><span class="r-art__mark j-v${long}" lang="ja">${verticalText(recipe.mark)}</span></span>`;
}

function card(recipe: Recipe, index: number): string {
  const data = FACETS.map(f => `data-${f.id}="${esc(values(recipe, f.id).join(" "))}"`).join(" ");
  const diet = recipe.diet.filter(d => d !== "vegetarian" || !recipe.diet.includes("vegan"));
  return `<article class="r-card" data-slug="${recipe.slug}" ${data} data-total="${recipe.total}" data-active="${recipe.active}"
      data-ingredients="${recipe.ingredientCount}" data-order="${index}" data-title="${esc(recipe.title.toLowerCase())}"
      data-search="${esc([recipe.title, recipe.country, recipe.dek, facetLabel("region", recipe.region), facetLabel("type", recipe.type)].join(" ").toLowerCase())}">
    <a class="r-card__link" href="${recipePath(recipe.slug)}">
      <span class="r-card__art">${art(recipe, "card")}</span>
      <span class="r-card__body">
        <span class="j-eyebrow">${esc(recipe.country)} · ${esc(facetLabel("type", recipe.type))}</span>
        <span class="r-card__title">${tagJapanese(esc(recipe.title))}</span>
        <span class="r-card__dek">${tagJapanese(esc(recipe.dek))}</span>
        <span class="r-card__meta"><span>${formatMinutes(recipe.total)}</span><span>${esc(facetLabel("difficulty", recipe.difficulty))}</span>${diet.map(d => `<span>${esc(facetLabel("diet", d))}</span>`).join("")}<span class="r-card__rating" data-rating-for="${recipe.slug}"></span></span>
      </span>
    </a>
  </article>`;
}

function grid(recipes: readonly Recipe[]): string {
  return `<div class="r-grid" id="r-grid">${recipes.map((r, i) => card(r, i)).join("")}</div>
    <p class="r-empty" id="r-empty" hidden>No recipes match all of those. <button type="button" class="r-link" data-action="clear-filters">Clear filters</button></p>`;
}

/** Links to every browse page: the no-JS way to filter, and what crawlers follow. */
function browseNav(recipes: readonly Recipe[], current?: { facet: FacetId; value: string }): string {
  return `<nav class="r-browse" aria-label="Browse recipes">${PAGE_FACETS.map(id => {
    const facet = facetById.get(id)!;
    const links = facet.values.filter(v => recipes.some(r => values(r, id).includes(v.id))).map(v => {
      const here = current?.facet === id && current.value === v.id;
      return `<a href="${browsePath(id, v.id)}"${here ? ' aria-current="page"' : ""}>${esc(v.label)}</a>`;
    }).join("");
    return `<div class="r-browse__row"><span class="r-browse__label">${esc(facet.label)}</span><div>${links}</div></div>`;
  }).join("")}</nav>`;
}

/** Filters and sorting; hidden until the page script enables them. */
function controls(): string {
  return `<form class="r-controls" id="r-controls" role="search" hidden>
    <label class="r-search"><span class="j-eyebrow">Search</span><input type="search" name="q" placeholder="Ramen, lentils, coconut…" autocomplete="off" /></label>
    <div class="r-filters">${FACETS.map(f => `<label class="r-filter"><span class="j-eyebrow">${esc(f.label)}</span>
      <select name="${f.id}"><option value="">Any</option>${f.values.map(v => `<option value="${v.id}">${esc(v.label)}</option>`).join("")}</select></label>`).join("")}
      <label class="r-filter"><span class="j-eyebrow">Sort</span><select name="sort">
        <option value="">Recommended</option><option value="quick">Quickest</option><option value="easy">Easiest</option>
        <option value="few">Fewest ingredients</option><option value="rated">Top rated</option><option value="reviewed">Most reviewed</option><option value="az">A–Z</option>
      </select></label></div>
    <p class="r-count" id="r-count" aria-live="polite"></p>
  </form>`;
}

export function recipesIndexPage(recipes: readonly Recipe[]): RecipePage {
  const ordered = orderRecipes(recipes);
  const regions = REGIONS.filter(r => recipes.some(x => x.region === r.id)).length;
  return {
    path: "/recipes/", title: `${RECIPES_NAME} — soups worth making at home`, description: DESCRIPTION, type: "website",
    main: `<section class="j-hero r-hero">
        <p class="j-eyebrow">${esc(RECIPES_NAME)}</p>
        <h1 class="j-hero__title">Soups worth making at home</h1>
        <p class="j-hero__ja j-v" lang="ja">${verticalText("汁の台所")}</p>
        <p class="j-lede">From shoyu ramen and miso soup to phở, borscht and gumbo. Tested ratios, honest times, a scaler and timers built in, and tips from the people who cook them.</p>
        <p class="j-hero__count">${recipes.length} recipes · ${regions} regions</p>
      </section>
      ${controls()}
      ${browseNav(recipes)}
      ${grid(ordered)}`,
  };
}

const TIME_NOUN: Record<string, string> = { quick: "soups ready in 30 minutes or less", weeknight: "soups ready in under an hour", afternoon: "soups for a slow afternoon", weekend: "weekend-project soups" };
const listed = (items: readonly string[]) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/** "17 noodle soups from Soupmap Recipes, including shoyu ramen, phở bò and laksa." Each one names its own recipes. */
function browseDescription(facet: FacetId, value: string, info: { label: string; description?: string }, items: readonly Recipe[]): string {
  const label = info.label.toLowerCase();
  const noun = facet === "region" ? `soups from ${info.label === "The Americas" ? "the Americas" : info.label}`
    : facet === "type" ? (/soups|stews/.test(label) ? label : `${label} soups`)
    : facet === "diet" ? `${label} soups` : TIME_NOUN[value] ?? `${label} soups`;
  const examples = items.slice(0, 3).map(r => r.title.replace(/ \(.*\)$/, ""));
  const lead = info.description ? `${info.description.replace(/\.?$/, ".")} ` : "";
  return `${lead}${items.length} ${noun} in ${RECIPES_NAME}, including ${listed(examples)}. Tested recipes with honest timings, a servings scaler and timers.`;
}

export function recipesBrowsePage(facet: FacetId, value: string, recipes: readonly Recipe[]): RecipePage {
  const info = facetById.get(facet)!.values.find(v => v.id === value)!;
  const items = orderRecipes(recipes.filter(r => values(r, facet).includes(value)));
  const heading = facet === "region" ? `Soups from ${info.label === "The Americas" ? "the Americas" : info.label}`
    : facet === "diet" ? `${info.label} soups` : facet === "time" ? `Soups: ${info.label.toLowerCase()}` : info.label;
  const description = browseDescription(facet, value, info, items);
  return {
    path: browsePath(facet, value), title: `${heading} · ${RECIPES_NAME}`, description, type: "website", browse: { facet, value },
    main: `<nav class="j-crumbs" aria-label="Breadcrumb"><a href="/recipes/">Recipes</a><span aria-hidden="true">／</span><span aria-current="page">${esc(heading)}</span></nav>
      <header class="r-browse-head">
        ${info.mark ? `<span class="r-browse-head__mark j-v" lang="ja" aria-hidden="true">${verticalText(info.mark)}</span>` : ""}
        <div><p class="j-eyebrow">${esc(facetById.get(facet)!.label)}</p><h1>${esc(heading)}</h1>
        <p>${esc(description)}</p><p class="j-hero__count">${items.length} ${items.length === 1 ? "recipe" : "recipes"}</p></div>
      </header>
      ${controls()}
      ${browseNav(recipes, { facet, value })}
      ${grid(items)}`,
  };
}

/** Wrap times in step text ("10–12 minutes") as timer targets, outside of HTML tags. */
function timers(html: string): string {
  return html.split(/(<[^>]+>)/).map(part => {
    if (part.startsWith("<")) return part;
    let out = "", last = 0;
    for (const d of findDurations(part)) {
      out += part.slice(last, d.index) + `<span class="r-timer" data-seconds="${d.seconds}">${d.text}</span>`;
      last = d.index + d.text.length;
    }
    return out + part.slice(last);
  }).join("");
}

function ingredientsHtml(recipe: Recipe, affiliate: AffiliateConfig | undefined): string {
  const linked = new Set<string>();
  const lists = recipe.ingredients.map(group => `${group.title ? `<h3>${inline(group.title)}</h3>` : ""}<ul class="r-ings">${group.items.map(item => {
    const amount = item.amount;
    const qty = amount ? `<span class="r-qty" data-min="${amount.min}"${amount.max !== undefined ? ` data-max="${amount.max}"` : ""} data-unit="${amount.unit}">${esc(formatAmount(amount))}</span> ` : "";
    // One link per specialty item: "Buy" beside the first line that needs it.
    const buy = buyLink(item.text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"), affiliate);
    const link = buy && !linked.has(buy.item.id) ? (linked.add(buy.item.id), `<a class="r-buy" href="${esc(buy.href)}" rel="sponsored nofollow noopener" target="_blank" aria-label="Buy ${esc(buy.item.query)} from ${buy.shop} (affiliate link, opens in a new tab)">Buy<span aria-hidden="true"> ↗</span></a>`) : "";
    return `<li class="r-ing"><label><input type="checkbox" class="r-ing__check" /><span class="r-ing__body">${qty}${inline(item.text)}</span></label>${link}</li>`;
  }).join("")}</ul>`).join("");
  return `${linked.size && affiliate ? `<p class="r-buy-note">Get specialty ingredients delivered. ${esc(disclosure(affiliate))}</p>` : ""}${lists}`;
}

function methodHtml(recipe: Recipe): string {
  return recipe.method.map(group => `${group.title ? `<h3>${inline(group.title)}</h3>` : ""}<ol class="r-steps" start="${group.steps[0]!.n}">${group.steps.map(step =>
    `<li class="r-step" id="step-${step.n}"><span class="r-step__n" aria-hidden="true">${step.n}</span><p>${timers(inline(step.text))}</p></li>`).join("")}</ol>`).join("");
}

const bulletList = (items: readonly string[]) => `<ul>${items.map(i => `<li>${inline(i)}</li>`).join("")}</ul>`;

const METERS = [
  ["richness", "Broth richness", "light", "rich"],
  ["spice", "Spice", "no heat", "very hot"],
  ["comfort", "Comfort", "refreshing", "pure comfort"],
] as const;

/** The three editorial 1–10 meters: ten pips, the number, and what the ends mean. */
function metersHtml(recipe: Recipe): string {
  return `<div class="r-meters" aria-label="Soupmap kitchen ratings">${METERS.map(([key, label, low, high]) => {
    const value = recipe.meters[key];
    return `<div class="r-meter"><span class="r-meter__label">${label}</span>
      <span class="r-meter__track" role="img" aria-label="${label}: ${value} out of 10 (1 is ${low}, 10 is ${high})">${Array.from({ length: 10 }, (_, i) => `<i${i < value ? ' class="is-on"' : ""}></i>`).join("")}</span>
      <span class="r-meter__value">${value}<small>/10</small></span></div>`;
  }).join("")}<p class="r-meters__note">Ratings by the ${esc(AUTHOR)}, not readers.</p></div>`;
}

const money = (n: number) => `$${n.toFixed(n % 1 ? 2 : 0)}`;

function scorecard(recipe: Recipe): string {
  const waiting = recipe.total - recipe.prep - recipe.cook;
  return `<dl class="r-facts">
      <div><dt>Prep</dt><dd>${formatMinutes(recipe.prep)}</dd></div>
      <div><dt>Cook</dt><dd>${recipe.cook ? formatMinutes(recipe.cook) : "No cooking"}</dd></div>
      <div><dt>Total</dt><dd>${formatMinutes(recipe.total)}</dd></div>
      <div><dt>Effort</dt><dd>${esc(facetLabel("difficulty", recipe.difficulty))}</dd></div>
      <div><dt>Serves</dt><dd>${recipe.serves}</dd></div>
    </dl>
    ${waiting >= 10 ? `<p class="r-facts__note">The total includes ${formatMinutes(waiting)} of soaking, resting or chilling.</p>` : ""}
    ${recipe.cost ? `<p class="r-cost"><strong>${money(recipe.cost.home)}</strong> a bowl at home <span class="r-cost__vs">vs</span> <strong>about ${money(recipe.cost.out)}</strong> eating out<small>Prices: ${esc(recipe.cost.source)}, ${esc(recipe.cost.checked)}.</small></p>` : ""}
    ${metersHtml(recipe)}`;
}

function secretHtml(recipe: Recipe): string {
  return `<aside class="r-secret" aria-labelledby="secret-title">
      <span class="r-secret__mark j-v" lang="ja" aria-hidden="true">${verticalText("秘訣")}</span>
      <div><p class="j-eyebrow">Restaurant technique</p><h2 id="secret-title">The secret</h2><p>${inline(recipe.secret)}</p></div>
    </aside>`;
}

const SWAP_IDS: Record<keyof Swaps, string> = { glutenFree: "gluten-free", plantBased: "plant-based", highProtein: "high-protein" };

/** Three swap lists: stacked under headings without JavaScript, tabs with it. */
function swapsHtml(recipe: Recipe): string {
  const keys = Object.keys(SWAP_HEADINGS) as (keyof Swaps)[];
  return `<section class="r-swaps" id="swaps" aria-labelledby="swaps-title">
      <h2 id="swaps-title">Swaps</h2>
      <p class="r-muted">Cooking for coeliac disease or an allergy? Check every label: the notes below say which ones matter.</p>
      <div class="r-swaps__tabs" role="tablist" aria-label="Swaps" hidden>${keys.map((key, i) =>
        `<button type="button" role="tab" id="swap-tab-${SWAP_IDS[key]}" aria-controls="swap-${SWAP_IDS[key]}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${SWAP_HEADINGS[key]}</button>`).join("")}</div>
      ${keys.map(key => `<div class="r-swaps__panel" id="swap-${SWAP_IDS[key]}"><h3>${SWAP_HEADINGS[key]}</h3>${bulletList(recipe.swaps[key])}</div>`).join("")}
    </section>`;
}

function placesHtml(recipe: Recipe, places: RecipePlaces | undefined): string {
  if (!places) return "";
  const link = recipeLinkBySlug.get(recipe.slug);
  // A plain udon shop isn't promised to serve kitsune udon: name the cuisine instead.
  const subject = places.style.matchedBy === "cuisine" ? inSentence(places.style) : sentence((link?.title ?? recipe.title).replace(/ \(.*\)$/, ""));
  const how = places.style.matchedBy === "name" || places.style.matchedBy === "broth" ? "whose names point to the style" : `listed as ${inSentence(places.style)} places`;
  return `<section class="r-places" aria-labelledby="places-title">
      <p class="j-eyebrow">Don't feel like cooking?</p>
      <h2 id="places-title">Places serving ${esc(subject)} in Japan</h2>
      <p class="r-muted">From the Soupmap catalog: places ${how}, picked across cities. Listings, not reviews; check before you go.</p>
      <ol class="r-places__list">${places.picks.map(({ shop, guide }) => {
        // Like the catalog cards: a reading first, the shop's own Japanese name beneath.
        const name = displayName(shop, "en");
        return `<li><a class="r-places__name" href="${esc(profileUrl(shop))}">${esc(name)}</a>${shop.nameJa !== name ? ` <span class="r-places__ja" lang="ja">${esc(shop.nameJa)}</span>` : ""}
          <span class="r-places__where">${esc(guide.place.label)}${guide.home ? " · where the style comes from" : ""}</span>
          <a class="r-places__map" href="/map/#${esc(shop.slug)}">Map <span aria-hidden="true">↗</span></a></li>`;
      }).join("")}</ol>
      <p class="r-places__links"><a class="r-button" href="/map/${esc(shortlistHash(places.picks.map(p => p.shop.slug)))}">See them on the map <span aria-hidden="true">↗</span></a>
        <a class="r-button" href="${styleHubPath(places.hub)}">${esc(places.hub.label)} in every city <span aria-hidden="true">→</span></a></p>
      <p class="r-places__guides"><span class="j-eyebrow">City guides</span>${places.guides.map(g => `<a href="${g.path}">${esc(g.style.label)} in ${esc(g.place.municipality.name)} <small>${g.shops.length}</small></a>`).join("")}</p>
    </section>`;
}

export function recipeDetailPage(recipe: Recipe, all: readonly Recipe[], extras: RecipeExtras = {}): RecipePage {
  const region = REGIONS.find(r => r.id === recipe.region)!;
  const diet = recipe.diet.filter(d => d !== "vegetarian" || !recipe.diet.includes("vegan"));
  const related = relatedRecipes(recipe, all);
  const credit = recipe.photo ? `<figcaption class="r-credit">Photo: ${esc(recipe.photo.author)}, <a href="${esc(recipe.photo.licenseUrl)}" rel="license noopener" target="_blank">${esc(recipe.photo.license)}</a>, via <a href="${esc(recipe.photo.source)}" target="_blank" rel="noopener">Wikimedia Commons</a></figcaption>` : "";
  return {
    path: recipePath(recipe.slug), title: `${recipe.title} recipe · ${RECIPES_NAME}`, description: recipe.dek, type: "article", recipe,
    main: `<nav class="j-crumbs" aria-label="Breadcrumb"><a href="/recipes/">Recipes</a><span aria-hidden="true">／</span><a href="${browsePath("region", recipe.region)}">${esc(region.label)}</a><span aria-hidden="true">／</span><span aria-current="page">${tagJapanese(esc(recipe.title))}</span></nav>
      <article class="r-recipe" data-recipe="${recipe.slug}" data-serves="${recipe.serves}">
        <header class="r-head">
          <div class="r-head__text">
            <p class="j-eyebrow">${esc(recipe.country)} · <a href="${browsePath("type", recipe.type)}">${esc(facetLabel("type", recipe.type))}</a></p>
            <h1 class="r-title">${tagJapanese(esc(recipe.title))}</h1>
            <p class="r-dek">${tagJapanese(esc(recipe.dek))}</p>
            <p class="r-byline">By the ${esc(AUTHOR)}</p>
            <p class="r-rating-summary" id="r-rating-summary"></p>
            <section class="r-score" aria-label="At a glance">${scorecard(recipe)}</section>
            ${diet.length ? `<p class="r-diets">${diet.map(d => `<a href="${browsePath("diet", d)}">${esc(facetLabel("diet", d))}</a>`).join("")}</p>` : ""}
            <div class="r-actions" id="r-actions" hidden>
              <button type="button" class="r-button r-button--solid" data-action="cook">Start cooking</button>
              <button type="button" class="r-button" data-action="save" aria-pressed="false">Save</button>
              <button type="button" class="r-button" data-action="print">Print</button>
              <a class="r-button" href="#reviews">Reviews</a>
            </div>
          </div>
          <figure class="r-head__art">${art(recipe, "hero")}${credit}</figure>
        </header>
        <div class="r-headnote">${renderMarkdown(recipe.headnote)}</div>
        ${secretHtml(recipe)}
        <div class="r-body">
          <section class="r-ingredients" aria-labelledby="ingredients-title">
            <div class="r-section-head"><h2 id="ingredients-title">Ingredients</h2>
              <div class="r-scale" id="r-scale" hidden>
                <div class="r-bowls" role="group" aria-label="Batch size">${[1, 2, 4].map(n => `<button type="button" data-bowls="${n}" aria-pressed="${n === 1}" aria-label="${n === 1 ? "As written" : `${n} times the recipe`}, ${recipe.serves * n} servings">${n}×</button>`).join("")}</div>
                <div class="r-stepper" role="group" aria-label="Servings"><button type="button" data-action="fewer" aria-label="Fewer servings">−</button><output id="r-serves" aria-live="polite">${recipe.serves}</output><button type="button" data-action="more" aria-label="More servings">+</button></div>
                <div class="r-units" role="group" aria-label="Units"><button type="button" data-units="us" aria-pressed="false">US <small>cups · oz</small></button><button type="button" data-units="metric" aria-pressed="true">Metric <small>g · ml</small></button></div>
              </div>
            </div>
            <p class="r-scale-note" id="r-scale-note" hidden></p>
            ${ingredientsHtml(recipe, extras.affiliate)}
          </section>
          <section class="r-method" aria-labelledby="method-title">
            <h2 id="method-title">Method</h2>
            <p class="r-method-hint" id="r-method-hint" hidden>Tap a step's number to tick it off, and a time to start a timer.</p>
            ${methodHtml(recipe)}
          </section>
        </div>
        ${swapsHtml(recipe)}
        <section class="r-extra" aria-labelledby="tips-title"><h2 id="tips-title">Tips</h2>${bulletList(recipe.tips)}</section>
        ${recipe.storage.length ? `<section class="r-extra" aria-labelledby="storage-title"><h2 id="storage-title">Make ahead and storage</h2>${bulletList(recipe.storage)}</section>` : ""}
        ${recipe.variations.length ? `<section class="r-extra" aria-labelledby="variations-title"><h2 id="variations-title">Variations</h2>${bulletList(recipe.variations)}</section>` : ""}
        ${recipe.nutrition ? `<section class="r-extra r-nutrition" aria-labelledby="nutrition-title"><h2 id="nutrition-title">Nutrition per serving</h2><dl class="r-facts r-facts--small"><div><dt>Calories</dt><dd>${recipe.nutrition.calories}</dd></div><div><dt>Protein</dt><dd>${recipe.nutrition.protein} g</dd></div><div><dt>Sodium</dt><dd>${recipe.nutrition.sodium.toLocaleString("en-US")} mg</dd></div></dl><p class="r-muted">Source: ${esc(recipe.nutrition.source)}.</p></section>` : ""}
        ${placesHtml(recipe, extras.places?.get(recipe.slug))}
        <section class="r-notes" id="r-notes" aria-labelledby="notes-title" hidden>
          <h2 id="notes-title">Your notes</h2>
          <p class="r-muted">Private, kept in this browser. What you changed, what you'd do next time.</p>
          <textarea id="r-notes-text" rows="4" maxlength="2000" aria-labelledby="notes-title"></textarea>
        </section>
        <section class="r-reviews" id="reviews" aria-labelledby="reviews-title" data-recipe="${recipe.slug}">
          <h2 id="reviews-title">Reviews &amp; cooks' tips</h2>
          <div id="r-reviews-body"><p class="r-muted">Reviews and tips from people who've cooked this appear here.</p></div>
        </section>
        <aside class="r-more" aria-label="More">
          ${recipe.journal || recipe.map ? `<div class="r-more__links">${recipe.journal ? `<a class="r-button" href="/journal/${recipe.journal}/">Read the essay <span aria-hidden="true">→</span></a>` : ""}${recipe.map ? `<a class="r-button" href="${esc(recipe.map)}">${esc(recipe.mapLabel!)} <span aria-hidden="true">↗</span></a>` : ""}</div>` : ""}
          <h2>Cook next</h2>
          <div class="r-grid r-grid--related">${related.map((r, i) => card(r, i)).join("")}</div>
        </aside>
      </article>
      <div class="r-cook" id="r-cook" role="dialog" aria-modal="true" aria-labelledby="r-cook-title" hidden></div>`,
  };
}

export function recipePages(recipes: readonly Recipe[], extras: RecipeExtras = {}): RecipePage[] {
  const browse = PAGE_FACETS.flatMap(facet => facetById.get(facet)!.values
    .filter(v => recipes.some(r => values(r, facet).includes(v.id)))
    .map(v => recipesBrowsePage(facet, v.id, recipes)));
  return [recipesIndexPage(recipes), ...browse, ...orderRecipes(recipes).map(r => recipeDetailPage(r, recipes, extras))];
}

/** What the quality gate needs to judge a recipe page. */
export function recipeQuality(page: RecipePage, recipes: readonly Recipe[]): QualityInput {
  const [data] = structuredData(page, "", recipes);
  const { "@context": _context, ...entity } = data!;
  if (page.recipe) return { path: page.path, kind: "recipe", title: page.title, description: page.description, data: entity,
    ingredients: page.recipe.ingredientCount, steps: page.recipe.stepCount };
  const items = page.browse ? recipes.filter(r => values(r, page.browse!.facet).includes(page.browse!.value)).length : recipes.length;
  return { path: page.path, kind: "listing", title: page.title, description: page.description, data: entity, items };
}

// ── Head, shell and structured data ──────────────────────────────────────────

const plain = (markdown: string) => markdown.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*?([^*]+)\*\*?/g, "$1");
const DIET_SCHEMA: Record<string, string> = { vegan: "VeganDiet", vegetarian: "VegetarianDiet", "gluten-free": "GlutenFreeDiet" };

function structuredData(page: RecipePage, siteUrl: string, recipes: readonly Recipe[]): Record<string, unknown>[] {
  const url = `${siteUrl}${page.path}`;
  const crumbs = (items: { name: string; path: string }[]) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: `${siteUrl}${item.path}` })) });
  const recipe = page.recipe;
  if (recipe) {
    const data: Record<string, unknown> = {
      "@context": "https://schema.org", "@type": "Recipe", name: recipe.title, description: recipe.dek, url,
      datePublished: recipe.date, ...(recipe.updated ? { dateModified: recipe.updated } : {}), author: { "@type": "Organization", name: AUTHOR, url: `${siteUrl}/recipes/` },
      recipeYield: [String(recipe.serves), `${recipe.serves} servings`],
      prepTime: isoDuration(recipe.prep), cookTime: isoDuration(recipe.cook), totalTime: isoDuration(recipe.total),
      recipeCategory: "Soup", recipeCuisine: cuisineOf(recipe),
      keywords: [facetLabel("type", recipe.type), facetLabel("region", recipe.region), ...recipe.diet.map(d => facetLabel("diet", d))].join(", "),
      recipeIngredient: recipe.ingredients.flatMap(g => g.items.map(i => plain(i.amount ? `${formatAmount(i.amount)} ${i.text}` : i.text))),
      // A flat list of steps; a group's name ("For the tare") leads its first step.
      recipeInstructions: recipe.method.flatMap(g => g.steps.map((s, i) => ({ "@type": "HowToStep", position: s.n,
        ...(g.title && i === 0 ? { name: plain(g.title) } : {}), text: plain(s.text), url: `${url}#step-${s.n}` }))),
    };
    const diets = recipe.diet.map(d => DIET_SCHEMA[d]).filter(Boolean).map(d => `https://schema.org/${d}`);
    if (diets.length) data.suitableForDiet = diets;
    if (recipe.photo) data.image = [`${siteUrl}${recipe.photo.src}`];
    if (recipe.nutrition) data.nutrition = { "@type": "NutritionInformation", servingSize: "1 serving",
      calories: `${recipe.nutrition.calories} calories`, proteinContent: `${recipe.nutrition.protein} g`, sodiumContent: `${recipe.nutrition.sodium} mg` };
    // aggregateRating is added when the page is served, from real reviews (server/recipe-pages.ts).
    return [data, crumbs([{ name: "Recipes", path: "/recipes/" }, { name: facetLabel("region", recipe.region), path: browsePath("region", recipe.region) },
      { name: recipe.title, path: page.path }])];
  }
  const items = page.browse ? orderRecipes(recipes.filter(r => values(r, page.browse!.facet).includes(page.browse!.value))) : orderRecipes(recipes);
  const list = { "@context": "https://schema.org", "@type": "CollectionPage", name: page.title, description: page.description, url,
    mainEntity: { "@type": "ItemList", itemListElement: items.map((r, i) => ({ "@type": "ListItem", position: i + 1, url: `${siteUrl}${recipePath(r.slug)}`, name: r.title })) } };
  return page.browse ? [list, crumbs([{ name: "Recipes", path: "/recipes/" }, { name: page.title.split(" · ")[0]!, path: page.path }])] : [list];
}

export function recipesHead(page: RecipePage, siteUrl: string, recipes: readonly Recipe[]): string {
  const url = `${siteUrl}${page.path}`;
  const image = page.recipe?.photo ? `${siteUrl}${page.recipe.photo.src}` : `${siteUrl}${page.image ?? "/social/soupmap-share.png"}`;
  const json = structuredData(page, siteUrl, recipes).map(data =>
    `<script type="application/ld+json"${data["@type"] === "Recipe" ? " data-recipe-schema" : ""}>${JSON.stringify(data).replaceAll("<", "\\u003c")}</script>`).join("");
  return `<meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${esc(page.title)}</title>
    <meta name="description" content="${esc(page.description)}" />
    <link rel="canonical" href="${esc(url)}" /><meta name="robots" content="${esc(page.robots ?? "index,follow")}" />
    <meta name="theme-color" content="#f4efe6" /><meta name="color-scheme" content="light" />
    <meta property="og:type" content="${page.type}" /><meta property="og:site_name" content="Soupmap" />
    <meta property="og:title" content="${esc(page.title)}" /><meta property="og:description" content="${esc(page.description)}" />
    <meta property="og:url" content="${esc(url)}" /><meta property="og:image" content="${esc(image)}" />
    <meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${esc(page.title)}" />
    <meta name="twitter:description" content="${esc(page.description)}" /><meta name="twitter:image" content="${esc(image)}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" /><link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    ${json}`;
}

export function recipesBody(page: RecipePage): string {
  return `<a class="skip-link" href="#main">Skip to content</a>
    ${siteHeader("recipes")}
    <main id="main" class="j-main r-main">${page.main}</main>
    <footer class="j-foot">
      <div class="j-wave" aria-hidden="true"></div>
      <p class="j-foot__ja" lang="ja">汁の台所</p>
      <p>${esc(RECIPES_NAME)} · recipes by the ${esc(AUTHOR)}</p>
      <p class="j-foot__links"><a href="/recipes/">Recipes</a><a href="/guides/">City guides</a><a href="/journal/">Journal</a><a href="/map/">The map</a><a href="/credits/">Data &amp; credits</a></p>
    </footer>`;
}

/** A complete document for generated pages (the index comes from recipes/index.html). */
export function recipesDocument(page: RecipePage, siteUrl: string, recipes: readonly Recipe[], assets: { styles: readonly string[]; scripts: readonly string[] }): string {
  return `<!doctype html><html lang="en"><head>${recipesHead(page, siteUrl, recipes)}
    ${assets.styles.map(href => `<link rel="stylesheet" href="${esc(href)}" />`).join("")}
    ${assets.scripts.map(src => `<script type="module" crossorigin src="${esc(src)}"></script>`).join("")}</head>
    <body class="journal recipes">${recipesBody(page)}</body></html>`;
}
