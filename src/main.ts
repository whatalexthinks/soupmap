// Scaffold entry: lazy-load Cesium after first paint. Replaced by the app shell in later steps.
window.CESIUM_BASE_URL = __CESIUM_BASE_URL__;

requestAnimationFrame(async () => {
  const { Viewer } = await import("cesium");
  new Viewer("cesium", { baseLayer: false, geocoder: false });
});
