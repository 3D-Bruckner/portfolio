// Makes backend/fixtures/gps-rotated.jpg, the photo backend/photos.test.ts uploads: what a phone sends. Run once, and the result is
// committed: node backend/fixtures/make-fixtures.mjs
//
// 4000×3000 pixels stored sideways, with EXIF Orientation 6 (turn 90° clockwise to show), so it shows as a 3000×4000 portrait; a Display
// P3 colour profile, both of which the original keeps. And what the original must drop: in the Exif a GPS position, a camera and the
// date taken; an XMP packet with the position and the date again; an IPTC block (APP13) with a caption and a place; a comment (COM).
// The stored top-left corner is red: once turned, it is the top-right one, so a test can see the photo was turned the right way.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const out = fileURLToPath(new URL("./gps-rotated.jpg", import.meta.url));
const red = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 255, g: 0, b: 0 } } })
  .png()
  .toBuffer();

const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="48,8.0N" exif:GPSLongitude="11,34.0E"
 exif:DateTimeOriginal="2026-11-19T10:30:00"/></rdf:RDF></x:xmpmeta>`;

const jpeg = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: { r: 40, g: 120, b: 200 } } })
  .composite([{ input: red, left: 0, top: 0 }])
  .withIccProfile("p3")
  .withExif({
    IFD0: { Make: "Apple", Model: "iPhone 15 Pro", DateTime: "2026:11:19 10:30:00" },
    IFD2: { DateTimeOriginal: "2026:11:19 10:30:00" },
    IFD3: { GPSLatitudeRef: "N", GPSLatitude: "48/1 8/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "11/1 34/1 0/1" },
  })
  .withXmp(xmp)
  .withMetadata({ orientation: 6 })
  .jpeg({ quality: 80 })
  .toBuffer();

/** One marker segment: FF, the marker, the length (which counts itself) and the payload. */
function segment(marker, payload) {
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);
  return Buffer.concat([Buffer.from([0xff, marker]), length, payload]);
}

// IPTC as Photoshop keeps it: an 8BIM resource 0x0404 holding IPTC datasets 2:120 (caption) and 2:90 (city).
const dataset = (n, text) => {
  const t = Buffer.from(text, "latin1");
  return Buffer.concat([Buffer.from([0x1c, 2, n, t.length >> 8, t.length & 0xff]), t]);
};
const iptc = Buffer.concat([dataset(120, "Vase at home"), dataset(90, "Munich")]);
const resource = Buffer.concat([Buffer.from("8BIM\x04\x04\0\0", "latin1"), Buffer.from([0, 0, iptc.length >> 8, iptc.length & 0xff]), iptc]);
const app13 = segment(0xed, Buffer.concat([Buffer.from("Photoshop 3.0\0", "latin1"), resource, Buffer.alloc(iptc.length % 2)]));
const com = segment(0xfe, Buffer.from("Taken at Marienplatz", "latin1"));

writeFileSync(out, Buffer.concat([jpeg.subarray(0, 2), com, app13, jpeg.subarray(2)]));
console.log(`wrote ${out}`);
