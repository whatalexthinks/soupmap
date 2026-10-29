import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";

const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const socialDir = path.join(root, "public/social");
const fontPath = path.join(
  root,
  "node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2",
);
const logoPath = path.join(root, "public/brand-mark-black.png");
const phonePath = path.join(root, "public/images/editorial/soupmap-phone-tokyo-518.webp");
const closeupPath = path.join(root, "public/images/editorial/soupmap-tokyo-closeup-518.webp");
const font = fontkit.openSync(fontPath);

const [logoBuffer, phoneBuffer, closeupBuffer] = await Promise.all([
  readFile(logoPath),
  Promise.resolve(execFileSync("magick", [phonePath, "png:-"])),
  Promise.resolve(execFileSync("magick", [closeupPath, "png:-"])),
]);
const logo = `data:image/png;base64,${logoBuffer.toString("base64")}`;
const phone = `data:image/png;base64,${phoneBuffer.toString("base64")}`;
const closeup = `data:image/png;base64,${closeupBuffer.toString("base64")}`;

function pathText(text, x, baseline, size, fill, spacing = 0, weight = 500) {
  const scale = size / font.unitsPerEm;
  const run = font.layout(text, { wght: weight });
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

const cardSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <pattern id="grain" width="28" height="28" patternUnits="userSpaceOnUse">
      <circle cx="4" cy="6" r=".7" fill="#706b5c" opacity=".12"/>
      <circle cx="21" cy="19" r=".55" fill="#706b5c" opacity=".10"/>
      <path d="M11 25h3" stroke="#706b5c" stroke-width=".6" opacity=".10"/>
    </pattern>
    <clipPath id="photoClip"><rect x="698" y="34" width="464" height="562" rx="15"/></clipPath>
    <clipPath id="insetClip"><rect x="858" y="395" width="263" height="152" rx="9"/></clipPath>
  </defs>
  <rect width="1200" height="630" fill="#f4efe4"/>
  <rect width="1200" height="630" fill="url(#grain)"/>
  <path d="M45 37h610" stroke="#d9d0bf" stroke-width="1"/>
  <image x="78" y="62" width="48" height="50" preserveAspectRatio="xMidYMid meet" xlink:href="${logo}"/>
  ${pathText("Soupmap", 140, 100, 31, "#252521", -0.45, 650)}
  <path d="M78 139h556" stroke="#d9d0bf" stroke-width="1"/>
  ${pathText("A world of soup.", 78, 226, 59, "#252521", -1.25, 650)}
  ${pathText("Find your next bowl.", 81, 277, 27, "#a9513d", -0.35, 550)}
  <path d="M81 309h64" stroke="#a9513d" stroke-width="3"/>
  ${pathText("A living map of the places", 81, 360, 22, "#4d5147", 0, 450)}
  ${pathText("that make soup worth finding.", 81, 391, 22, "#4d5147", 0, 450)}
  <rect x="78" y="445" width="553" height="88" rx="8" fill="#e9e1d2"/>
  <rect x="78" y="445" width="4" height="88" rx="2" fill="#a9513d"/>
  ${pathText("STARTING IN JAPAN", 101, 477, 13, "#696d60", 1.35, 650)}
  ${pathText("From Tokyo, out into the world.", 101, 510, 19, "#252521", -0.15, 550)}
  ${pathText("SOUP SHOPS · LOCAL MAPS · GOOD FINDS", 81, 577, 12, "#696d60", 1.05, 600)}
  <rect x="698" y="34" width="464" height="562" rx="15" fill="#ddd5c5"/>
  <g clip-path="url(#photoClip)">
    <image x="698" y="34" width="464" height="562" preserveAspectRatio="xMidYMid slice" xlink:href="${phone}"/>
    <rect x="720" y="53" width="153" height="34" rx="17" fill="#f4efe4" opacity=".97"/>
    <circle cx="738" cy="70" r="4" fill="#a9513d"/>
    ${pathText("TOKYO, JAPAN", 750, 75, 12, "#252521", 0.8, 650)}
    <rect x="846" y="383" width="287" height="176" rx="13" fill="#f4efe4" opacity=".96"/>
    <g clip-path="url(#insetClip)">
      <image x="858" y="395" width="263" height="152" preserveAspectRatio="xMidYMid slice" xlink:href="${closeup}"/>
    </g>
    <rect x="858" y="395" width="263" height="152" rx="9" fill="none" stroke="#f4efe4" stroke-width="1"/>
  </g>
  <rect x="698.5" y="34.5" width="463" height="561" rx="14.5" fill="none" stroke="#252521" stroke-opacity=".12"/>
</svg>`;

function iconSvg(size, safe = false) {
  const inset = size * (safe ? 0.2 : 0.1);
  const markSize = size - inset * 2;
  const corner = safe ? 0 : Math.round(size * 0.19);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
 <rect width="${size}" height="${size}" rx="${corner}" fill="#f4efe4"/>
 <image x="${inset}" y="${inset}" width="${markSize}" height="${markSize}" preserveAspectRatio="xMidYMid meet" xlink:href="${logo}"/>
</svg>`;
}

async function renderSvg(svg, width, height, outputPath) {
  const renderer = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { loadSystemFonts: false },
  });
  const raw = renderer.render().asPng();
  const png = width === 1200
    ? execFileSync("magick", ["png:-", "-strip", "-dither", "None", "-colors", "256", "PNG8:-"], { input: raw })
    : raw;
  await writeFile(outputPath, png);
  console.log(`${path.relative(root, outputPath)} (${renderer.width}×${renderer.height}, ${(png.length / 1024).toFixed(1)} KB)`);
}

await mkdir(socialDir, { recursive: true });

// The two historical world card paths and og.png stay byte-for-byte compatible.
for (const filename of ["soupmap-share.svg", "soupmap-world.svg"]) {
  await writeFile(path.join(socialDir, filename), cardSvg);
}
for (const filename of ["soupmap-share.png", "soupmap-world.png"]) {
  await renderSvg(cardSvg, 1200, 630, path.join(socialDir, filename));
}
await writeFile(path.join(root, "public/og.png"), await readFile(path.join(socialDir, "soupmap-share.png")));

const iconVariants = [
  ["favicon.svg", 64, true],
  ["favicon-32.png", 32, false],
  ["apple-touch-icon.png", 180, false],
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true],
];
for (const [filename, size, safe] of iconVariants) {
  const svg = iconSvg(size, safe);
  const outputPath = path.join(root, "public", filename);
  if (filename.endsWith(".svg")) {
    await writeFile(outputPath, svg);
    console.log(`${path.relative(root, outputPath)} (${size}×${size}, SVG)`);
  } else {
    await renderSvg(svg, size, size, outputPath);
  }
}
