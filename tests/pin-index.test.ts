import test from "node:test";
import assert from "node:assert/strict";
import { ShopPinIndex, viewportBoxes, type PinFeature } from "../src/map/pin-index.ts";
import { clusterLabel } from "../src/map/glyph.ts";

const represented = (features: PinFeature[]) => features.reduce((total, feature) =>
  total + (feature.properties.cluster ? feature.properties.point_count : 1), 0);
const dense = Array.from({ length: 10_000 }, (_, i) => ({
  slug: `shop-${i}`, lat: 35.5 + Math.floor(i / 100) * .001, lng: 139.5 + (i % 100) * .001,
}));

test("dense mobile views have bounded features without dropping catalog locations", () => {
  const index = new ShopPinIndex(true);
  index.setShops(dense);
  const features = index.query([139, 35, 140, 36], 20);
  assert.ok(features.length > 0 && features.length <= 48);
  assert.equal(represented(features), dense.length);
  assert.equal(represented(index.query(undefined, 2)), dense.length);
});

test("viewport queries exclude offscreen cities and support the date line", () => {
  const index = new ShopPinIndex(true);
  index.setShops([...dense, {slug:"paris",lat:48.85,lng:2.35},
    {slug:"east",lat:0,lng:179.9}, {slug:"west",lat:0,lng:-179.9}]);
  assert.equal(represented(index.query([139,35,140,36],18)),dense.length);
  assert.equal(represented(index.query([2,48,3,49],18)),1);
  assert.equal(represented(index.query([179,-1,-179,1],18)),2);
  assert.deepEqual(viewportBoxes([179,-1,-179,1]),[[179,-1,180,1],[-180,-1,-179,1]]);
});

test("sorting the same shops reuses the index; filters and empty searches rebuild correctly", () => {
  const index = new ShopPinIndex(true);
  assert.equal(index.setShops([]),true);
  assert.deepEqual(index.query(undefined,10),[]);
  assert.equal(index.setShops(dense),true);
  assert.equal(index.setShops([...dense].reverse()),false);
  assert.equal(index.setShops(dense.slice(0,10)),true);
  assert.equal(represented(index.query(undefined,18)),10);
  assert.equal(index.setShops([]),true);
  assert.deepEqual(index.query(undefined,18),[]);
});

test("desktop clustering is also bounded and cluster leaves remain navigable", () => {
  const index = new ShopPinIndex(false);
  index.setShops(dense);
  const features = index.query(undefined,20);
  assert.ok(features.length <= 240);
  assert.equal(represented(features),dense.length);
  const cluster = features.find(feature => feature.properties.cluster)!;
  assert.equal(index.leaves(cluster.properties.cluster_id).length,cluster.properties.point_count);
});

test("badge texture keys stay bounded while labels honestly describe large counts", () => {
  assert.equal(clusterLabel(12),"12");
  assert.equal(clusterLabel(124),"100+");
  assert.equal(clusterLabel(1999),"1k+");
  assert.equal(clusterLabel(32_664),"30k+");
  assert.ok(new Set(Array.from({length:32_663},(_,i)=>clusterLabel(i+2))).size < 140);
});

test("the planet view remains bounded for shops spread around the world", () => {
  const shops = Array.from({length:64},(_,i)=>({
    slug:`world-${i}`,lng:-179+(i%8)*51.2,
    lat:Math.atan(Math.sinh(Math.PI*(1-2*(.002+Math.floor(i/8)*.142))))*180/Math.PI,
  }));
  const index = new ShopPinIndex(true);
  index.setShops(shops);
  const features = index.query(undefined,0);
  assert.ok(features.length <= 48);
  assert.equal(represented(features),shops.length);
});
