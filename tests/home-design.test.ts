test("hero leads with soup discovery and provides a stable accessible headline",async()=>{
  const window=new Window();
  try {
    window.document.write(homepageHtml());
    const title=window.document.querySelector("#hero-title");
    assert.equal(title?.getAttribute("aria-label"),"Your next favorite soup.");
    const words=title?.querySelector(".home-hero__word");
    assert.equal(words?.getAttribute("aria-hidden"),"true");
    assert.deepEqual([...words!.querySelectorAll("span")].map(word=>word.textContent),["favorite","must-try","go-to"]);
    assert.equal(words?.querySelector(".is-current")?.textContent,"favorite");
    assert.equal(title?.querySelector(".home-hero__soup")?.textContent,"soup.");
  } finally {await window.happyDOM.close();}
});
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
    const leadImages=images.filter(img=>img.getAttribute("fetchpriority")==="high");
    assert.ok(leadImages.length<=1,"Only the compact opening preview should receive high priority");
    for(const image of leadImages)assert.ok(image.getAttribute("src")?.includes("soupmap-tokyo-closeup-"));
    for(const image of images) {
      assert.ok(image.getAttribute("alt")?.trim(),"Describe each editorial image");
      assert.ok(Number(image.getAttribute("width"))>0&&Number(image.getAttribute("height"))>0);
      const isPhone=image.getAttribute("src")!.includes("soupmap-phone-");
      const isCloseup=image.getAttribute("src")!.includes("soupmap-tokyo-closeup-");
      assert.match(image.getAttribute("srcset")??"",isPhone?/400w/:isCloseup?/320w/:/640w/);
      assert.match(image.getAttribute("srcset")??"",isPhone||isCloseup?/518w/:/1024w/);
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

test("homepage uses the updated phone capture and a lightweight clickable hero screenshot", async()=>{
  const window=new Window();
  try {
    window.document.write(homepageHtml());
    const document=window.document;
    const phone=document.querySelector(".home-phone img");
    assert.match(phone?.getAttribute("src")??"",/soupmap-phone-tokyo-518\.webp$/);
    assert.equal(phone?.getAttribute("width"),"518");
    assert.equal(phone?.getAttribute("height"),"1080");
    const teaser=document.querySelector<HTMLImageElement>('.home-hero img[src*="soupmap-tokyo-closeup-"]');
    assert.ok(teaser,"Show the current real app near the opening copy");
    assert.equal(teaser.closest("a")?.getAttribute("href"),"/map/");
    assert.ok(teaser.getAttribute("alt")?.trim());
    for(const source of teaser.getAttribute("srcset")!.split(",")) {
      const path=source.trim().split(/\s+/)[0]!;
      assert.ok(statSync(new URL(`../public${path}`,import.meta.url)).size<120_000);
    }
    assert.equal(document.querySelector(".home-phone__island"),null);
  } finally { await window.happyDOM.close(); }
});
