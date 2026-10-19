import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { historyDatasetSchema, nearbyHistory, createHistoryLoader, HISTORY_LIMIT } from "../src/history.ts";
import { isTokyoHistoryLocation, type HistoryMapPlace } from "../src/history-coverage.ts";
import { HistorySection } from "../src/ui/history-section.ts";
import { SOURCES } from "../src/sources.ts";

const raw = JSON.parse(readFileSync(new URL("../public/data/history/tokyo-v1.json", import.meta.url), "utf8"));
const dataset = historyDatasetSchema.parse(raw);
const ebisu = { lat: 35.6467, lng: 139.710122 };
const ginza = { lat: 35.672, lng: 139.763 };

test("Tokyo snapshot is bounded, attributed, qualified and contains all four source families", () => {
  assert.equal(dataset.places.length, 9);
  assert.ok(JSON.stringify(raw).length < 25000);
  const providers = new Set(dataset.places.flatMap(place => place.sources.map(source => source.provider)));
  assert.deepEqual([...providers].sort(), ["japan-search", "official", "wikidata", "wikipedia"]);
  assert.ok(dataset.places.some(place => place.dates.some(date => date.value === null)));
  assert.ok(dataset.places.some(place => place.kind === "neighbourhood"));
  assert.match(dataset.places.find(place => place.id === "sensoji")!.summary, /without a reference/);
  const wiki = dataset.places.find(place => place.id === "ebisu")!.sources[0]!;
  assert.match(wiki.url, /oldid=\d+/);
  assert.match(wiki.attribution, /Adapted.*CC BY-SA 4.0/);
  for (const id of ["history-wikidata", "history-wikipedia", "history-japan-search", "history-official"]) {
    assert.ok(SOURCES.some(source => source.id === id));
  }
});

test("invalid citations, unlicensed adaptations, invalid coordinates and duplicate IDs fail explicitly", () => {
  for (const mutate of [
    (data: typeof raw) => { data.places[0].summarySourceIds = ["missing"]; },
    (data: typeof raw) => { data.places[0].sources[0].usage = "discovery"; },
    (data: typeof raw) => { data.places[0].dates[0].sourceIds = []; },
    (data: typeof raw) => { data.places[0].sources[0].url = "javascript:alert(1)"; },
    (data: typeof raw) => { data.places[0].lat = 0; },
    (data: typeof raw) => { data.places[1].id = data.places[0].id; },
    (data: typeof raw) => { data.places[7].sources[0].license = "Unknown"; },
  ]) {
    const data = structuredClone(raw);
    mutate(data);
    assert.equal(historyDatasetSchema.safeParse(data).success, false);
  }
});

test("nearest context uses coordinates rather than shop city names and never invents coverage", () => {
  assert.equal(nearbyHistory(dataset, ebisu)[0]!.place.id, "ebisu");
  assert.equal(nearbyHistory(dataset, ginza)[0]!.place.id, "hibiya-park");
  assert.ok(nearbyHistory(dataset, { lat: 35.71, lng: 139.775 }).length <= HISTORY_LIMIT);
  assert.deepEqual(nearbyHistory(dataset, { lat: 34.69, lng: 135.5 }), []);
  assert.deepEqual(nearbyHistory(dataset, { lat: 35.56, lng: 139.56 }), []);
  assert.equal(isTokyoHistoryLocation({ lat: NaN, lng: 139.7 }), false);
  assert.equal(isTokyoHistoryLocation({ lat: 35.6, lng: Infinity }), false);
  for (const entry of nearbyHistory(dataset, ginza)) assert.ok(entry.distanceMeters <= 2500);
});

test("city loader is opt-in, single-flight and cached only on success", async () => {
  let requests = 0;
  let fail = true;
  const load = createHistoryLoader(async (input, init) => {
    requests++;
    assert.equal(input, "/data/history/tokyo-v1.json");
    assert.ok(init?.signal);
    if (fail) return new Response("unavailable", { status: 503 });
    return new Response(JSON.stringify(raw));
  });
  assert.equal(requests, 0);
  const first = load();
  assert.equal(load(), first);
  await assert.rejects(first, /503/);
  fail = false;
  const result = await load();
  assert.equal(await load(), result);
  assert.equal(requests, 2);
  const bad = createHistoryLoader(async () => new Response('{"city":"Tokyo","places":[]}'));
  await assert.rejects(bad());
  const large = createHistoryLoader(async () => new Response(" ".repeat(100001)));
  await assert.rejects(large(), /budget/);
});

function uiHarness(loader: () => Promise<typeof dataset>) {
  const window = new Window();
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const mapped: HistoryMapPlace[][] = [];
  let imports = 0;
  const section = new HistorySection(host as unknown as HTMLElement, places => mapped.push(places), async () => {
    imports++;
    return { loadTokyoHistory: loader, nearbyHistory };
  });
  const toggle = (checked: boolean) => {
    const input = host.querySelector<HTMLInputElement>("[data-history-opt-in]")!;
    input.checked = checked;
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  };
  return { window, host, mapped, section, toggle, imports: () => imports };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test("history UI loads nothing before opt-in; renders licensed, English-first context without images", async () => {
  const ui = uiHarness(async () => dataset);
  try {
    ui.section.show(ebisu);
    assert.equal(ui.imports(), 0);
    ui.toggle(true);
    await settle();
    assert.equal(ui.imports(), 1);
    assert.match(ui.host.textContent!, /Ebisu/);
    assert.match(ui.host.textContent!, /straight-line/);
    assert.match(ui.host.textContent!, /2026-10-18/);
    assert.equal(ui.mapped.at(-1)![0]!.id, "ebisu");
    assert.match(ui.host.querySelector("h4")!.textContent!, /Ebisu/);
    assert.match(ui.host.querySelector('[lang="ja"]')!.textContent!, /恵比寿/);
    assert.equal(ui.host.querySelectorAll("img").length, 0);
    assert.ok(ui.host.querySelector('a[href*="creativecommons.org/licenses/by-sa/4.0"]'));
    ui.toggle(false);
    assert.deepEqual(ui.mapped.at(-1), []);
    assert.equal(ui.host.querySelectorAll("article").length, 0);
  } finally { await ui.window.happyDOM.close(); }
});

test("coverage gaps are explicit and outside Tokyo never imports the history module", async () => {
  const ui = uiHarness(async () => dataset);
  try {
    ui.section.show({ lat: 34.69, lng: 135.5 });
    ui.toggle(true);
    await settle();
    assert.equal(ui.imports(), 0);
    assert.match(ui.host.textContent!, /outside the Tokyo/);
    ui.section.show({ lat: 35.56, lng: 139.56 });
    await settle();
    assert.match(ui.host.textContent!, /No curated history entries/);
    ui.section.show({ lat: 35.724, lng: 139.766 });
    await settle();
    assert.match(ui.host.textContent!, /Not verified/);
  } finally { await ui.window.happyDOM.close(); }
});

test("load failures offer working Retry and restore keyboard focus", async () => {
  let requests = 0;
  const ui = uiHarness(async () => {
    if (++requests === 1) throw new Error("offline");
    return dataset;
  });
  try {
    ui.section.show(ebisu);
    ui.toggle(true);
    await settle();
    assert.match(ui.host.textContent!, /could not be loaded/);
    ui.host.querySelector<HTMLButtonElement>("[data-history-retry]")!.click();
    await settle();
    assert.equal(requests, 2);
    assert.ok(ui.host.querySelector("article"));
    assert.ok(ui.window.document.activeElement?.hasAttribute("data-history-opt-in"));
  } finally { await ui.window.happyDOM.close(); }
});

test("switching shops, turning off and closing prevent late results and stale map pins", async () => {
  const resolvers: ((data: typeof dataset) => void)[] = [];
  const ui = uiHarness(() => new Promise(resolve => resolvers.push(resolve)));
  try {
    ui.section.show(ebisu);
    ui.toggle(true);
    await settle();
    ui.section.show(ginza);
    await settle();
    resolvers[0]!(dataset);
    await settle();
    assert.equal(ui.host.querySelector("article"), null);
    resolvers[1]!(dataset);
    await settle();
    assert.equal(ui.mapped.at(-1)![0]!.id, "hibiya-park");
    ui.section.show(ebisu);
    await settle();
    ui.toggle(false);
    resolvers[2]!(dataset);
    await settle();
    assert.equal(ui.host.querySelector("article"), null);
    assert.deepEqual(ui.mapped.at(-1), []);
    ui.toggle(true);
    await settle();
    ui.section.close();
    resolvers[3]!(dataset);
    await settle();
    assert.equal(ui.host.textContent, "");
    assert.deepEqual(ui.mapped.at(-1), []);
  } finally { await ui.window.happyDOM.close(); }
});
