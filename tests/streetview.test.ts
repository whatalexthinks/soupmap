import { beforeEach, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { StreetView, headingToShop } from "../src/map/streetview.ts";
import { ORDERED_SHOPS } from "../src/data/shops.ts";

const shop = ORDERED_SHOPS[0]!;
const realFetch = globalThis.fetch;
let window: Window;
let options: google.maps.StreetViewPanoramaOptions | undefined;
let visible = false;
let metadataCalls = 0;
let coverage = "OK";
let readyStatus = "OK";
let lookupRadii: number[] = [];

class FakePanorama {
  constructor(_container: HTMLElement, next: google.maps.StreetViewPanoramaOptions) {
    assert.equal(_container.className,"interactive-streetview__renderer");
    assert.equal(_container.parentElement?.className,"interactive-streetview");
    // Match Google's real host mutation: it must not touch the fixed frame.
    _container.style.position="relative";
    options = next;
    visible = !!next.visible;
  }
  setVisible(next: boolean) { visible = next; }
  addListener() { return {remove(){}}; }
  getStatus() { return readyStatus; }
}
class FakeService {
  async getPanorama(request: google.maps.StreetViewLocationRequest) {
    metadataCalls++;
    lookupRadii.push(request.radius!);
    assert.deepEqual(request.sources, ["google", "outdoor"]);
    assert.equal(request.preference, "best");
    if (coverage !== "OK") throw Object.assign(new Error("Unavailable"), {code:coverage});
    return {data:{location:{pano:"test-panorama",latLng:{lat:()=>shop.lat,lng:()=>shop.lng-0.001}},
      copyright:"© Google",imageDate:"2024-01"}};
  }
}
const library = {StreetViewPanorama: FakePanorama, StreetViewService:FakeService,
  StreetViewSource:{GOOGLE:"google",OUTDOOR:"outdoor"},StreetViewPreference:{BEST:"best"},
} as unknown as google.maps.StreetViewLibrary;

beforeEach(()=>{
  window = new Window();
  for(const [key,value] of Object.entries({window,document:window.document,Event:window.Event})) {
    Object.defineProperty(globalThis,key,{value,configurable:true});
  }
  options=undefined; visible=false; metadataCalls=0; coverage="OK"; readyStatus="OK"; lookupRadii=[];
  globalThis.fetch = async () => { throw new Error("Street View must not depend on Static API metadata"); };
});
afterEach(async()=>{ globalThis.fetch=realFetch; await window.happyDOM.close(); });

test("native panorama starts wide with connected street movement and no static face stretching",async()=>{
  let libraryLoads=0;
  const view = new StreetView("test-key",async()=>{libraryLoads++;return library;});
  assert.ok(await view.find(shop));
  assert.ok(await view.find(shop));
  assert.equal(metadataCalls,1);
  assert.equal(libraryLoads,1);
  assert.ok(await view.open(shop));
  assert.equal(libraryLoads,2);
  assert.equal(options?.zoom,0);
  assert.equal(options?.linksControl,true);
  assert.equal(options?.clickToGo,true);
  assert.equal(options?.zoomControl,true);
  assert.equal(options?.pov?.pitch,0);
  assert.ok(view.isOpen);
  assert.ok(window.document.querySelector(".interactive-streetview"));
  assert.equal(await view.open(shop),null);
  view.close();
  assert.equal(visible,false);
  assert.equal(view.isOpen,false);
  assert.equal(window.document.querySelector(".interactive-streetview"),null);
});

test("loader denial explains the newly required API without exposing credentials",async()=>{
  const view = new StreetView("test-key",async()=>{throw new Error("Denied");});
  assert.equal(await view.open(shop),null);
  assert.match(view.unavailableReason(shop) ?? "",/Maps JavaScript API/);
  assert.doesNotMatch(view.unavailableReason(shop) ?? "",/test-key/);
  assert.equal(view.isLoading,false);
  assert.equal(window.document.querySelector(".interactive-streetview"),null);
});

test("closing during library loading cancels entry and cannot reopen an old shop",async()=>{
  let release!: (value: google.maps.StreetViewLibrary)=>void;
  let started!: ()=>void;
  const loading = new Promise<google.maps.StreetViewLibrary>(resolve=>{release=resolve;});
  const reached = new Promise<void>(resolve=>{started=resolve;});
  const view = new StreetView("test-key",()=>{started();return loading;});
  const opening = view.open(shop);
  await reached;
  assert.equal(view.isLoading,true);
  view.close();
  release(library);
  assert.equal(await opening,null);
  assert.equal(view.isOpen,false);
  assert.equal(view.isLoading,false);
  assert.equal(window.document.querySelector(".interactive-streetview"),null);
});

test("missing coverage widens outdoor search and authorization failures stay retryable",async()=>{
  coverage="ZERO_RESULTS";
  const view = new StreetView("test-key",async()=>library);
  assert.equal(await view.find(shop),null);
  assert.deepEqual(lookupRadii,[250,500]);
  assert.match(view.unavailableReason(shop) ?? "",/No official outdoor/);
  coverage="REQUEST_DENIED";
  assert.equal(await view.find(shop),null);
  assert.match(view.unavailableReason(shop) ?? "",/Maps JavaScript API/);
  coverage="OK";
  assert.ok(await view.find(shop));
});

test("viewer failure is not reported as successfully opened",async()=>{
  readyStatus="UNKNOWN_ERROR";
  const view = new StreetView("test-key",async()=>library);
  assert.equal(await view.open(shop),null);
  assert.equal(view.isOpen,false);
  assert.match(view.unavailableReason(shop) ?? "",/did not load/);
  assert.equal(window.document.querySelector(".interactive-streetview"),null);
});

test("viewer shares the app stacking context so Back to map stays above it",async()=>{
  const app=window.document.createElement("main");
  app.id="app";
  window.document.body.append(app);
  const view=new StreetView("test-key",async()=>library);
  assert.ok(await view.open(shop));
  assert.equal(window.document.querySelector(".interactive-streetview")?.parentElement,app);
  view.close();
});

test("initial heading faces the selected shop without tilting upwards",()=>{
  assert.equal(headingToShop({lat:0,lng:0},{lat:1,lng:0}),0);
  assert.equal(headingToShop({lat:0,lng:0},{lat:0,lng:1}),90);
});
