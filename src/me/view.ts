import { requireSaveAccount } from "../personal-saves.ts";
import { profileUrl } from "../render/directory.ts";
/**
 * The "Your Soupmap" dashboard: plan a trip, keep places, collect the passport, and
 * get suggestions from your own saves. Works without an account; better with one.
 */
import type { Shop } from "../data/shops.ts";
import { BROTHS, BROTH_IDS } from "../data/broths.ts";
import { STYLE_BY_ID } from "../data/styles.ts";
import { cityBySlug } from "../data/cities.ts";
import { HUBS, collectionUrl } from "../data/hubs.ts";
import { isEditorial } from "../data/indexation.ts";
import { displayName } from "../names.ts";
import { esc } from "../ui/dom.ts";
import { markerColor } from "../map/glyph.ts";
import { trackEvent } from "../analytics.ts";
import { localDate } from "../passport.ts";
import { CRAVINGS, areaOptions, placeName, planTrip, type TripInput, type TripPlan } from "./planner.ts";
import { REGIONAL_BOWLS, collectedRegional } from "./regional.ts";
import { bowlOfTheDay, focusCity, nearYourPlaces, readNext, styleGaps } from "./recommend.ts";
import type { SavedTrip, UserData } from "./store.ts";

export interface JournalEntry { slug: string; title: string; dek: string; category: string; mark: string }

export interface DashboardContext {
  shops: readonly Shop[];
  bySlug: ReadonlyMap<string, Shop>;
  data: UserData;
  journal: readonly JournalEntry[];
  /** Local date, YYYY-MM-DD. */
  today?: string;
  origin?: string;
}

const PLANNER_KEY = "soupmap:planner:v1";
const STYLE_BROTHS = BROTH_IDS.filter(id => id !== "other");
const km = (m: number) => m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
const two = (n: number) => String(n).padStart(2, "0");

/** A small plot of places: no basemap, just where they sit relative to each other. */
export function miniMap(shops: readonly Shop[], width = 320, height = 200): string {
  if (!shops.length) return "";
  const lats = shops.map(s => s.lat), lngs = shops.map(s => s.lng);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const scale = Math.cos(midLat * Math.PI / 180);
  const spanX = Math.max((Math.max(...lngs) - Math.min(...lngs)) * scale, 0.01);
  const spanY = Math.max(Math.max(...lats) - Math.min(...lats), 0.01);
  const fit = Math.min((width - 40) / spanX, (height - 40) / spanY);
  const cx = (Math.min(...lngs) + Math.max(...lngs)) / 2, cy = midLat;
  const point = (s: Shop) => [width / 2 + (s.lng - cx) * scale * fit, height / 2 - (s.lat - cy) * fit] as const;
  const grid = [1, 2, 3].map(i => `<line x1="${(width / 4) * i}" y1="0" x2="${(width / 4) * i}" y2="${height}"/><line x1="0" y1="${(height / 4) * i}" x2="${width}" y2="${(height / 4) * i}"/>`).join("");
  const dots = shops.map(s => { const [x, y] = point(s); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${markerColor(s)}"/>`; }).join("");
  return `<svg class="me-minimap" viewBox="0 0 ${width} ${height}" role="img" aria-label="${shops.length} places plotted by location"><g class="me-minimap__grid">${grid}</g><g class="me-minimap__dots">${dots}</g></svg>`;
}

function styleLabel(shop: Shop): string {
  const named = (shop.styles ?? []).map(id => STYLE_BY_ID.get(id)?.label).find(Boolean);
  return named ?? (shop.broth === "other" ? "" : BROTHS[shop.broth].label);
}

function shopLine(shop: Shop): string {
  const ja = shop.nameJa && shop.nameJa !== displayName(shop) ? ` <span class="me-ja" lang="ja">${esc(shop.nameJa)}</span>` : "";
  return `<a class="me-shop" href="${esc(profileUrl(shop))}">${esc(displayName(shop))}</a>${ja}`;
}

export class Dashboard {
  private plan: TripPlan | null = null;
  private input: TripInput;
  private busy = false;
  private currentView = "overview";
  private notice = "";
  private readonly today: string;
  private readonly origin: string;

  constructor(private readonly root: HTMLElement, private readonly ctx: DashboardContext) {
    this.today = ctx.today ?? localDate();
    this.origin = ctx.origin ?? location.origin;
    this.input = this.restoreInput();
    this.currentView = this.viewFromHash(location.hash);
    const navigate=()=>this.openView(location.hash,false,true);
    window.addEventListener('hashchange',navigate);
    window.addEventListener('popstate',navigate);
    document.addEventListener('click', e=>{
      const anchor=(e.target as Element).closest<HTMLAnchorElement>('.me-workspace a[href^="#"]');
      if(!anchor||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
      const hash=anchor.getAttribute('href')!;
      if(!['#overview','#plan','#trips','#places','#passport','#for-you','#data'].includes(hash))return;
      e.preventDefault();this.openView(hash,true,true);
    });
    root.addEventListener("click", e => void this.click(e));
    // Keep choices made before submitting, so a re-render (another tab, an action) doesn't undo them.
    root.addEventListener("change", e => {
      const form = (e.target as Element).closest<HTMLFormElement>("form[data-form=plan]");
      if (form) this.readForm(form);
    });
    root.addEventListener("submit", e => {
      const form = e.target as HTMLFormElement;
      if (form.dataset.form !== "plan") return;
      e.preventDefault();
      this.readForm(form);
      this.makePlan();
    });
  }

  private viewFromHash(hash: string): string {
    const id=hash.replace(/^#/, '');
    if(id==='trips'||id==='plan-result')return 'plan';
    return ['overview','plan','places','passport','for-you','data'].includes(id)?id:'overview';
  }
  /** URL-backed views keep the trip draft intact when switching sections. */
  openView(hash: string, updateUrl=false, focus=false): void {
    this.currentView=this.viewFromHash(hash);
    if(updateUrl){const url=new URL(location.href);url.hash=hash;window.history.pushState(null,'',url);}
    this.root.querySelectorAll<HTMLElement>('[data-workspace-panel]').forEach(panel=>{panel.hidden=panel.dataset.workspacePanel!==this.currentView;});
    this.root.dataset.view=this.currentView;
    document.querySelectorAll<HTMLAnchorElement>('.me-workspace-nav a').forEach(link=>{
      if(this.viewFromHash(link.hash)===this.currentView)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    });
    const title=this.root.querySelector<HTMLElement>('#me-title');
    if(title)title.textContent=({overview:'Your next chapter.',places:'Worth keeping.',plan:'Make a day of it.',passport:'Every bowl, a story.','for-you':'A little inspiration.',data:'Yours to keep.'} as Record<string,string>)[this.currentView]!;
    if(focus){
      const section=this.root.querySelector<HTMLElement>(`[data-workspace-panel="${this.currentView}"]`);
      const target=hash==='#trips'?section?.querySelector<HTMLElement>('#trips'):hash==='#plan-result'?section?.querySelector<HTMLElement>('#plan-result'):section;
      const heading=target?.querySelector<HTMLElement>('h2')??target??title;
      heading?.setAttribute('tabindex','-1');heading?.focus();
    }
  }

  private get data(): UserData { return this.ctx.data; }

  private restoreInput(): TripInput {
    const input = this.storedInput();
    // A city guide's "Plan a day here" links with ?area=city:sapporo or ?area=pref:Kagawa.
    const linked = new URLSearchParams(location.search).get("area");
    return linked && areaOptions(this.ctx.shops).some(a => a.id === linked) ? { ...input, area: linked } : input;
  }

  private storedInput(): TripInput {
    const places = [...this.data.saved, ...Object.keys(this.data.visits)].flatMap(s => this.ctx.bySlug.get(s) ?? []);
    const fallback: TripInput = { area: `city:${focusCity(places)}`, days: 2, perDay: 3, cravings: [], skipChains: true, skipVisited: true, seed: 1 };
    return fallback;
  }

  private readForm(form: HTMLFormElement): void {
    const fd = new FormData(form);
    this.input = {
      area: String(fd.get("area") ?? this.input.area), days: Number(fd.get("days") ?? 2), perDay: Number(fd.get("perDay") ?? 3),
      cravings: fd.getAll("craving").map(String), skipChains: fd.has("skipChains"), skipVisited: fd.has("skipVisited"),
      seed: this.input.seed,
    };
  }

  private makePlan(): void {
    this.currentView="plan";
    this.plan = planTrip(this.ctx.shops, this.input, this.data.saved, new Set(Object.keys(this.data.visits)));
    trackEvent("trip_planned", { days: this.input.days, per_day: this.input.perDay, cravings: this.input.cravings.length,
      area_kind: this.input.area.startsWith("city:") ? "city" : "prefecture", stops: this.plan.days.reduce((n, d) => n + d.stops.length, 0) });
    this.render();
    this.root.querySelector<HTMLElement>("#plan-result")?.focus({ preventScroll: false });
  }

  private planSlugs(): string[] { return this.plan?.days.flatMap(d => d.stops.map(s => s.slug)) ?? []; }

  private async click(e: Event): Promise<void> {
    const button = (e.target as Element).closest<HTMLElement>("[data-action]");
    if (!button || this.busy) return;
    const { action, slug, trip } = button.dataset;
    const section = button.closest("section")?.id;
    const run = async (work: () => Promise<void> | void, message: string) => {
      this.busy = true;
      try { await work(); this.notice = this.data.persistent ? message : "Done for now, but this browser isn't keeping data. Download a copy below."; }
      catch (error) { this.notice = error instanceof Error ? error.message : "That didn't work. Please try again."; }
      finally { this.busy = false; this.render(); this.refocus(section, slug, trip); }
    };
    if (["save-trip","delete-trip","trip-to-account","save","unsave","visit","unvisit"].includes(action ?? "")) {
      try {
        if (!await requireSaveAccount(action?.includes("trip") ? "trip" : action?.includes("visit") ? "visit" : "place")) return;
        if (!this.data.signedIn) await this.data.refreshAccount();
      } catch {this.notice="Your account is unavailable. Please retry; nothing was saved to this device.";this.render();return;}
    }
    switch (action) {
      case "shuffle":
        this.input = { ...this.input, seed: this.input.seed + 1 };
        this.makePlan();
        return;
      case "save-trip": {
        if (!this.plan) return;
        const plan = this.plan;
        await run(async () => {
          await this.data.saveTrip({ name: `${plan.areaLabel} · ${plan.days.length} ${plan.days.length === 1 ? "day" : "days"}`,
            area: plan.area, areaLabel: plan.areaLabel, days: plan.days.map(d => ({ title: d.title, stops: d.stops.map(s => s.slug) })) });
          trackEvent("trip_saved", { to_account: this.data.signedIn, days: plan.days.length });
        }, "Trip saved to your account. Find it here on any device.");
        return;
      }
      case "copy-trip": {
        const url = collectionUrl(this.origin, this.planSlugs());
        await run(async () => {
          if (!navigator.clipboard?.writeText) throw new Error(`Copy this link: ${url}`);
          await navigator.clipboard.writeText(url);
        }, "Link copied. Anyone with it can open these places on the map.");
        return;
      }
      case "delete-trip":
        if (trip) await run(() => this.data.deleteTrip(trip), "Trip deleted from your account.");
        return;
      case "trip-to-account": {
        const saved = this.data.trips.find(t => t.id === trip);
        if (saved) await run(() => this.data.saveTripToAccount(saved), "Trip added to your account as a list.");
        return;
      }
      case "save":
      case "unsave":
        if (slug) await run(() => this.data.setSaved(slug, action === "save"), action === "save" ? "Saved." : "Removed from your saved places.");
        return;
      case "visit":
        if (slug) await run(async () => { await this.data.markVisited(slug); trackEvent("dashboard_visit_marked"); }, "Stamped in your account passport. Add the bowl and a note on the map.");
        return;
      case "unvisit":
        if (slug) await run(() => this.data.unmarkVisited(slug), "Visit removed from your passport.");
        return;
      case "import":
        await run(() => this.data.importDeviceSaves().then(() => undefined),
          "Device saves added to your account. Nothing was replaced.");
        return;
      case "export": {
        const blob = new Blob([this.data.exportJson()], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `soupmap-${this.today}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        return;
      }
    }
  }

  /** Every action re-renders, so put keyboard focus back on the same control, or the notice. */
  private refocus(section: string | undefined, slug: string | undefined, trip: string | undefined): void {
    const scope = (section && this.root.querySelector(`#${section}`)) || this.root;
    const match = slug ? `button[data-slug="${CSS.escape(slug)}"]` : trip ? `button[data-trip="${CSS.escape(trip)}"]` : "";
    const target = (match && scope.querySelector<HTMLElement>(match)) || this.root.querySelector<HTMLElement>(".me-notice");
    target?.focus({ preventScroll: true });
  }

  render(): void {
    const { bySlug } = this.ctx;
    const saved = [...this.data.saved].flatMap(s => bySlug.get(s) ?? []);
    const visited = Object.keys(this.data.visits).flatMap(s => bySlug.get(s) ?? [])
      .sort((a, b) => this.data.visits[b.slug]!.date.localeCompare(this.data.visits[a.slug]!.date));
    const regional = collectedRegional(visited);
    const brothsTried = new Set(visited.map(s => s.broth).filter(b => b !== "other"));
    this.root.innerHTML = [
      this.hero(saved, visited, brothsTried.size, regional.size),
      this.notice ? `<p class="me-notice" role="status" tabindex="-1">${esc(this.notice)}</p>` : "",
      `<div data-workspace-panel="overview">${this.overview(saved,visited)}</div>`,
      `<div data-workspace-panel="plan">${this.planner()}${this.tripsSection()}</div>`,
      `<div data-workspace-panel="places">${this.places(saved)}</div>`,
      `<div data-workspace-panel="passport">${this.passport(visited,brothsTried,regional)}</div>`,
      `<div data-workspace-panel="for-you">${this.forYou(saved,visited)}</div>`,
      `<div data-workspace-panel="data">${this.dataSection()}</div>`,
    ].join("");
    this.openView('#'+this.currentView);
    this.notice = "";
  }

  private hero(saved: Shop[], visited: Shop[], styles: number, regional: number): string {
    const status = this.data.signedIn ? "SIGNED IN" : "EXPLORE FIRST · SAVE WITH AN ACCOUNT";
    const city = saved.length || visited.length ? cityBySlug.get(focusCity([...saved, ...visited]))?.name : undefined;
    const dek = saved.length || visited.length
      ? `${saved.length} ${saved.length === 1 ? "place" : "places"} saved, ${visited.length} visited${city ? `. ${city} is your city so far` : ""}. Plan the next few bowls below.`
      : "Pick a city and what you're craving. We'll lay out a few bowls a day, grouped so you can walk between them, and keep track of where you've eaten.";
    let banner = "";
    if (this.data.account.status === "guest") {
      banner = `<aside class="me-banner"><p><strong>Keep your next great discovery.</strong> Explore and plan freely. Create an account with your email to keep your places, trips and bowl memories across devices.</p>
        <div class="me-actions"><a class="me-button me-button--solid" href="/sign-up">Create an account</a><a class="me-button" href="/sign-in">Sign in</a></div></aside>`;
    } else if (this.data.signedIn && this.data.importable.length) {
      const n = this.data.importable.length;
      banner = `<aside class="me-banner"><p><strong>${n} ${n === 1 ? "place" : "places"} saved on this browser ${n === 1 ? "isn't" : "aren't"} in your account yet.</strong> Importing adds ${n === 1 ? "it" : "them"}; nothing is replaced.</p>
        <div class="me-actions"><button type="button" class="me-button me-button--solid" data-action="import">${n === 1 ? "Import it" : "Import them"}</button></div></aside>`;
    } else if (this.data.signedIn) {
      banner = `<aside class="me-banner me-banner--quiet"><p>Your places, trips and passport are kept privately in your account, ready on any device.</p><a class="me-button" href="/account">Manage lists ↗</a></aside>`;
    }
    return `<section class="me-hero" aria-labelledby="me-title">
      <div class="me-hero__copy">
        <p class="me-label"><span class="me-dot" aria-hidden="true"></span>YOUR SOUPMAP / ${status}</p>
        <h1 id="me-title">Your next chapter.</h1>
        <p class="me-dek">${esc(dek)}</p>

      </div>
      <dl class="me-stats">
        <div><dt>Saved</dt><dd>${saved.length}</dd></div>
        <div><dt>Visited</dt><dd>${visited.length}</dd></div>
        <div><dt>Broth styles</dt><dd>${styles}<small>/${STYLE_BROTHS.length}</small></dd></div>
        <div><dt>Regional bowls</dt><dd>${regional}<small>/${REGIONAL_BOWLS.length}</small></dd></div>
      </dl>
    </section>${banner ? `<details class="me-account-details"><summary>${this.data.signedIn ? "Account & device storage" : "Keep your places across devices"}<span aria-hidden="true">+</span></summary>${banner}</details>` : ""}`;
  }

  private overview(saved: Shop[], visited: Shop[]): string {
    const recent=saved.slice(-4).reverse();
    return `<section id="overview" class="me-overview" aria-label="Your overview">
      <article class="me-next"><p class="me-label">${saved.length?'YOUR NEXT MOVE':'START HERE'}</p><h2>${saved.length?'A few good places.<br>One little adventure.':'Your next favorite<br>starts with a save.'}</h2><p>${saved.length?'Turn your saved places into a day out. Choose a city, set your cravings, and make a route your own.':'Explore the guide and save a place that catches your eye. It will be waiting here when you are ready to go.'}</p><a class="me-button me-button--solid" href="${saved.length?'#plan':'/catalog/'}">${saved.length?'Plan a trip':'Find your first place'} ↗</a></article>
      <article class="me-overview-saved"><header><div><p class="me-label">ON YOUR LIST</p><h2>Keep these in mind.</h2></div><a href="#places">View all ↗</a></header>${recent.length?`<ol>${recent.map((shop,i)=>`<li><span>${two(i+1)}</span><div>${shopLine(shop)}<p class="me-meta">${esc(placeName(shop))}</p></div></li>`).join('')}</ol>`:'<div class="me-quiet-empty"><span lang="ja" aria-hidden="true">湯</span><p>A little room for<br>your next discovery.</p><a href="/catalog/?collection=editorial">Browse our selections ↗</a></div>'}</article>
      <div class="me-overview-links"><a href="#passport"><span>THE PASSPORT</span><strong>${visited.length?`${visited.length} bowls remembered.`:'The places become the story.'}</strong><small>Mark a saved place visited to collect a stamp. ↗</small></a><a href="/journal/"><span>THE JOURNAL</span><strong>A little reading before you go.</strong><small>Soup styles, local context, and the world beyond the bowl. ↗</small></a></div>
    </section>`;
  }

  private planner(): string {
    const areas = areaOptions(this.ctx.shops);
    const option = (a: { id: string; label: string; count: number }) =>
      `<option value="${esc(a.id)}"${a.id === this.input.area ? " selected" : ""}>${esc(a.label)} · ${a.count.toLocaleString()}</option>`;
    const select = (max: number, value: number) =>
      Array.from({ length: max }, (_, i) => `<option value="${i + 1}"${i + 1 === value ? " selected" : ""}>${i + 1}</option>`).join("");
    return `<section id="plan" class="me-section" aria-labelledby="plan-title">
      <header class="me-section__head"><p class="me-label">01 / PLAN A TRIP</p>
        <h2 id="plan-title">A few bowls a day, a short walk apart.</h2>
        <p>Choose a city and your cravings. Your saved places and editor's picks come first; the rest is grouped by neighbourhood.</p></header>
      <form class="me-planner" data-form="plan">
        <label class="me-field me-field--wide">Where
          <select name="area"><optgroup label="Cities">${areas.filter(a => a.id.startsWith("city:")).map(option).join("")}</optgroup>
          <optgroup label="Prefectures">${areas.filter(a => a.id.startsWith("pref:")).map(option).join("")}</optgroup></select></label>
        <label class="me-field">Days<select name="days">${select(7, this.input.days)}</select></label>
        <label class="me-field">Bowls a day<select name="perDay">${select(4, this.input.perDay)}</select></label>
        <fieldset class="me-cravings"><legend>Cravings <small>optional</small></legend>
          ${CRAVINGS.map(c => `<label class="me-chip"><input type="checkbox" name="craving" value="${c.id}"${this.input.cravings.includes(c.id) ? " checked" : ""}><span>${esc(c.label)}</span></label>`).join("")}
        </fieldset>
        <div class="me-planner__options">
          <label class="me-check"><input type="checkbox" name="skipChains"${this.input.skipChains ? " checked" : ""}> Skip chains</label>
          <label class="me-check"><input type="checkbox" name="skipVisited"${this.input.skipVisited ? " checked" : ""}> Skip places I've been</label>
          <button class="me-button me-button--solid" type="submit">Plan my bowls <span aria-hidden="true">→</span></button>
        </div>
      </form>
      <div id="plan-result" class="me-plan" tabindex="-1" aria-live="polite">${this.plan ? this.planHtml(this.plan) : ""}</div>
    </section>`;
  }

  private planHtml(plan: TripPlan): string {
    const { bySlug } = this.ctx;
    if (!plan.days.length) {
      return `<p class="me-empty">No places in ${esc(plan.areaLabel)} match those choices. Try fewer cravings, include chains, or pick a bigger area.</p>`;
    }
    const all = this.planSlugs();
    const days = plan.days.map(day => `<li class="me-day">
      <header><h3>${esc(day.title)}</h3><p>${day.stops.length} ${day.stops.length === 1 ? "bowl" : "bowls"} · about ${km(day.walkMeters)} between stops</p>
        <a href="${esc(collectionUrl(this.origin, day.stops.map(s => s.slug)))}">Map this day <span aria-hidden="true">↗</span></a></header>
      <ol class="me-stops">${day.stops.map((stop, i) => {
        const shop = bySlug.get(stop.slug)!;
        const saved = this.data.saved.has(shop.slug);
        return `<li class="me-stop"><span class="me-stop__n">${two(i + 1)}</span>
          <div class="me-stop__body">${shopLine(shop)}
            <p class="me-meta">${esc(placeName(shop))}${i ? ` · ${km(stop.legMeters)} from the last stop` : ""}</p>
            <ul class="me-tags">${stop.reasons.map(r => `<li>${esc(r)}</li>`).join("")}</ul></div>
          <button type="button" class="me-icon-button" data-action="${saved ? "unsave" : "save"}" data-slug="${esc(shop.slug)}" aria-pressed="${saved}">${saved ? "Saved" : "Save"}</button></li>`;
      }).join("")}</ol></li>`).join("");
    return `<div class="me-plan__summary">
        <p><strong>${esc(plan.areaLabel)}</strong> · ${plan.days.length} ${plan.days.length === 1 ? "day" : "days"} · ${all.length} bowls, chosen from ${plan.poolSize.toLocaleString()} places</p>
        <div class="me-actions"><a class="me-button me-button--solid" href="${esc(collectionUrl(this.origin, all))}">Open on the map <span aria-hidden="true">↗</span></a>
          <button type="button" class="me-button" data-action="save-trip">Save trip</button>
          <button type="button" class="me-button" data-action="shuffle">Shuffle</button>
          <button type="button" class="me-button" data-action="copy-trip">Copy link</button></div></div>
      ${plan.shortfall ? `<p class="me-fine">Fewer bowls than you asked for: not enough places in ${esc(plan.areaLabel)} match. Try fewer cravings or include chains.</p>` : ""}
      <ol class="me-days">${days}</ol>
      <p class="me-fine">Suggestions come from our open catalog and your own saves, not reviews. Menus and opening hours aren't verified, so check before you go. Distances are straight lines.</p>`;
  }

  private tripsSection(): string {
    if (!this.data.trips.length) return `<section id="trips" class="me-section" aria-labelledby="trips-title">
      <header class="me-section__head"><p class="me-label">02 / YOUR TRIPS</p><h2 id="trips-title">A day worth keeping.</h2></header>
      <div class="me-empty"><p>Your saved trips will live here. Choose a city in the planner, then save the route when it feels right.</p><a class="me-button" href="#plan">Plan your first trip ↑</a></div></section>`;
    const trip = (t: SavedTrip) => {
      const stops = t.days.flatMap(d => d.stops);
      return `<li class="me-trip"><div><h3>${esc(t.name)}</h3>
          <p class="me-meta">${t.days.length} ${t.days.length === 1 ? "day" : "days"} · ${stops.length} bowls · saved ${esc(t.created)}${t.listId ? " · also in your account" : ""}</p>
          <details><summary>Stops</summary><ol>${t.days.map(d => `<li><strong>${esc(d.title)}</strong>: ${d.stops.map(s => {
            const shop = this.ctx.bySlug.get(s); return shop ? esc(displayName(shop)) : ""; }).filter(Boolean).join(" → ")}</li>`).join("")}</ol></details></div>
        <div class="me-actions"><a class="me-button" href="${esc(collectionUrl(this.origin, stops))}">Open on the map <span aria-hidden="true">↗</span></a>
          ${this.data.signedIn && !t.listId ? `<button type="button" class="me-button" data-action="trip-to-account" data-trip="${esc(t.id)}">Add to account</button>` : ""}
          <button type="button" class="me-link" data-action="delete-trip" data-trip="${esc(t.id)}">Delete</button></div></li>`;
    };
    return `<section id="trips" class="me-section" aria-labelledby="trips-title">
      <header class="me-section__head"><p class="me-label">02 / YOUR TRIPS</p><h2 id="trips-title">Saved trips</h2></header>
      <ul class="me-trips">${this.data.trips.map(trip).join("")}</ul></section>`;
  }

  private places(saved: Shop[]): string {
    const head = `<header class="me-section__head"><p class="me-label">03 / YOUR PLACES</p><h2 id="places-title">Saved places</h2>
      <p>${this.data.signedIn ? "From your account." : "Create an account to keep your discoveries. Older browser saves can be imported after sign-in."} Mark a place visited to stamp your passport.</p></header>`;
    const lists = this.data.signedIn && this.data.customLists.length ? `<div class="me-lists"><h3>Your lists</h3><ul>${this.data.customLists.map(l =>
      `<li><strong>${esc(l.name)}</strong><span>${l.ids.length}</span>${l.ids.length ? `<a href="${esc(collectionUrl(this.origin, l.ids))}">Open on the map ↗</a>` : ""}</li>`).join("")}</ul>
      <a class="me-link" href="/account">Manage lists ↗</a></div>` : "";
    if (!saved.length) {
      return `<section id="places" class="me-section" aria-labelledby="places-title">${head}
        <div class="me-empty"><a class="me-button me-button--solid" href="/catalog/">Discover your first place ↗</a><p>Nothing saved yet. Save a place in Discover or on the map, save stops from a plan above, or start with a chapter:</p>
        <ul class="me-chapters">${HUBS.map(h => `<li><a href="/map/?hub=${esc(h.slug)}"><span lang="ja">${esc(h.kanji)}</span><strong>${esc(h.title)}</strong><small>${h.stops.length} places · ${esc(h.subtitle)}</small></a></li>`).join("")}</ul></div>${lists}</section>`;
    }
    const shown = saved.slice(0, 40);
    const rows = shown.map(shop => {
      const visit = this.data.visits[shop.slug];
      return `<li class="me-place"><span class="me-swatch" style="--c:${markerColor(shop)}" aria-hidden="true"></span>
        <div>${shopLine(shop)}<p class="me-meta">${esc(placeName(shop))}${styleLabel(shop) ? ` · ${esc(styleLabel(shop))}` : ""}${isEditorial(shop) ? " · Editor's pick" : ""}</p></div>
        <div class="me-place__actions">${visit
          ? `<button type="button" class="me-icon-button is-on" data-action="unvisit" data-slug="${esc(shop.slug)}" aria-pressed="true">Visited ${esc(visit.date)}</button>`
          : `<button type="button" class="me-icon-button" data-action="visit" data-slug="${esc(shop.slug)}" aria-pressed="false">Mark visited</button>`}
          <button type="button" class="me-link" data-action="unsave" data-slug="${esc(shop.slug)}">Remove</button></div></li>`;
    }).join("");
    const cities = [...new Set(saved.map(s => s.city))];
    return `<section id="places" class="me-section" aria-labelledby="places-title">${head}
      <div class="me-places"><aside class="me-places__summary"><p class="me-label">THE COLLECTION</p><strong>${saved.length}</strong><p>places in ${esc(cities.slice(0,3).join(', '))}${cities.length>3?` and ${cities.length-3} more cities`:''}.</p><a class="me-button" href="${esc(collectionUrl(this.origin,saved.map(s=>s.slug)))}">Open on the map ↗</a><a class="me-link" href="/catalog/?collection=saved">Browse all saved places ↗</a></aside>
      <ul class="me-place-list">${rows}</ul></div>
      ${saved.length > shown.length ? `<p class="me-fine">Showing ${shown.length} of ${saved.length}. Use Browse all saved places to search the complete collection.</p>` : ""}
      ${lists}</section>`;
  }

  private passport(visited: Shop[], tried: ReadonlySet<string>, regional: ReadonlyMap<string, Shop>): string {
    const firstFor = (broth: string) => visited.filter(s => s.broth === broth).at(-1);
    const stamps = STYLE_BROTHS.map(id => {
      const shop = firstFor(id);
      return `<li class="me-stamp${tried.has(id) ? " is-on" : ""}"><span lang="ja" aria-hidden="true">${esc(BROTHS[id].labelJa)}</span>
        <strong>${esc(BROTHS[id].label)}</strong><small>${shop ? esc(this.data.visits[shop.slug]!.date) : "Not yet"}</small></li>`;
    }).join("");
    const bowls = REGIONAL_BOWLS.map(b => {
      const shop = regional.get(b.id);
      return `<li class="me-region${shop ? " is-on" : ""}"><span class="me-region__mark" lang="ja" aria-hidden="true">${esc(b.nameJa)}</span>
        <div><strong>${esc(b.name)}</strong><small>${shop ? `Collected at ${esc(displayName(shop))}` : esc(b.where)}</small></div>
        <span class="me-region__links"><a href="/journal/${esc(b.journal)}/">Read</a><a href="/map/?q=${esc(encodeURIComponent(b.search).replace(/%20/g, "+"))}">Find</a></span></li>`;
    }).join("");
    const recent = visited.slice(0, 5).map(shop => {
      const v = this.data.visits[shop.slug]!;
      return `<li><time datetime="${esc(v.date)}">${esc(v.date)}</time>${shopLine(shop)}${v.bowl ? `<p class="me-meta">${esc(v.bowl)}</p>` : ""}${v.note ? `<p class="me-note">“${esc(v.note.slice(0, 160))}”</p>` : ""}</li>`;
    }).join("");
    return `<section id="passport" class="me-section" aria-labelledby="passport-title">
      <header class="me-section__head"><p class="me-label">04 / PASSPORT</p><h2 id="passport-title">Collect the bowls, not the points.</h2>
        <p>Every place you mark visited stamps a broth style, and counts toward Japan's regional bowls. Keep your passport privately in your account.</p></header>
      <div class="me-passport">
        <div><h3>Broth styles <small>${tried.size}/${STYLE_BROTHS.length}</small></h3><ul class="me-stamps">${stamps}</ul>
          ${recent ? `<h3>Recent visits</h3><ul class="me-recent">${recent}</ul>` : ""}
          <a class="me-button" href="/map/?open=passport">Open the full passport <span aria-hidden="true">↗</span></a></div>
        <div><h3>Regional bowls <small>${regional.size}/${REGIONAL_BOWLS.length}</small></h3><ul class="me-regions">${bowls}</ul></div>
      </div></section>`;
  }

  private forYou(saved: Shop[], visited: Shop[]): string {
    const places = [...saved, ...visited];
    const exclude = new Set(places.map(s => s.slug));
    const today = bowlOfTheDay(this.ctx.shops, this.today);
    const near = nearYourPlaces(this.ctx.shops, places, exclude);
    const gaps = styleGaps(this.ctx.shops, visited, focusCity(places));
    const journal = new Map(this.ctx.journal.map(j => [j.slug, j]));
    const read = readNext(places, new Set(journal.keys())).flatMap(s => journal.get(s) ?? []);
    const cards = [
      today ? `<article class="me-card me-card--today"><p class="me-label">BOWL OF THE DAY / ${esc(this.today)}</p>
        <h3>${shopLine(today)}</h3><p class="me-meta">${esc(placeName(today))}, ${esc(today.city)}${styleLabel(today) ? ` · ${esc(styleLabel(today))}` : ""}</p>
        ${isEditorial(today) ? `<p>${esc(today.blurb)}</p>` : ""}
        <div class="me-actions"><a class="me-button" href="/map/#${esc(today.slug)}">See it on the map ↗</a>
        ${this.data.saved.has(today.slug) ? "" : `<button type="button" class="me-button" data-action="save" data-slug="${esc(today.slug)}">Save</button>`}</div></article>` : "",
      near.length ? `<article class="me-card"><p class="me-label">NEAR YOUR PLACES</p><ul>${near.map(n =>
        `<li>${shopLine(n.shop)}<p class="me-meta">${km(n.meters)} from ${esc(displayName(n.anchor))}${styleLabel(n.shop) ? ` · ${esc(styleLabel(n.shop))}` : ""}</p></li>`).join("")}</ul></article>` : "",
      gaps.length ? `<article class="me-card"><p class="me-label">STYLES TO COLLECT</p><ul>${gaps.map(g =>
        `<li><strong>${esc(BROTHS[g.broth].label)} <span lang="ja">${esc(BROTHS[g.broth].labelJa)}</span></strong><p class="me-meta">${g.shops.map(s =>
          `<a href="/map/#${esc(s.slug)}">${esc(displayName(s))}</a>`).join(" · ")}</p></li>`).join("")}</ul></article>` : "",
      read.length ? `<article class="me-card"><p class="me-label">READ NEXT</p><ul>${read.map(j =>
        `<li><a class="me-shop" href="/journal/${esc(j.slug)}/">${esc(j.title)}</a><p class="me-meta">${esc(j.dek)}</p></li>`).join("")}</ul></article>` : "",
    ].filter(Boolean).join("");
    return `<section id="for-you" class="me-section" aria-labelledby="foryou-title">
      <header class="me-section__head"><p class="me-label">05 / FOR YOU</p><h2 id="foryou-title">From your places, not from tracking.</h2>
        <p>Worked out in your browser from what you saved and visited.</p></header>
      <div class="me-foryou">${cards}</div></section>`;
  }

  private dataSection(): string {
    return `<section id="data" class="me-section me-data" aria-labelledby="data-title"><header class="me-section__head"><p class="me-label">YOUR DATA</p>
      <h2 id="data-title">Yours to keep.</h2></header>
      <p>New places, trips and passport visits are saved to your account, not this device. Any older browser saves stay untouched until you explicitly import them.</p>
      <button type="button" class="me-button" data-action="export">Download my data (JSON)</button></section>`;
  }
}
