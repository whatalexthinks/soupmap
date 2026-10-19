import test from "node:test";
import assert from "node:assert/strict";
import { assertHomepageStructure } from "../scripts/lib/homepage-integrity.ts";

const page = `<body class="home-page"><header></header><main><h1 id="hero-title">Soupmap</h1></main><footer></footer></body>`;

test("build-time homepage validation accepts a coherent page", async () => {
  await assert.doesNotReject(assertHomepageStructure(page));
});

test("build-time homepage validation rejects competing headlines and page shells", async () => {
  for (const [before, after] of [
    ["</h1>", "</h1><h1>Alternative design</h1>"],
    ["</main>", "</main><main></main>"],
    ["</header>", "</header><header></header>"],
    ["</footer>", "</footer><footer></footer>"],
  ]) {
    await assert.rejects(assertHomepageStructure(page.replace(before, after)), /exactly one/);
  }
});

test("build-time homepage validation rejects repeated section IDs", async () => {
  await assert.rejects(
    assertHomepageStructure(page.replace("</main>", '<section id="hero-title"></section></main>')),
    /Duplicate homepage ID: hero-title/,
  );
});
