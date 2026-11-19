// Makes backend/fixtures/gps-rotated.jpg, the photo backend/photos.test.ts uploads: what a phone sends. Run once, and the result is
// committed: node backend/fixtures/make-fixtures.mjs
//
// 4000×3000 pixels stored sideways, with EXIF Orientation 6 (turn 90° clockwise to show), so it shows as a 3000×4000 portrait; a GPS
// position, a camera and a Display P3 colour profile, all of which the upload must drop. The stored top-left corner is red: once turned,
// it is the top-right one, so a test can see the photo was turned the right way.
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const out = fileURLToPath(new URL("./gps-rotated.jpg", import.meta.url));
const red = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 255, g: 0, b: 0 } } })
  .png()
  .toBuffer();

await sharp({ create: { width: 4000, height: 3000, channels: 3, background: { r: 40, g: 120, b: 200 } } })
  .composite([{ input: red, left: 0, top: 0 }])
  .withIccProfile("p3")
  .withExif({
    IFD0: { Make: "Apple", Model: "iPhone 15 Pro" },
    IFD3: { GPSLatitudeRef: "N", GPSLatitude: "48/1 8/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "11/1 34/1 0/1" },
  })
  .withMetadata({ orientation: 6 })
  .jpeg({ quality: 80 })
  .toFile(out);
console.log(`wrote ${out}`);
