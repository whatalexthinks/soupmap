import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { renderSiteShell } from "../src/render/shell.ts";

test("homepage puts the map first and keeps navigation and image disclosures", async () => {
  const html = renderSiteShell(
    readFileSync(new URL("../index.html", import.meta.url), "utf8"),
  );
  const window = new Window();

  try {
    window.document.write(html);
    const document = window.document;
    const mapAction = document.querySelector<HTMLAnchorElement>(
      '.home-hero__actions a[href="/map/"]',
    );
    const discoverAction = document.querySelector<HTMLAnchorElement>(
      '.home-hero__actions a[href="/catalog/"]',
    );
    const searchForm = document.querySelector("form[role=search]");

    assert.ok(mapAction, "Keep the map CTA in the hero actions");
    assert.ok(discoverAction, "Keep soup-shop browsing as the secondary action");
    assert.equal(mapAction.textContent?.trim().startsWith("Find my next bowl"), true);
    assert.ok(mapAction.classList.contains("home-button--solid"));
    assert.ok(!discoverAction.classList.contains("home-button--solid"));
    assert.ok(
      mapAction.compareDocumentPosition(searchForm!) &
        window.Node.DOCUMENT_POSITION_FOLLOWING,
      "Place the map CTA before the search form",
    );

    for (const label of ["Journal", "Recipes"]) {
      assert.ok(
        document.querySelector(`.site-header .site-nav a[href="/${label.toLowerCase()}/"]`),
        `Keep ${label} in the rendered header navigation`,
      );
      assert.ok(
        document.querySelector(`.home-footer nav a[href="/${label.toLowerCase()}/"]`),
        `Keep ${label} in the footer navigation`,
      );
    }

    assert.equal(document.querySelector(".home-footer__note"), null);
    assert.match(
      document.querySelector(".home-save__photo figcaption")?.textContent ?? "",
      /AI-GENERATED MOOD IMAGE/,
      "Keep the local AI image disclosure",
    );
  } finally {
    await window.happyDOM.close();
  }
});
