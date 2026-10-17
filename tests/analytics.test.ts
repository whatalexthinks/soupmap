import test from "node:test";
import assert from "node:assert/strict";
import { trackEvent } from "../src/analytics.ts";

test("custom tracking safely handles missing, blocked and rejecting trackers", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis,"window");
  try {
    Reflect.deleteProperty(globalThis,"window");
    assert.doesNotThrow(()=>trackEvent("shop_opened"));
    Object.defineProperty(globalThis,"window",{configurable:true,value:{}});
    assert.doesNotThrow(()=>trackEvent("shop_opened"));
    window.umami={track(){throw new Error("Blocked");}};
    assert.doesNotThrow(()=>trackEvent("shop_opened"));
    window.umami={track:()=>Promise.reject(new Error("Offline"))};
    trackEvent("shop_opened");
    await new Promise(resolve=>setImmediate(resolve));
    const events: unknown[]=[];
    window.umami={track:(...args)=>{events.push(args);}};
    trackEvent("filter_changed",{filter:"broth",value:"shio",enabled:true});
    assert.deepEqual(events,[["filter_changed",{filter:"broth",value:"shio",enabled:true}]]);
  } finally {
    if (previous) Object.defineProperty(globalThis,"window",previous);
    else Reflect.deleteProperty(globalThis,"window");
  }
});
