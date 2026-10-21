import { renderSiteShell } from "../src/render/shell.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, statSync} from "node:fs";
import {Window} from "happy-dom";
import {shopBySlug} from "../src/data/shops.ts";
import {homeCitiesHtml,homeCityHtml} from "../src/render/home.ts";
import {assertNoConflictMarkers} from "../scripts/lib/source-integrity.ts";

const homepageHtml=()=>renderSiteShell(readFileSync(new URL("../index.html",import.meta.url),"utf8"))
  .replace("<!--soupmap:home-cities-->",homeCitiesHtml())
  .replace("<!--soupmap:home-featured-->",homeCityHtml());

test("homepage and stylesheet contain no unresolved Git conflict markers",()=>{
  for(const path of ["index.html","src/styles/home.css"]) {
    assertNoConflictMarkers(readFileSync(new URL(`../${path}`,import.meta.url),"utf8"),path);
  }
});

test("photo-led homepage keeps exploration public and all trail links real", async()=>{
  const window=new Window();
  try {
    window.document.write(homepageHtml());
    const document=window.document;
    for(const href of ["/map/","/sign-up","/sign-in"]) {
      assert.ok(document.querySelector(`a[href="${href}"]`),`Missing public navigation: ${href}`);
    }
    assert.equal(document.querySelector("form[role=search]")?.getAttribute("action"),"/catalog/");
    assert.equal(document.querySelector("#home-query")?.getAttribute("name"),"q");
    assert.ok(document.querySelector("#home-account"),"Keep the real account navigation mount");
    assert.equal(document.querySelectorAll("h1").length,1);
    for(const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="/map/#"]')) {
      const slug=link.getAttribute("href")!.slice("/map/#".length);
      assert.ok(shopBySlug.has(slug),`Unknown trail shop: ${slug}`);
    }
    for(const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      const id=link.getAttribute("href")!.slice(1);
      assert.ok(id&&document.getElementById(id),`Broken section link: #${id}`);
    }
    assert.match(document.body.textContent??"",/AI.generated/i,"Generated photographs must be disclosed");
  } finally {
    await window.happyDOM.close();
  }
});

test("prerendered homepage has unique IDs, one headline and one coherent page shell",async()=>{
  const window=new Window();
  try {
    window.document.write(homepageHtml());
    const document=window.document;
    const ids=[...document.querySelectorAll("[id]")].map(element=>element.id);
    assert.equal(new Set(ids).size,ids.length,`Duplicate homepage IDs: ${ids.filter((id,index)=>ids.indexOf(id)!==index).join(", ")}`);
    assert.equal(document.querySelectorAll("h1").length,1,"Keep one primary headline");
    assert.equal(document.querySelector("h1")?.id,"hero-title");
    assert.equal(document.querySelectorAll("main").length,1);
    assert.equal(document.querySelectorAll(".home-page > header").length,1);
    assert.equal(document.querySelectorAll(".home-page > footer").length,1);
    assert.equal(document.querySelectorAll(".city-index a[href^='/city/']").length,7,"Keep crawlable, prerendered city navigation");
    assert.ok(document.querySelector("a[href='/catalog/']"),"Keep crawlable catalog navigation");
  } finally {
    await window.happyDOM.close();
  }
});

test("homepage shows the real app screenshot instead of invented map or street imagery",async()=>{
  const window=new Window();
  try {
    window.document.write(homepageHtml());
    const images=[...window.document.querySelectorAll<HTMLImageElement>('img[src^="/images/editorial/"]')];
    assert.ok(images.some(image=>image.getAttribute("src")?.includes("soupmap-phone-")),"Show the actual supplied app screenshot");
    assert.ok(images.some(image=>image.getAttribute("src")?.includes("ramen-")),"Keep the soup mood image");
    assert.ok(!images.some(image=>/japan-trail|japan-street/.test(image.getAttribute("src")??"")),"Do not use the rejected generated images");
    assert.equal(images.filter(img=>img.getAttribute("fetchpriority")==="high").length,0,"Below-the-fold supporting images should not compete with the search-first opening");
    for(const image of images) {
      assert.ok(image.getAttribute("alt")?.trim(),"Describe each editorial image");
      assert.ok(Number(image.getAttribute("width"))>0&&Number(image.getAttribute("height"))>0);
      const isScreenshot=image.getAttribute("src")!.includes("soupmap-phone-");
      assert.match(image.getAttribute("srcset")??"",isScreenshot?/400w/:/640w/);
      assert.match(image.getAttribute("srcset")??"",isScreenshot?/688w/:/1024w/);
      assert.ok(image.getAttribute("sizes"));
      if(image.getAttribute("fetchpriority")!=="high")assert.equal(image.getAttribute("loading"),"lazy");
      for(const source of image.getAttribute("srcset")!.split(",")) {
        const path=source.trim().split(/\s+/)[0]!;
        const file=new URL(`../public${path}`,import.meta.url);
        assert.ok(statSync(file).size<260_000,`Oversized homepage image: ${path}`);
      }
    }
  } finally {
    await window.happyDOM.close();
  }
});
