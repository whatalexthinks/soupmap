import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";

const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const socialDir = path.join(root, "public/social");
const outputSvg = path.join(socialDir, "soupmap-world.svg");
const outputPng = path.join(socialDir, "soupmap-world.png");

const instrumentPath = path.join(
  root,
  "node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-standard-normal.woff2",
);
const frauncesPath = path.join(
  root,
  "node_modules/@fontsource-variable/fraunces/files/fraunces-latin-opsz-normal.woff2",
);

const instrument = fontkit.openSync(instrumentPath);
const fraunces = fontkit.openSync(frauncesPath);

function pathText(font, text, x, baseline, size, fill, options = {}) {
  const scale = size / font.unitsPerEm;
  const run = font.layout(text);
  const spacing = options.spacing ?? 0;
  let cursor = 0;
  const glyphs = run.glyphs.map((glyph, index) => {
    const position = run.positions[index];
    const d = glyph.path.toSVG();
    const transform = `translate(${(cursor + position.xOffset).toFixed(2)} ${(-position.yOffset).toFixed(2)})`;
    cursor += position.xAdvance + spacing / scale;
    return d ? `<path d="${d}" transform="${transform}"/>` : "";
  }).join("");

  return `<g fill="${fill}" transform="translate(${x} ${baseline}) scale(${scale} ${-scale})">${glyphs}</g>`;
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <pattern id="paper-grain" width="32" height="32" patternUnits="userSpaceOnUse">
      <circle cx="4" cy="6" r=".7" fill="#75766a" opacity=".11"/>
      <circle cx="24" cy="19" r=".6" fill="#75766a" opacity=".08"/>
      <path d="M12 28h2" stroke="#75766a" stroke-width=".7" opacity=".07"/>
    </pattern>
    <clipPath id="art-circle"><circle cx="895" cy="337" r="232"/></clipPath>
  </defs>
  <rect width="1200" height="630" fill="#f7f6f0"/>
  <rect width="1200" height="630" fill="url(#paper-grain)"/>

  <!-- A restrained vermilion seal, drawn from the app's favicon mark. -->
  <g transform="translate(78 72)">
    <rect width="54" height="54" rx="8" fill="#b7442c"/>
    <g fill="none" stroke="#f3efe6" stroke-width="2.7" stroke-linecap="round">
      <path d="M19 21c-3-4 3-6 0-11"/><path d="M27 21c-3-4 3-6 0-11"/><path d="M35 21c-3-4 3-6 0-11"/>
    </g>
    <path d="M8 28h38c0 11-8.5 19-19 19S8 39 8 28Z" fill="#b7442c" stroke="#f3efe6" stroke-width="2.5"/>
    <ellipse cx="27" cy="28" rx="19" ry="4.8" fill="#e9c787" stroke="#f3efe6" stroke-width="2.5"/>
  </g>

  <!-- Global latitude/longitude lines: an atlas in the making, not a claim of shop coverage. -->
  <g fill="none" stroke="#9c9d8c" stroke-width="1.4" opacity=".38">
    <circle cx="963" cy="303" r="204" stroke="#b7442c" stroke-dasharray="2 9" stroke-linecap="round"/>
    <ellipse cx="963" cy="303" rx="204" ry="88"/>
    <ellipse cx="963" cy="303" rx="204" ry="151"/>
    <ellipse cx="963" cy="303" rx="92" ry="204"/>
    <ellipse cx="963" cy="303" rx="166" ry="204"/>
  </g>
  <circle cx="963" cy="303" r="204" fill="none" stroke="#b7442c" stroke-width="1.8" opacity=".48"/>
  <circle cx="963" cy="303" r="5" fill="#b7442c"/>
  <circle cx="1057" cy="121" r="124" fill="#e9c787" opacity=".24"/>
  <circle cx="1057" cy="121" r="69" fill="#e9c787" opacity=".24"/>
  <circle cx="1057" cy="121" r="40" fill="#b7442c" opacity=".88"/>

  <!-- Original bowl illustration, adapted from src/render/bowl.ts. -->
  <g transform="translate(741 144) scale(1.20)">
    <ellipse cx="158" cy="205" rx="108" ry="12" fill="#252c27" opacity=".10"/>
    <path d="M48 111c5 66 47 94 112 94s107-28 112-94" fill="#e8e4d9" stroke="#292e28" stroke-width="2"/>
    <path d="M69 144c23 33 57 46 91 46s68-13 91-46M83 163c22 19 47 27 77 27s55-8 77-27" fill="none" stroke="#b7b7a7" stroke-width="1.5"/>
    <ellipse cx="160" cy="110" rx="112" ry="57" fill="#faf7ed" stroke="#292e28" stroke-width="2"/>
    <ellipse cx="160" cy="111" rx="101" ry="46" fill="#c87943"/>
    <g fill="none" stroke="#f8e0a5" stroke-width="4" stroke-linecap="round">
      <path d="M102 107c11-17 56-22 68-5s-40 11-38 25 44 6 51-5M105 121c-4 17 50 25 77 13M119 95c20-9 58-4 63 7M101 134c19 12 41 15 63 12"/>
    </g>
    <path d="m185 83 32-21 23 34-33 18Z" fill="#344c39"/>
    <path d="m190 87 27-18m-21 26 26-18m-20 26 25-17" fill="none" stroke="#637658"/>
    <ellipse cx="104" cy="103" rx="25" ry="16" transform="rotate(-24 104 103)" fill="#f6f0d9" stroke="#d4c4a6"/>
    <ellipse cx="105" cy="103" rx="12" ry="10" transform="rotate(-24 105 103)" fill="#e7a037"/>
    <ellipse cx="210" cy="128" rx="25" ry="16" transform="rotate(-12 210 128)" fill="#b78365"/>
    <path d="M192 127c6-14 34-12 36 0s-24 17-27 7 14-14 18-7" fill="none" stroke="#eac2a1" stroke-width="3"/>
    <g fill="#51734a"><ellipse cx="146" cy="86" rx="7" ry="3"/><ellipse cx="160" cy="83" rx="7" ry="3"/><ellipse cx="171" cy="91" rx="7" ry="3"/><ellipse cx="154" cy="94" rx="7" ry="3"/></g>
    <g fill="none" stroke="#745442" stroke-width="4" stroke-linecap="round"><path d="m183 72 108-52"/><path d="m193 79 101-47"/></g>
    <g fill="none" stroke="#a9aca1" stroke-width="1.5" stroke-linecap="round"><path d="M132 49c-10-12 9-20 0-32M155 43c-10-12 9-20 0-32M178 49c-10-12 9-20 0-32"/></g>
  </g>

  <path d="M78 164h476" stroke="#252c27" stroke-width="1" opacity=".17"/>
  ${pathText(instrument, "Soupmap", 76, 287, 111, "#252c27", { spacing: -2.5 })}
  ${pathText(fraunces, "Find your next bowl.", 82, 366, 43, "#b7442c")}
  ${pathText(fraunces, "Anywhere.", 82, 415, 43, "#b7442c")}
  ${pathText(instrument, "A world of soups. Starting in Japan.", 84, 460, 19, "#555d53")}

  <path d="M82 488h469" stroke="#252c27" stroke-width="1" opacity=".17"/>
  <circle cx="89" cy="528" r="4" fill="#b7442c"/>
  ${pathText(instrument, "JAPAN PILOT · RAMEN · UDON · SOBA · ODEN", 104, 535, 14, "#252c27", { spacing: .45 })}
  ${pathText(instrument, "MORE REGIONS TO COME", 82, 581, 11, "#697064", { spacing: 1.1 })}

  <path d="M654 478c42 29 85 40 132 36 44-3 72-19 112-16 37 3 68 24 107 20" fill="none" stroke="#b7442c" stroke-width="1.6" stroke-dasharray="3 8" stroke-linecap="round" opacity=".7"/>
  <circle cx="654" cy="478" r="4" fill="#b7442c"/><circle cx="1005" cy="518" r="4" fill="#b7442c"/>
  <path d="M1138 544v22m-8-11h16" stroke="#252c27" stroke-width="1.3" opacity=".38"/>
</svg>
`;

await mkdir(socialDir, { recursive: true });
await writeFile(outputSvg, svg);

const renderer = new Resvg(svg, {
  fitTo: { mode: "width", value: 1200 },
  font: { loadSystemFonts: false },
});
const png = renderer.render().asPng();
await writeFile(outputPng, png);
console.log(`Rendered ${path.relative(root, outputPng)} (${renderer.width}×${renderer.height}, ${(png.length / 1024).toFixed(1)} KB)`);
