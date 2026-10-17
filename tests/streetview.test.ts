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

class FakePanorama {
  constructor(_container: HTMLElement, next: google.maps.StreetViewPanoramaOptions) {
    options = next;
    visible = !!next.visible;
  }
  setVisible(next: boolean) { visible = next; }
  addListener() { return {remove(){}}; }
  getStatus() { return "OK"; }
}
const library = {StreetViewPanorama: FakePanorama} as unknown as google.maps.StreetViewLibrary;

beforeEach(()=>{
  window = new Window();
  for(const [key,value] of Object.entries({window,document:window.document,Event:window.Event})) {
    Object.defineProperty(globalThis,key,{value,configurable:true});
  }
  options=undefined; visible=false; metadataCalls=0;
  globalThis.fetch = async input => {
    metadataCalls++;
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("source"),"outdoor");
    assert.equal(url.searchParams.get("radius"),"100");
    return new Response(JSON.stringify({status:"OK",pano_id:"test-panorama",
      location:{lat:shop.lat,lng:shop.lng-0.001},copyright:"© Google",date:"2024-01"}));
  };
});
afterEach(async()=>{ globalThis.fetch=realFetch; await window.happyDOM.close(); });

test("native panorama starts wide with connected street movement and no static face stretching",async()=>{
  let libraryLoads=0;
  const view = new StreetView("test-key",async()=>{libraryLoads++;return library;});
  assert.ok(await view.find(shop));
  assert.ok(await view.find(shop));
  assert.equal(metadataCalls,1);
  assert.equal(libraryLoads,0);
  assert.ok(await view.open(shop));
  assert.equal(libraryLoads,1);
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

test("missing coverage and metadata authorization failure remain distinct and retryable",async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify({status:"ZERO_RESULTS"}));
  const view = new StreetView("test-key",async()=>library);
  assert.equal(await view.find(shop),null);
  assert.match(view.unavailableReason(shop) ?? "",/No outdoor/);
  globalThis.fetch=async()=>new Response(JSON.stringify({status:"REQUEST_DENIED"}));
  assert.equal(await view.find(shop),null);
  assert.match(view.unavailableReason(shop) ?? "",/Street View Static API/);
});

test("initial heading faces the selected shop without tilting upwards",()=>{
  assert.equal(headingToShop({lat:0,lng:0},{lat:1,lng:0}),0);
  assert.equal(headingToShop({lat:0,lng:0},{lat:0,lng:1}),90);
});
