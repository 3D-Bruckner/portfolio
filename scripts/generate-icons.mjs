// Writes the PNG icons from app/icon.svg (3dbruckner.de's mark, copied from its favicon.svg): the Home Screen icon (180, full-bleed: iOS
// rounds it itself), the manifest's 192 and 512 (rounded like the SVG) and a maskable 512 (full-bleed, the mark inside the central 80 %
// that Android's masks keep). Run `node scripts/generate-icons.mjs` after changing app/icon.svg and commit the PNGs.
import { readFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync(new URL("../app/icon.svg", import.meta.url), "utf8");
const body = svg.slice(svg.indexOf("<rect"), svg.lastIndexOf("</svg>")).replace(/<rect[^>]*\/>/, "");
const open = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">';
const BG = "#15171C";
const rounded = svg;
const fullBleed = `${open}<rect width="32" height="32" fill="${BG}"/>${body}</svg>`;
const maskable = `${open}<rect width="32" height="32" fill="${BG}"/><g transform="translate(3.2 3.2) scale(0.8)">${body}</g></svg>`;

const out = (name) => new URL(`../${name}`, import.meta.url).pathname;
const png = (source, size, name) =>
  sharp(Buffer.from(source), { density: 72 * (size / 32) })
    .resize(size, size)
    .png()
    .toFile(out(name));

await Promise.all([
  png(fullBleed, 180, "app/apple-icon.png"),
  png(rounded, 192, "public/icons/icon-192.png"),
  png(rounded, 512, "public/icons/icon-512.png"),
  png(maskable, 512, "public/icons/maskable-512.png"),
]);
