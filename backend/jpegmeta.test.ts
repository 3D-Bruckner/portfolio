import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { stripJpegMetadata } from "./jpegmeta";
import type { Outcome } from "./outcome";

const FIXTURE = join(import.meta.dirname, "fixtures", "gps-rotated.jpg");

function value<T>(o: Outcome<T>): T {
  if (!o.ok) throw new Error(`expected ok, got ${o.reason}: ${o.message}`);
  return o.value;
}

const u16 = (n: number) => Buffer.from([n >> 8, n & 0xff]);
/** One marker segment: FF, the marker, the length (which counts itself) and the payload. */
const segment = (marker: number, payload: Buffer | string) => {
  const p = typeof payload === "string" ? Buffer.from(payload, "latin1") : payload;
  return Buffer.concat([Buffer.from([0xff, marker]), u16(p.length + 2), p]);
};

/** The segments before the first SOS, as [marker, payload] (a test's own walk over a well-formed file), and where the first SOS starts. */
function header(jpeg: Buffer): { segments: [number, Buffer][]; sos: number } {
  const segments: [number, Buffer][] = [];
  let pos = 2;
  for (;;) {
    expect(jpeg[pos]).toBe(0xff);
    const marker = jpeg.readUInt8(pos + 1);
    if (marker === 0xda) return { segments, sos: pos };
    const length = jpeg.readUInt16BE(pos + 2);
    segments.push([marker, jpeg.subarray(pos + 4, pos + 2 + length)]);
    pos += 2 + length;
  }
}

/** The bytes from the first SOS up to and including EOI. */
const scans = (jpeg: Buffer): Buffer => {
  const from = header(jpeg).sos;
  const eoi = jpeg.lastIndexOf(Buffer.from([0xff, 0xd9]));
  return jpeg.subarray(from, eoi + 2);
};

/** A JPEG made by sharp, with whatever segments are put in after SOI and after the header (before the first SOS). */
async function jpegWith(opts: { afterSoi?: Buffer[]; beforeSos?: Buffer[]; trailer?: Buffer; progressive?: boolean } = {}): Promise<Buffer> {
  const plain = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 10, g: 200, b: 90 } } })
    .jpeg({ quality: 90, progressive: opts.progressive ?? false })
    .toBuffer();
  const { sos } = header(plain);
  return Buffer.concat([
    plain.subarray(0, 2),
    ...(opts.afterSoi ?? []),
    plain.subarray(2, sos),
    ...(opts.beforeSos ?? []),
    plain.subarray(sos),
    opts.trailer ?? Buffer.alloc(0),
  ]);
}

/** A big-endian TIFF/Exif payload with IFD0 holding these SHORT tags. */
function exif(tags: [number, number][], order: "MM" | "II" = "MM"): Buffer {
  const le = order === "II";
  const b = Buffer.alloc(6 + 8 + 2 + tags.length * 12 + 4);
  b.write("Exif\0\0", 0, "latin1");
  b.write(order, 6, "latin1");
  const w16 = (v: number, at: number) => (le ? b.writeUInt16LE(v, at) : b.writeUInt16BE(v, at));
  const w32 = (v: number, at: number) => (le ? b.writeUInt32LE(v, at) : b.writeUInt32BE(v, at));
  w16(42, 8);
  w32(8, 10);
  w16(tags.length, 14);
  tags.forEach(([tag, v], i) => {
    const at = 16 + i * 12;
    w16(tag, at);
    w16(3, at + 2);
    w32(1, at + 4);
    w16(v, at + 8);
  });
  return b;
}

describe("stripJpegMetadata", () => {
  it("keeps the fixture's scan data byte for byte, its colour profile and its orientation, and drops GPS, camera and the rest", async () => {
    const input = readFileSync(FIXTURE);
    const out = value(stripJpegMetadata(input));
    expect(scans(out).equals(scans(input))).toBe(true);
    const m = await sharp(out).metadata();
    expect(m).toMatchObject({ format: "jpeg", width: 4000, height: 3000, orientation: 6 });
    expect(m.icc?.equals((await sharp(input).metadata()).icc!)).toBe(true);
    expect(m.xmp).toBeUndefined();
    expect(m.iptc).toBeUndefined();
    for (const s of ["GPS", "Apple", "iPhone", "JFIF"]) expect(out.includes(s), s).toBe(false);
    // The Exif left is IFD0 with the one Orientation entry: no other tag, no further IFD.
    const app1 = header(out).segments.filter(([m]) => m === 0xe1);
    expect(app1).toHaveLength(1);
    expect(app1[0]![1].length).toBe(6 + 8 + 2 + 12 + 4);
    // Decoded, nothing changed.
    const [a, b] = await Promise.all([sharp(input).raw().toBuffer(), sharp(out).raw().toBuffer()]);
    expect(a.equals(b)).toBe(true);
  });

  it("drops XMP, IPTC, comments, other APPn and what follows EOI; keeps Adobe's colour transform, the tables and the frame", async () => {
    const trailer = Buffer.from("MPF trailer secret: another image with GPS");
    const input = await jpegWith({
      afterSoi: [
        segment(0xe1, "http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>GPS secret</x:xmpmeta>"),
        segment(0xed, "Photoshop 3.0\0IPTC secret"),
        segment(0xfe, "a comment, secret"),
        segment(0xe5, "vendor secret"),
        segment(0xee, Buffer.from("Adobe\0\x64\0\0\0\0\x01", "latin1")),
      ],
      beforeSos: [segment(0xfe, "late comment, secret")],
      trailer,
    });
    const out = value(stripJpegMetadata(input));
    expect(out.includes("secret")).toBe(false);
    expect(out.includes("GPS")).toBe(false);
    expect(header(out).segments.map(([m]) => m)).toEqual(
      header(input)
        .segments.map(([m]) => m)
        .filter((m) => m === 0xee || m < 0xe0),
    );
    expect(out.subarray(-2).equals(Buffer.from([0xff, 0xd9]))).toBe(true);
    expect(scans(out).equals(scans(input.subarray(0, input.length - trailer.length)))).toBe(true);
    const m = await sharp(out).metadata();
    expect(m.orientation).toBeUndefined();
    expect(m.exif).toBeUndefined();
  });

  it("keeps a colour profile in several APP2 chunks, in order", async () => {
    const icc = (await sharp(FIXTURE).metadata()).icc!;
    const half = Math.floor(icc.length / 2);
    const chunk = (n: number, part: Buffer) => segment(0xe2, Buffer.concat([Buffer.from("ICC_PROFILE\0", "latin1"), Buffer.from([n, 2]), part]));
    const input = await jpegWith({ afterSoi: [chunk(1, icc.subarray(0, half)), segment(0xe2, "MPF\0other APP2"), chunk(2, icc.subarray(half))] });
    const out = value(stripJpegMetadata(input));
    expect(header(out).segments.filter(([m]) => m === 0xe2)).toHaveLength(2);
    expect((await sharp(out).metadata()).icc?.equals(icc)).toBe(true);
    expect(out.includes("MPF")).toBe(false);
  });

  it("reads the orientation from little- and big-endian Exif, and writes nothing for orientation 1 or none", async () => {
    for (const order of ["II", "MM"] as const) {
      const input = await jpegWith({
        afterSoi: [
          segment(
            0xe1,
            exif(
              [
                [0x010f, 7],
                [0x0112, 8],
                [0x0110, 9],
              ],
              order,
            ),
          ),
        ],
      });
      expect((await sharp(value(stripJpegMetadata(input))).metadata()).orientation, order).toBe(8);
    }
    const one = value(stripJpegMetadata(await jpegWith({ afterSoi: [segment(0xe1, exif([[0x0112, 1]]))] })));
    expect(header(one).segments.some(([m]) => m === 0xe1)).toBe(false);
    // An Exif that can't be read is dropped like any other; the photo is kept.
    const broken = value(stripJpegMetadata(await jpegWith({ afterSoi: [segment(0xe1, Buffer.from("Exif\0\0MM\0\x2a\0\0\xff\xff", "latin1"))] })));
    expect(header(broken).segments.some(([m]) => m === 0xe1)).toBe(false);
  });

  it("keeps a progressive JPEG's scans, and the tables between them, byte for byte; drops a comment between scans", async () => {
    const input = await jpegWith({ progressive: true });
    const out = value(stripJpegMetadata(input));
    expect(scans(out).equals(scans(input))).toBe(true);
    // A comment put between two scans goes; everything else stays.
    const second = input.indexOf(Buffer.from([0xff, 0xda]), header(input).sos + 2);
    expect(second).toBeGreaterThan(0);
    const comment = segment(0xfe, "between scans, secret");
    const withComment = Buffer.concat([input.subarray(0, second), comment, input.subarray(second)]);
    const cleaned = value(stripJpegMetadata(withComment));
    expect(cleaned.includes("secret")).toBe(false);
    expect(cleaned.equals(out)).toBe(true);
  });

  it("walks entropy-coded data: stuffed FF00, restart markers and fill bytes are data, the first real marker ends the scan", () => {
    const sof = segment(0xc0, Buffer.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0]));
    const sos = segment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0]));
    const data = Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0xd7, 0x78, 0xff, 0xff, 0xff, 0xd9]);
    const input = Buffer.concat([Buffer.from([0xff, 0xd8]), segment(0xfe, "c"), sof, sos, data]);
    expect(value(stripJpegMetadata(input)).equals(Buffer.concat([Buffer.from([0xff, 0xd8]), sof, sos, data]))).toBe(true);
    // A COM after the scan's data, before EOI, goes too.
    const late = Buffer.concat([Buffer.from([0xff, 0xd8]), sof, sos, data.subarray(0, -2), segment(0xfe, "x"), Buffer.from([0xff, 0xd9])]);
    expect(value(stripJpegMetadata(late)).equals(Buffer.concat([Buffer.from([0xff, 0xd8]), sof, sos, data]))).toBe(true);
  });

  it("never throws: every cut of a JPEG short of its end is refused, and damaged bytes give an answer, not an exception", async () => {
    const whole = await jpegWith({ afterSoi: [segment(0xe1, exif([[0x0112, 6]])), segment(0xfe, "c")], progressive: true });
    for (let n = 0; n < whole.length; n++) expect(stripJpegMetadata(whole.subarray(0, n)).ok, `cut at ${n}`).toBe(false);
    expect(stripJpegMetadata(whole).ok).toBe(true);
    // A fixed pseudo-random sequence, so a failure can be repeated.
    let seed = 1;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
    for (let round = 0; round < 2000; round++) {
      const damaged = Buffer.from(whole);
      for (let k = 0; k < 1 + (round % 4); k++) damaged[next() % damaged.length] = next() % 256;
      expect(() => stripJpegMetadata(damaged), `round ${round}`).not.toThrow();
    }
  });

  it("keeps Adobe's APP14 at exactly its 12 bytes: a tail after them is gone", async () => {
    const adobe = Buffer.from("Adobe\0\x64\0\0\0\0\x01", "latin1");
    const input = await jpegWith({ afterSoi: [segment(0xee, Buffer.concat([adobe, Buffer.from("GPSLatitude 48.137 N", "latin1")]))] });
    const out = value(stripJpegMetadata(input));
    expect(out.includes("GPSLatitude")).toBe(false);
    expect(header(out).segments.filter(([m]) => m === 0xee)).toEqual([[0xee, adobe]]);
    expect(scans(out).equals(scans(input))).toBe(true);
    // Shorter than Adobe's 12 bytes is no Adobe segment a decoder can read.
    expect(stripJpegMetadata(await jpegWith({ afterSoi: [segment(0xee, "Adobe\0\x64")] }))).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("refuses a colour profile with something after it, or chunks whose sequence doesn't add up", async () => {
    const icc = (await sharp(FIXTURE).metadata()).icc!;
    const chunk = (seq: number, count: number, part: Buffer) =>
      segment(0xe2, Buffer.concat([Buffer.from("ICC_PROFILE\0", "latin1"), Buffer.from([seq, count]), part]));
    const half = Math.floor(icc.length / 2);
    const [a, b] = [icc.subarray(0, half), icc.subarray(half)];
    const tail = Buffer.from("GPSLatitude 48.137 N", "latin1");
    const cases: [string, Buffer[]][] = [
      ["a tail after the profile", [chunk(1, 1, Buffer.concat([icc, tail]))]],
      ["a tail in the last chunk", [chunk(1, 2, a), chunk(2, 2, Buffer.concat([b, tail]))]],
      ["a chunk missing", [chunk(1, 2, a)]],
      ["a chunk twice", [chunk(1, 2, a), chunk(1, 2, a), chunk(2, 2, b)]],
      ["sequence 0", [chunk(0, 1, icc)]],
      ["a sequence beyond the count", [chunk(1, 2, a), chunk(3, 2, b)]],
      ["counts that differ", [chunk(1, 2, a), chunk(2, 3, b)]],
      ["a profile shorter than its own header says", [chunk(1, 1, icc.subarray(0, icc.length - 10))]],
    ];
    for (const [name, chunks] of cases) {
      const o = stripJpegMetadata(await jpegWith({ afterSoi: chunks }));
      expect(o, name).toMatchObject({ ok: false, reason: "invalid" });
    }
    // The same chunks in order, out of order in the file, are fine.
    const ok = value(stripJpegMetadata(await jpegWith({ afterSoi: [chunk(2, 2, b), chunk(1, 2, a)] })));
    expect((await sharp(ok).metadata()).icc?.equals(icc)).toBe(true);
  });

  it("refuses a DNL longer than its 4 bytes, and any marker that isn't a JPEG's (no tail rides along)", async () => {
    const sof = segment(0xc0, Buffer.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0]));
    const sos = segment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0]));
    const soi = Buffer.from([0xff, 0xd8]);
    const data = Buffer.from([0x12, 0x34]);
    const eoi = Buffer.from([0xff, 0xd9]);
    const file = (...parts: Buffer[]) => Buffer.concat([soi, ...parts]);
    // A DNL of 4 bytes (its line count) after the first scan is kept.
    const dnl = segment(0xdc, Buffer.from([0, 1]));
    expect(value(stripJpegMetadata(file(sof, sos, data, dnl, eoi))).equals(file(sof, sos, data, dnl, eoi))).toBe(true);
    const cases: [string, Buffer][] = [
      ["a DNL with a tail", file(sof, sos, data, segment(0xdc, Buffer.from("\0\x01GPSLatitude 48.137 N", "latin1")), eoi)],
      ["DHP", file(segment(0xde, "GPSLatitude"), sof, sos, data, eoi)],
      ["EXP", file(sof, segment(0xdf, Buffer.from([0x11])), sos, data, eoi)],
      ["JPG", file(segment(0xc8, "GPSLatitude"), sof, sos, data, eoi)],
      ["JPGn", file(segment(0xf3, "GPSLatitude"), sof, sos, data, eoi)],
      ["TEM", file(Buffer.from([0xff, 0x01]), sof, sos, data, eoi)],
      ["a second frame", file(sof, sof, sos, data, eoi)],
      ["an unknown marker after the scan", file(sof, sos, data, segment(0xf0, "GPSLatitude"), eoi)],
    ];
    for (const [name, input] of cases) expect(stripJpegMetadata(input), name).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("pins the length of every kept segment that has one: DRI 4, SOF 8+3·Nf, SOS 6+2·Ns; DNL only between scans", () => {
    const soi = Buffer.from([0xff, 0xd8]);
    const sof = segment(0xc0, Buffer.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0]));
    const sos = segment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0]));
    const dri = segment(0xdd, Buffer.from([0, 4]));
    const dnl = segment(0xdc, Buffer.from([0, 1]));
    const data = Buffer.from([0x12, 0x34]);
    const eoi = Buffer.from([0xff, 0xd9]);
    const tail = Buffer.from("GPSLatitude 48.137 N", "latin1");
    const file = (...parts: Buffer[]) => Buffer.concat([soi, ...parts]);
    // At their lengths they are kept as they are, a DRI between scans too.
    const good = file(dri, sof, sos, data, dri, sos, data, eoi);
    expect(value(stripJpegMetadata(good)).equals(good)).toBe(true);
    // Two components: SOF 8+3·2 = 14, SOS 6+2·2 = 10.
    const sof2 = segment(0xc0, Buffer.from([8, 0, 1, 0, 1, 2, 1, 0x11, 0, 2, 0x11, 0]));
    const sos2 = segment(0xda, Buffer.from([2, 1, 0, 2, 0x11, 0, 0x3f, 0]));
    expect(value(stripJpegMetadata(file(sof2, sos2, data, eoi))).equals(file(sof2, sos2, data, eoi))).toBe(true);
    const cases: [string, Buffer][] = [
      ["a DRI with a tail", file(segment(0xdd, Buffer.concat([Buffer.from([0, 4]), tail])), sof, sos, data, eoi)],
      ["a DRI with a tail between scans", file(sof, sos, data, segment(0xdd, Buffer.concat([Buffer.from([0, 4]), tail])), sos, data, eoi)],
      ["a DRI too short", file(segment(0xdd, Buffer.from([0])), sof, sos, data, eoi)],
      ["a frame with a tail", file(segment(0xc0, Buffer.concat([Buffer.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0]), tail])), sos, data, eoi)],
      ["a frame shorter than its components", file(segment(0xc0, Buffer.from([8, 0, 1, 0, 1, 2, 1, 0x11, 0])), sos, data, eoi)],
      ["a frame without its component count", file(segment(0xc0, Buffer.from([8, 0, 1, 0, 1])), sos, data, eoi)],
      ["a scan header with a tail", file(sof, segment(0xda, Buffer.concat([Buffer.from([1, 1, 0, 0, 0x3f, 0]), tail])), data, eoi)],
      ["a later scan header with a tail", file(sof, sos, data, segment(0xda, Buffer.concat([Buffer.from([1, 1, 0, 0, 0x3f, 0]), tail])), data, eoi)],
      ["a scan header shorter than its components", file(sof, segment(0xda, Buffer.from([2, 1, 0, 0, 0x3f, 0])), data, eoi)],
      ["a scan header without its component count", file(sof, segment(0xda, Buffer.alloc(0)), data, eoi)],
      ["a DNL before the first scan", file(sof, dnl, sos, data, eoi)],
    ];
    for (const [name, input] of cases) expect(stripJpegMetadata(input), name).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("refuses what isn't a whole JPEG", async () => {
    const whole = readFileSync(FIXTURE);
    const sof = segment(0xc0, Buffer.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0]));
    const sos = segment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0]));
    const soi = Buffer.from([0xff, 0xd8]);
    const cases: [string, Buffer][] = [
      ["empty", Buffer.alloc(0)],
      ["text", Buffer.from("this is not a photo\n".repeat(50))],
      [
        "a PNG",
        await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } })
          .png()
          .toBuffer(),
      ],
      ["SOI only", soi],
      ["cut off in the header", whole.subarray(0, 100)],
      ["cut off in the scan data", whole.subarray(0, Math.floor(whole.length / 2))],
      ["cut off right before EOI", whole.subarray(0, whole.length - 2)],
      ["a segment longer than the file", Buffer.concat([soi, Buffer.from([0xff, 0xe1, 0xff, 0xff, 1, 2, 3])])],
      ["a length below 2", Buffer.concat([soi, Buffer.from([0xff, 0xfe, 0x00, 0x01]), sof, sos, Buffer.from([1, 0xff, 0xd9])])],
      ["no marker where one belongs", Buffer.concat([soi, Buffer.from([0x00, 0x11]), sof, sos, Buffer.from([1, 0xff, 0xd9])])],
      ["EOI before any image data", Buffer.concat([soi, sof, Buffer.from([0xff, 0xd9])])],
      ["a second SOI", Buffer.concat([soi, soi, sof, sos, Buffer.from([1, 0xff, 0xd9])])],
      ["scan data without a frame", Buffer.concat([soi, sos, Buffer.from([1, 0xff, 0xd9])])],
      ["a lone FF at the end", Buffer.concat([soi, sof, sos, Buffer.from([1, 0xff])])],
    ];
    for (const [name, input] of cases) expect(stripJpegMetadata(input), name).toMatchObject({ ok: false, reason: "invalid" });
  });
});
