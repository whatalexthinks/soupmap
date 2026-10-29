import { renderSiteShell } from "../src/render/shell.ts";
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { SHOPS, shopBySlug } from '../src/data/shops.ts';
import { CITIES } from '../src/data/cities.ts';
import { distanceMeters } from '../src/discovery.ts';
import { cuisineOf } from '../src/cuisines.ts';
import { loadJournal } from '../src/journal/load.ts';
import { areaOptions, inArea, planTrip, type TripInput } from '../src/me/planner.ts';
import { REGIONAL_BOWLS, collectedRegional } from '../src/me/regional.ts';
import { bowlOfTheDay, nearYourPlaces, readNext, styleGaps } from '../src/me/recommend.ts';
import { TRIPS_KEY, UserData, loadAccount, parseTrips } from '../src/me/store.ts';
import { Dashboard } from '../src/me/view.ts';

const valid = new Set(shopBySlug.keys());
const shop = (slug: string) => shopBySlug.get(slug)!;
const tokyo: TripInput = { area: 'city:tokyo', days: 3, perDay: 3, cravings: [], skipChains: true, skipVisited: true, seed: 1 };

function memory(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return { items, getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => { items.set(k, v); } };
}

test('a trip plan fills every day with distinct, walkable stops in the chosen city', () => {
  const plan = planTrip(SHOPS, tokyo);
  assert.equal(plan.days.length, 3);
  assert.equal(plan.shortfall, false);
  const slugs = plan.days.flatMap(d => d.stops.map(s => s.slug));
  assert.equal(slugs.length, 9);
  assert.equal(new Set(slugs).size, 9);
  for (const day of plan.days) {
    assert.match(day.title, /^Day \d · /);
    assert.equal(day.stops[0]!.legMeters, 0);
    for (const stop of day.stops) {
      assert.equal(shop(stop.slug).city, 'Tokyo');
      assert.equal(shop(stop.slug).chain, undefined, 'chains are skipped');
      assert.ok(stop.legMeters <= 6000, 'a dense city plans walkable days');
      assert.ok(stop.reasons.length >= 1);
    }
  }
  // Editor's picks lead: several of Tokyo's Soupmap selections open the days.
  assert.ok(slugs.filter(slug => !slug.startsWith('open-')).length >= 3);
  // Each day starts somewhere new.
  const starts = plan.days.map(d => shop(d.stops[0]!.slug));
  assert.ok(distanceMeters(starts[0]!, starts[1]!) > 1500 && distanceMeters(starts[1]!, starts[2]!) > 1500);
});

test('trip plans are repeatable for a seed and change when shuffled', () => {
  const slugs = (seed: number) => planTrip(SHOPS, { ...tokyo, seed }).days.flatMap(d => d.stops.map(s => s.slug));
  assert.deepEqual(slugs(4), slugs(4));
  assert.notDeepEqual(slugs(4), slugs(5));
});

test('cravings, saves and visits shape the plan', () => {
  const tsukemen = planTrip(SHOPS, { ...tokyo, cravings: ['tsukemen'] });
  const stops = tsukemen.days.flatMap(d => d.stops.map(s => shop(s.slug)));
  assert.ok(stops.filter(s => s.broth === 'tsukemen' || s.styles?.includes('tsukemen')).length >= 7);

  const open = SHOPS.find(s => s.city === 'Tokyo' && !s.chain && s.slug.startsWith('open-') && s.styles?.includes('niboshi'))!;
  const saved = planTrip(SHOPS, tokyo, new Set([open.slug]));
  const stop = saved.days.flatMap(d => d.stops).find(s => s.slug === open.slug);
  assert.ok(stop, 'a saved shop in the area is planned');
  assert.ok(stop.reasons.includes('You saved it'));

  const visited = planTrip(SHOPS, tokyo, new Set(), new Set(['afuri-ebisu']));
  assert.equal(visited.days.flatMap(d => d.stops).some(s => s.slug === 'afuri-ebisu'), false);
});

test('a plan never repeats a reason and reports when an area runs short', () => {
  for (const day of planTrip(SHOPS, { ...tokyo, cravings: ['tsukemen'] }).days) {
    for (const stop of day.stops) assert.equal(new Set(stop.reasons).size, stop.reasons.length);
  }
  const none = planTrip(SHOPS, { ...tokyo, area: 'pref:Atlantis' });
  assert.deepEqual(none.days, []);
  assert.equal(none.shortfall, true);
  assert.equal(none.poolSize, 0);
});

test('area options list the featured cities first, then prefectures, and match their shops', () => {
  const areas = areaOptions(SHOPS);
  assert.deepEqual(areas.slice(0, CITIES.length).map(a => a.id), CITIES.map(c => `city:${c.slug}`));
  const prefectures = areas.slice(CITIES.length);
  assert.ok(prefectures.length > 20);
  assert.ok(prefectures.every(a => a.id.startsWith('pref:') && a.count >= 25));
  const kagawa = areas.find(a => a.id === 'pref:Kagawa')!;
  assert.equal(SHOPS.filter(s => inArea(s, 'pref:Kagawa')).length, kagawa.count);
  // Curated records carry a city, not a prefecture; they still belong to it.
  assert.ok(inArea(shop('ichiran-nakasu'), 'pref:Fukuoka'));
  assert.ok(inArea(shop('afuri-ebisu'), 'city:tokyo'));
});

test('regional bowls link to real journal articles and collect from matching visits', () => {
  const articles = new Set(loadJournal().map(a => a.slug));
  for (const bowl of REGIONAL_BOWLS) assert.ok(articles.has(bowl.journal), `${bowl.id} links to ${bowl.journal}`);
  assert.equal(new Set(REGIONAL_BOWLS.map(b => b.id)).size, REGIONAL_BOWLS.length);
  for (const bowl of REGIONAL_BOWLS) assert.ok(SHOPS.some(s => bowl.matches(s)), `${bowl.id} can be collected somewhere`);
  // A regional bowl is that bowl, not anything eaten in the region.
  const okinawa = REGIONAL_BOWLS.find(b => b.id === 'okinawa')!;
  assert.equal(SHOPS.some(s => s.prefecture === 'Okinawa' && cuisineOf(s) === 'udon' && okinawa.matches(s)), false);
  assert.equal(REGIONAL_BOWLS.find(b => b.id === 'kitakata')!.matches(SHOPS.find(s => s.city === 'Kitakata' && cuisineOf(s) === 'soba')!), false);
  const collected = collectedRegional([shop('ichiran-nakasu'), shop('sumire-susukino'), shop('dotonbori-imai')]);
  assert.deepEqual([...collected.keys()].sort(), ['hakata', 'sapporo']);
  assert.equal(collected.get('hakata')!.slug, 'ichiran-nakasu');
});

test('suggestions come from the visitor\'s own places', () => {
  const anchors = [shop('afuri-ebisu')];
  const near = nearYourPlaces(SHOPS, anchors, new Set(['afuri-ebisu']));
  assert.ok(near.length > 0);
  for (const n of near) {
    assert.notEqual(n.shop.slug, 'afuri-ebisu');
    assert.ok(n.meters <= 800);
    assert.equal(n.anchor.slug, 'afuri-ebisu');
  }
  const gaps = styleGaps(SHOPS, [shop('afuri-ebisu')], 'tokyo');
  assert.ok(gaps.length > 0);
  assert.ok(gaps.every(g => g.broth !== 'shio' && g.shops.every(s => s.city === 'Tokyo' && !s.chain)));

  const available = new Set(loadJournal().map(a => a.slug));
  const reading = readNext([shop('ichiran-nakasu')], available);
  assert.equal(reading[0], 'hakata-tonkotsu');
  assert.equal(reading.length, 3);
  assert.equal(readNext([], available).length, 3, 'newcomers get starter articles');

  const today = bowlOfTheDay(SHOPS, '2026-10-19');
  assert.equal(today?.slug, bowlOfTheDay(SHOPS, '2026-10-19')?.slug);
  const week = new Set(['13', '14', '15', '16', '17', '18', '19'].map(d => bowlOfTheDay(SHOPS, `2026-10-${d}`)?.slug));
  assert.ok(week.size >= 5, 'the bowl of the day changes day to day');
});

test('saved trips drop unknown shops and malformed entries', () => {
  const raw = JSON.stringify([
    { id: 't1', name: 'Tokyo', area: 'city:tokyo', areaLabel: 'Tokyo', created: '2026-10-01',
      days: [{ title: 'Day 1', stops: ['afuri-ebisu', 'not-a-shop'] }, { title: 'Day 2', stops: ['not-a-shop'] }] },
    { id: 't2', name: 'Broken', area: 'city:tokyo', days: 'nope' },
    null, 'text',
  ]);
  const trips = parseTrips(raw, valid);
  assert.equal(trips.length, 1);
  assert.deepEqual(trips[0]!.days, [{ title: 'Day 1', stops: ['afuri-ebisu'] }]);
  for (const bad of ['{', 'null', '{}', '"x"']) assert.deepEqual(parseTrips(bad, valid), []);
});

test('account status: 401 is a guest; errors, HTML and offline are unavailable', async () => {
  const reply = (status: number, body: string, type = 'application/json') => async () =>
    new Response(body, { status, headers: { 'content-type': type } });
  assert.deepEqual(await loadAccount(reply(401, '{"error":"Sign in"}')), { status: 'guest', lists: [] });
  const lists = [{ id: 's', name: 'Saved', kind: 'saved', ids: ['afuri-ebisu'] }];
  assert.deepEqual(await loadAccount(reply(200, JSON.stringify({ lists }))), { status: 'signed-in', lists });
  assert.equal((await loadAccount(reply(500, '{}'))).status, 'unavailable');
  assert.equal((await loadAccount(reply(200, '<!doctype html>', 'text/html'))).status, 'unavailable');
  assert.equal((await loadAccount(async () => { throw new TypeError('offline'); })).status, 'unavailable');
});

test('device data: saves, stamps and trips persist; a refused write is reported', async () => {
  const storage = memory({ 'soupmap:saved:v1': JSON.stringify(['afuri-ebisu', 'not-a-shop']) });
  const data = new UserData(valid, storage);
  assert.deepEqual([...data.saved], ['afuri-ebisu']);
  await data.setSaved('ginza-kagari', true);
  assert.deepEqual(JSON.parse(storage.items.get('soupmap:saved:v1')!), ['afuri-ebisu', 'ginza-kagari']);
  data.markVisited('afuri-ebisu', '2026-10-01');
  assert.equal(JSON.parse(storage.items.get('soupmap:passport:v1')!)['afuri-ebisu'].date, '2026-10-01');
  const trip = data.saveTrip({ name: 'Tokyo · 1 day', area: 'city:tokyo', areaLabel: 'Tokyo', days: [{ title: 'Day 1', stops: ['afuri-ebisu'] }] });
  assert.equal(new UserData(valid, storage).trips[0]!.id, trip.id);
  data.deleteTrip(trip.id);
  assert.deepEqual(JSON.parse(storage.items.get(TRIPS_KEY)!), []);
  const exported = JSON.parse(data.exportJson());
  assert.equal(exported.format, 'soupmap-export');
  assert.deepEqual(exported.saved, ['afuri-ebisu', 'ginza-kagari']);

  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  const refused = new UserData(valid, full);
  refused.markVisited('afuri-ebisu');
  assert.equal(refused.persistent, false);
  assert.ok(refused.visits['afuri-ebisu'], 'kept in memory for this visit');
});

test('signed in, saved places come from the account and device saves are only imported on request', async () => {
  const data = new UserData(valid, memory({ 'soupmap:saved:v1': JSON.stringify(['afuri-ebisu', 'ginza-kagari']) }));
  const lists = [{ id: 's', name: 'Saved', kind: 'saved', ids: ['ginza-kagari', 'ichiran-nakasu'] },
    { id: 'c', name: 'Osaka', kind: 'custom', ids: ['dotonbori-imai'] }];
  await data.refreshAccount(async () => new Response(JSON.stringify({ lists }), { headers: { 'content-type': 'application/json' } }));
  assert.equal(data.signedIn, true);
  assert.deepEqual([...data.saved], ['ginza-kagari', 'ichiran-nakasu']);
  assert.deepEqual(data.importable, ['afuri-ebisu']);
  assert.deepEqual(data.customLists.map(l => l.name), ['Osaka']);
  // A dropped connection keeps the visitor signed in.
  await data.refreshAccount(async () => { throw new TypeError('offline'); });
  assert.equal(data.signedIn, true);
  // Signing out elsewhere does not.
  await data.refreshAccount(async () => new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }));
  assert.equal(data.signedIn, false);
  assert.deepEqual([...data.saved], ['afuri-ebisu', 'ginza-kagari']);
});

// ── The page ────────────────────────────────────────────────────────────────

let window: Window | undefined;
afterEach(async () => { await window?.happyDOM.close(); window = undefined; });

const journal = loadJournal().map(({ slug, title, dek, category, mark }) => ({ slug, title, dek, category, mark }));

function page(url = 'https://soupmap.example/me/') {
  window = new Window({ url });
  window.document.write(renderSiteShell(readFileSync(new URL('../me/index.html', import.meta.url), 'utf8')));
  for (const key of ['document', 'location', 'localStorage', 'navigator', 'CSS', 'HTMLElement', 'HTMLFormElement', 'FormData', 'Blob', 'URL']) {
    Object.defineProperty(globalThis, key, { value: (window as unknown as Record<string, unknown>)[key], configurable: true });
  }
  Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
  const root = window.document.querySelector('#me-root') as unknown as HTMLElement;
  const $ = (selector: string) => window!.document.querySelector(selector) as unknown as HTMLElement | null;
  const $$ = (selector: string) => [...window!.document.querySelectorAll(selector)] as unknown as HTMLElement[];
  return { window, root, $, $$ };
}

test('the dashboard shell works without JavaScript and links into the site', () => {
  const { $ } = page();
  assert.ok($('h1#me-title'));
  assert.ok($('.site-nav a[href="/map/"]'));
  assert.ok($('a[href="/journal/"]'));
  assert.ok($('noscript'));
  assert.ok(renderSiteShell(readFileSync(new URL('../index.html', import.meta.url), 'utf8')).includes('href="/me/"'), 'linked from home');
  assert.ok(renderSiteShell(readFileSync(new URL('../map/index.html', import.meta.url), 'utf8')).includes('href="/me/"'), 'linked from the map');
});

test('workspace navigation preserves a trip draft and responds to history navigation', () => {
  const {root,$,$$,window:w}=page('https://soupmap.example/me/#plan');
  const data=new UserData(valid,w.localStorage as unknown as Storage);
  const dashboard=new Dashboard(root,{shops:SHOPS,bySlug:shopBySlug,data,journal});
  dashboard.render();
  const visible=()=>$$('[data-workspace-panel]').filter(panel=>!panel.hidden).map(panel=>panel.dataset.workspacePanel);
  assert.deepEqual(visible(),['plan']);
  const area=$('select[name=area]') as unknown as HTMLSelectElement;
  area.value='pref:Kagawa';
  area.dispatchEvent(new w.Event('change',{bubbles:true}) as unknown as Event);
  $('.me-workspace-nav a[href="#places"]')!.click();
  assert.deepEqual(visible(),['places']);
  assert.equal(w.location.hash,'#places');
  assert.equal($('.me-workspace-nav [aria-current]')?.getAttribute('href'),'#places');
  assert.ok($('[data-workspace-panel="places"]')!.contains(w.document.activeElement as unknown as Node));
  $('.me-workspace-nav a[href="#plan"]')!.click();
  assert.equal($('select[name=area]'),area,'Switching sections keeps the actual draft form');
  assert.equal(area.value,'pref:Kagawa');
  w.history.replaceState(null,'','#passport');
  w.dispatchEvent(new w.PopStateEvent('popstate'));
  assert.deepEqual(visible(),['passport']);
  w.history.replaceState(null,'','#trips');
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  assert.deepEqual(visible(),['plan'],'Old trip bookmarks still work');
  dashboard.openView('#unknown[selector]',false);
  assert.deepEqual(visible(),['overview'],'Unknown hashes safely show the overview');
});

test('a guest can plan, save and stamp without an account, and is offered one', async () => {
  const { root, $, $$, window: w } = page();
  const data = new UserData(valid, w.localStorage as unknown as Storage);
  data.account = { status: 'guest', lists: [] };
  const dashboard = new Dashboard(root, { shops: SHOPS, bySlug: shopBySlug, data, journal, today: '2026-10-19', origin: 'https://soupmap.example' });
  dashboard.render();
  for (const a of $$('.me-workspace-nav a')) {
    assert.ok($(a.getAttribute('href')!), `Dashboard section exists: ${a.getAttribute('href')}`);
  }
  assert.ok($('.me-banner a[href="/sign-up"]'), 'guests are offered an account');
  assert.match($('.me-hero')!.textContent!, /ON THIS DEVICE/);
  assert.ok($('#places .me-chapters a[href^="/map/?hub="]'), 'an empty list points to the chapters');
  assert.ok($('.me-card--today'), 'there is always a bowl of the day');

  // Plan Kagawa udon.
  ($('select[name=area]') as unknown as HTMLSelectElement).value = 'pref:Kagawa';
  ($('select[name=days]') as unknown as HTMLSelectElement).value = '2';
  ($('input[name=craving][value=udon]') as unknown as HTMLInputElement).checked = true;
  ($('form[data-form=plan]') as unknown as HTMLFormElement).requestSubmit();
  const days = $$('.me-day');
  assert.equal(days.length, 2);
  assert.match($('.me-plan__summary')!.textContent!, /Kagawa/);
  const mapLink = $('.me-plan__summary a') as unknown as HTMLAnchorElement;
  assert.equal(new URL(mapLink.href).pathname, '/map/');
  assert.equal(new URL(mapLink.href).searchParams.get('collection')!.split(',').length, $$('.me-stop').length);
  assert.ok(w.localStorage.getItem('soupmap:planner:v1')!.includes('pref:Kagawa'), 'choices are remembered');

  // Save the first stop, then mark it visited from Your places.
  const first = $('.me-stop button[data-action=save]')!;
  const slug = first.dataset.slug!;
  first.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(JSON.parse(w.localStorage.getItem('soupmap:saved:v1')!), [slug]);
  assert.equal($(`#places .me-place button[data-slug="${slug}"][data-action=visit]`)?.textContent, 'Mark visited');
  assert.equal($('.me-plan .me-day') !== null, true, 'the plan survives the re-render');
  assert.equal(w.document.activeElement?.getAttribute('data-slug'), slug, 'focus returns to the same control');
  $(`#places button[data-slug="${slug}"][data-action=visit]`)!.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(JSON.parse(w.localStorage.getItem('soupmap:passport:v1')!)[slug]);
  assert.match($('.me-stats')!.textContent!, /Visited1/);
  assert.ok($('#passport .me-stamp.is-on') || shop(slug).broth === 'other');

  // Save the trip: it appears under Your trips, on this device only.
  $('button[data-action=save-trip]')!.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal($$('.me-trip').length, 1);
  assert.match($('.me-notice')!.textContent!, /on this device/);
  assert.equal($('.me-trip button[data-action=trip-to-account]'), null, 'no account actions for guests');
});

test('signed in, saves and trips go to the account through the existing API', async () => {
  const { root, $, window: w } = page();
  w.localStorage.setItem('soupmap:saved:v1', JSON.stringify(['afuri-ebisu']));
  const calls: { url: string; method: string; body: unknown }[] = [];
  const lists = [{ id: 'saved', name: 'Saved', kind: 'saved', ids: ['ichiran-nakasu'] }];
  const realFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (url: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: init.method ?? 'GET', body });
    const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
    if (url === '/api/me') return json({ lists });
    if (url === '/api/lists') { lists.push({ id: 'trip', name: body.name, kind: 'custom', ids: [] }); return json({ list: lists.at(-1) }); }
    if (url === '/api/import-saves') { lists[0]!.ids.push(...body.ids); return json({ list: lists[0] }); }
    return json({ ok: true });
  } });
  try {
    const data = new UserData(valid, w.localStorage as unknown as Storage);
    await data.refreshAccount();
    const dashboard = new Dashboard(root, { shops: SHOPS, bySlug: shopBySlug, data, journal, today: '2026-10-19', origin: 'https://soupmap.example' });
    dashboard.render();
    assert.match($('.me-hero')!.textContent!, /SIGNED IN/);
    assert.match($('.me-banner')!.textContent!, /1 place saved on this browser isn't in your account yet/);
    assert.ok($('#places a.me-shop[href="/shop/ichiran-nakasu/"]'), 'account saves are listed');

    $('button[data-action=import]')!.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    const imported = calls.find(c => c.url === '/api/import-saves');
    assert.deepEqual(imported?.body, { ids: ['afuri-ebisu'], add: true }, 'import is additive');

    $('#places button[data-action=unsave][data-slug="ichiran-nakasu"]')!.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(calls.at(-1), { url: '/api/saved/ichiran-nakasu', method: 'PUT', body: { saved: false } });
    assert.deepEqual(JSON.parse(w.localStorage.getItem('soupmap:saved:v1')!), ['afuri-ebisu'], 'device saves are untouched');

    // happy-dom misreads `selected` on parsed options, so choose explicitly, as a visitor would.
    ($('select[name=area]') as unknown as HTMLSelectElement).value = 'city:fukuoka';
    ($('select[name=days]') as unknown as HTMLSelectElement).value = '2';
    ($('select[name=perDay]') as unknown as HTMLSelectElement).value = '3';
    ($('form[data-form=plan]') as unknown as HTMLFormElement).requestSubmit();
    $('button[data-action=save-trip]')!.click();
    await new Promise(resolve => setTimeout(resolve, 10));
    const created = calls.find(c => c.url === '/api/lists');
    assert.match((created?.body as { name: string }).name, /· 2 days$/);
    const items = calls.find(c => c.url === '/api/lists/trip/items')!;
    assert.equal(items.method, 'PUT');
    assert.equal((items.body as { ids: string[] }).ids.length, 6);
    assert.match($('.me-trip')!.textContent!, /also in your account/);
    assert.ok($('.me-lists'), 'account lists are shown');
  } finally {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: realFetch });
  }
});
