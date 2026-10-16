// Step 2 harness: boot the engine and play the intro. Replaced by the app shell next.
import { SHOPS } from "./data/shops";

window.CESIUM_BASE_URL = __CESIUM_BASE_URL__;

const container = document.getElementById("cesium")!;
const creditViewport = document.createElement("div");
document.body.append(creditViewport);

requestAnimationFrame(async () => {
  const { createMapEngine } = await import("./map/engine");
  const engine = await createMapEngine({
    container,
    creditViewport,
    googleKey: (import.meta.env.VITE_GOOGLE_MAPS_KEY ?? "").trim(),
    shops: SHOPS,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    lowPower: matchMedia("(pointer: coarse)").matches,
    onStatus: (s) => console.info("[soupmap] status", JSON.stringify(s)),
  });
  void engine.playIntro();
  Object.assign(window, { soupmap: engine });
});
