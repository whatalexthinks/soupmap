import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { Window } from "happy-dom";

test("sharing metadata is in the initial HTML and uses matching large-image cards",async()=>{
  const window = new Window();
  window.document.write(readFileSync(new URL("../index.html",import.meta.url),"utf8"));
  const property = (name:string) => window.document.querySelector(`meta[property="${name}"]`)?.getAttribute("content");
  const named = (name:string) => window.document.querySelector(`meta[name="${name}"]`)?.getAttribute("content");
  assert.match(property("og:title") ?? "",/Soupmap.*Anywhere/);
  assert.match(property("og:description") ?? "",/Japan pilot/);
  assert.equal(property("og:title"),named("twitter:title"));
  assert.equal(property("og:description"),named("description"));
  assert.equal(named("twitter:description"),named("description"));
  assert.equal(property("og:image"),"%SITE_URL%/social/soupmap-share.png");
  assert.equal(property("og:image"),property("og:image:secure_url"));
  assert.equal(property("og:image"),named("twitter:image"));
  assert.equal(property("og:image:type"),"image/png");
  assert.equal(property("og:image:width"),"1200");
  assert.equal(property("og:image:height"),"630");
  assert.equal(named("twitter:card"),"summary_large_image");
  assert.ok(property("og:image:alt"));
  assert.equal(property("og:image:alt"),named("twitter:image:alt"));
  await window.happyDOM.close();
});

test("credits share the current worldwide card with matching Twitter metadata",async()=>{
  const window = new Window();
  window.document.write(readFileSync(new URL("../credits/index.html",import.meta.url),"utf8"));
  const property = (name:string) => window.document.querySelector(`meta[property="${name}"]`)?.getAttribute("content");
  const named = (name:string) => window.document.querySelector(`meta[name="${name}"]`)?.getAttribute("content");
  assert.equal(property("og:title"),"Data & credits · Soupmap");
  assert.equal(property("og:title"),named("twitter:title"));
  assert.equal(property("og:description"),named("description"));
  assert.equal(named("twitter:description"),named("description"));
  assert.equal(property("og:image"),"%SITE_URL%/social/soupmap-share.png");
  assert.equal(property("og:image"),property("og:image:secure_url"));
  assert.equal(property("og:image"),named("twitter:image"));
  assert.equal(property("og:image:type"),"image/png");
  assert.equal(property("og:image:width"),"1200");
  assert.equal(property("og:image:height"),"630");
  assert.equal(named("twitter:card"),"summary_large_image");
  assert.ok(property("og:image:alt"));
  assert.equal(property("og:image:alt"),named("twitter:image:alt"));
  await window.happyDOM.close();
});

test("the public share image is a real 1200-by-630 PNG with a small download size",()=>{
  const path = new URL("../public/social/soupmap-share.png",import.meta.url);
  const image = readFileSync(path);
  assert.equal(image.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
  assert.equal(image.readUInt32BE(16),1200);
  assert.equal(image.readUInt32BE(20),630);
  assert.ok(statSync(path).size < 500000,"Keep messaging previews lightweight.");
});

test("app icons use the supplied logo and include home-screen and maskable sizes",()=>{
  const svg = readFileSync(new URL("../public/favicon.svg",import.meta.url),"utf8");
  assert.match(svg,/data:image\/png;base64,/);
  for (const [file,size] of [
    ["favicon-32.png",32],["apple-touch-icon.png",180],
    ["icon-192.png",192],["icon-512.png",512],["icon-maskable-512.png",512],
  ] as const) {
    const png=readFileSync(new URL(`../public/${file}`,import.meta.url));
    assert.equal(png.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16),size);
    assert.equal(png.readUInt32BE(20),size);
  }
  const manifest=JSON.parse(readFileSync(new URL("../public/site.webmanifest",import.meta.url),"utf8"));
  assert.ok(manifest.icons.some((icon:{src:string;purpose?:string})=>
    icon.src==="/icon-maskable-512.png" && icon.purpose==="maskable"));
});
