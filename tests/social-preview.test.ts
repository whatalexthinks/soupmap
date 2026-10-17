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
  assert.equal(property("og:image"),"%SITE_URL%/social/soupmap-world.png");
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
  const path = new URL("../public/social/soupmap-world.png",import.meta.url);
  const image = readFileSync(path);
  assert.equal(image.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
  assert.equal(image.readUInt32BE(16),1200);
  assert.equal(image.readUInt32BE(20),630);
  assert.ok(statSync(path).size < 500000,"Keep messaging previews lightweight.");
});
