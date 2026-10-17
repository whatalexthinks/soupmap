/**
 * The /credits page body, rendered at build time from src/sources.ts and shops.json.
 * Pure string templates: no DOM, so the Vite plugin can run it in Node.
 */
import type { Shop } from "../data/schema.ts";
import { KIND_LABELS, SOURCES, STATUS_LABELS, type Source, type SourceKind } from "../sources.ts";
import { esc } from "../ui/dom.ts";

const KIND_ORDER: SourceKind[] = ["map", "imagery", "poi", "reference", "library", "font", "service"];

function sourceHtml(s: Source): string {
  const nameJa = s.nameJa ? ` <span class="ja" lang="ja">${esc(s.nameJa)}</span>` : "";
  const notes = s.notes?.length ? `<ul class="notes">${s.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "";
  return `<article class="source" id="${esc(s.id)}">
    <header>
      <h3><a href="${esc(s.url)}" rel="noopener">${esc(s.name)}</a>${nameJa}</h3>
      <span class="status status--${esc(s.status)}">${esc(STATUS_LABELS[s.status])}</span>
    </header>
    <p class="provider">${esc(s.provider)}</p>
    <dl>
      <dt>Used for</dt><dd>${esc(s.usedFor)}</dd>
      <dt>License</dt><dd><a href="${esc(s.licenseUrl)}" rel="noopener">${esc(s.license)}</a></dd>
      <dt>Attribution</dt><dd><a href="${esc(s.attributionUrl)}" rel="noopener"${/[　-鿿]/.test(s.attribution) ? ' lang="ja"' : ""}>${esc(s.attribution)}</a></dd>
      <dt>Last checked</dt><dd><time datetime="${esc(s.checked)}">${esc(s.checked)}</time></dd>
    </dl>
    ${notes}
  </article>`;
}

function shopDataHtml(shops: readonly Shop[]): string {
  const count = (source: Shop["dataSource"]) => shops.filter((s) => s.dataSource === source).length;
  const overture = count("overture");
  const osm = count("osm");
  const manual = count("manual");
  const unverified = shops.filter((s) => !s.verified).length;
  const odbl = osm
    ? `<p><strong>${osm} shop record(s) are derived from OpenStreetMap.</strong> Our shop dataset is therefore a derivative database under the <a href="https://opendatacommons.org/licenses/odbl/1-0/">Open Database License (ODbL)</a>, © OpenStreetMap contributors. Our editorial content (blurbs, videos, photos) is not part of that database.</p>`
    : `<p>No shop record is derived from OpenStreetMap. OSM data (ODbL) is used only as review leads.</p>`;
  return `<section class="block" aria-labelledby="shops-heading">
    <h2 id="shops-heading">Where shop data comes from</h2>
    <p><a href="/data/open-shops.json.gz" download>Download the open-data catalog (gzip JSON)</a>. Each record includes its Overture ID and source licenses. This is a catalog of reported locations, not a complete or independently verified directory.</p>
    <p>We list ${shops.length} shops. Locations: ${overture} seeded from <a href="#overture-places">Overture Maps Places</a>, ${osm} from <a href="#osm-overpass">OpenStreetMap</a>, ${manual} entered by hand. ${unverified === shops.length ? "None" : shops.length - unverified} ${shops.length - unverified === 1 ? "has" : "have"} been verified on the ground so far, and every card says so.</p>
    ${odbl}
    <p>Shop selection is editorial. We sometimes consult well-known guides to decide which names to include, but we never copy their text, ratings, photos or data, and we don't scrape Tabelog or Google Maps. Blurbs are written by us. Broth-style background is paraphrased from <a href="#wikipedia-ramen">Wikipedia</a>.</p>
  </section>`;
}

function mapTermsHtml(): string {
  return `<section class="block" aria-labelledby="terms-heading">
    <h2 id="terms-heading">Map terms</h2>
    <p>The 3D map and Street View come from Google Maps Platform. By using them you agree to the
    <a href="https://policies.google.com/terms">Google Terms of Service</a> and the
    <a href="https://www.google.com/help/terms_maps/">Google Maps/Google Earth Additional Terms of Service</a>,
    and the <a href="https://policies.google.com/privacy">Google Privacy Policy</a> applies to Google's part of the service.</p>
  </section>`;
}

export function creditsHtml(shops: readonly Shop[]): string {
  const sections = KIND_ORDER.map((kind) => {
    const items = SOURCES.filter((s) => s.kind === kind);
    if (!items.length) return "";
    return `<section class="block" aria-labelledby="kind-${kind}">
      <h2 id="kind-${kind}">${esc(KIND_LABELS[kind])}</h2>
      ${items.map(sourceHtml).join("")}
    </section>`;
  }).join("");
  return shopDataHtml(shops) + mapTermsHtml() + sections;
}
