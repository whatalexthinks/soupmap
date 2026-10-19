import test from "node:test";
import assert from "node:assert/strict";
import { assertNoConflictMarkers } from "../scripts/lib/source-integrity.ts";

for (const marker of [
  "<<<<<<< HEAD",
  "=======",
  ">>>>>>> incoming",
  "||||||| base",
  "  <<<<<<< HEAD",
  "\t=======  ",
  "<<<<<<<< HEAD",
]) {
  test(`source validation rejects ${JSON.stringify(marker)} with its file and line`, () => {
    assert.throws(
      () => assertNoConflictMarkers(`<!doctype html>\r\n${marker}\r\n`, "index.html"),
      /Unresolved Git conflict marker in index\.html:2/,
    );
  });
}

test("source validation accepts clean HTML and CSS, including ordinary comparison characters", () => {
  assert.doesNotThrow(() => assertNoConflictMarkers(
    '<!doctype html>\n<h1>Find a bowl.</h1>\n<!-- ==== a section ==== -->',
    "index.html",
  ));
  assert.doesNotThrow(() => assertNoConflictMarkers(
    '@media (prefers-reduced-motion: reduce) {\n  a { transition: none; }\n}\na::after { content: "======="; }',
    "src/styles/home.css",
  ));
});
