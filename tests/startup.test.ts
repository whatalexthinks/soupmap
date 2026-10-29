import test from "node:test";
import assert from "node:assert/strict";
import { claimOpening, OPENING_SESSION_KEY } from "../src/startup.ts";
import { citySurfaceActive, movingScreenSpaceError, renderBudget, renderPixelRatio } from "../src/map/render-policy.ts";

test("the opening is claimed before playback and cannot repeat after a reload in the same tab",()=>{
  const values=new Map<string,string>();
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  assert.equal(claimOpening(()=>storage),true);
  assert.equal(values.get(OPENING_SESSION_KEY),"1");
  assert.equal(claimOpening(()=>storage),false);
  assert.equal(claimOpening(()=>storage),false);
  assert.equal(claimOpening(()=>({getItem:()=>null,setItem(){}})),true);
});

test("blocked session storage skips the expensive opening rather than replaying it",()=>{
  assert.equal(claimOpening(()=>{throw new Error("Storage denied");}),false);
  assert.equal(claimOpening(()=>({getItem:()=>null,setItem(){throw new Error("Quota");}})),false);
});

test("planet scale does not stream city meshes and hysteresis avoids layer flicker",()=>{
  assert.equal(citySurfaceActive(22_000_000,false),false);
  assert.equal(citySurfaceActive(300_000,false),false);
  assert.equal(citySurfaceActive(120_000,false),true);
  assert.equal(citySurfaceActive(300_000,true),true);
  assert.equal(citySurfaceActive(500_000,true),false);
});

test("mobile 3D memory includes a bounded overflow and no hidden or flight preloading",()=>{
  const mobile=renderBudget(true),desktop=renderBudget(false);
  assert.ok(mobile.cacheBytes+mobile.maximumCacheOverflowBytes<=80*1024*1024);
  assert.ok(desktop.cacheBytes+desktop.maximumCacheOverflowBytes<=320*1024*1024);
  assert.equal(mobile.preloadWhenHidden,false);
  assert.equal(mobile.preloadFlightDestinations,false);
});

test("mobile reduces mesh detail during gestures and restores it when the camera settles",()=>{
  assert.equal(movingScreenSpaceError(true,true),64);
  assert.equal(movingScreenSpaceError(true,false),32);
  assert.equal(movingScreenSpaceError(false,true),16);
  assert.equal(movingScreenSpaceError(false,false),16);
});

test("mobile refines nearby buildings only while stationary without raising the memory budget",()=>{
  assert.equal(movingScreenSpaceError(true, false, 500), 12);
  assert.equal(movingScreenSpaceError(true, false, 5_000), 20);
  assert.equal(movingScreenSpaceError(true, false, 50_000), 32);
  assert.equal(movingScreenSpaceError(true, true, 500), 64);
  assert.equal(movingScreenSpaceError(false, false, 500), 16);
});

test("close-up mobile sharpness stays capped and returns to 1x during gestures",()=>{
  assert.equal(renderPixelRatio(true, false, 500, 3), 1.5);
  assert.equal(renderPixelRatio(true, true, 500, 3), 1);
  assert.equal(renderPixelRatio(true, false, 50_000, 3), 1);
  assert.equal(renderPixelRatio(true, false, 500, 1), 1);
  assert.equal(renderPixelRatio(false, false, 500, 3), 2);
});
