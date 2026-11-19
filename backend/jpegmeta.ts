// A JPEG's metadata taken out without touching its image: a walk over the file's marker segments (no decoding) that keeps only what a
// decoder needs, by a whitelist. Kept: SOI; the frame (SOF0–3, 5–7, 9–11, 13–15; one); the tables (DHT, DAC, DQT); the restart interval
// (DRI); DNL between scans only; every scan's entropy-coded data byte for byte; EOI; the colour profile (APP2 ICC_PROFILE chunks, their
// sequence checked and their data exactly the profile its header announces); Adobe's APP14 at exactly its 12 bytes (it says how the colour
// components are coded, nothing about the photo). Dropped: every other APPn (Exif with its GPS position, camera and date, XMP, JFIF and
// its thumbnail, IPTC, MPF, makers' own), every comment, and whatever follows EOI (an iPhone puts further images there). Any other marker
// (DHP, EXP, JPG, JPGn, TEM, a second frame), a DNL before the first scan, a DRI, DNL, frame or scan header longer or shorter than the
// standard makes it (DRI and DNL 4 bytes, a frame header 8 + 3 per component, a scan header 6 + 2 per component) and a colour profile with a
// tail are refused: nothing rides along in a segment that is kept. The orientation, read from the Exif, is written back as a minimal Exif of its own: IFD0 with the one Orientation entry. A
// file that isn't one whole JPEG is refused as invalid.
import { invalid, ok, type Outcome } from "./outcome";

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const COM = 0xfe;
const DHT = 0xc4;
const DAC = 0xcc;
const DQT = 0xdb;
const DNL = 0xdc;
const DRI = 0xdd;
const APP1 = 0xe1;
const APP2 = 0xe2;
const APP14 = 0xee;
const isApp = (m: number) => m >= 0xe0 && m <= 0xef;
const isRst = (m: number) => m >= 0xd0 && m <= 0xd7;
/** SOF0–SOF15, less DHT (C4), JPG (C8) and DAC (CC), which share the range. */
const isFrame = (m: number) => m >= 0xc0 && m <= 0xcf && m !== DHT && m !== 0xc8 && m !== DAC;
/** The tables and settings a decoder reads, before or between scans. */
const isTable = (m: number) => m === DHT || m === DAC || m === DQT || m === DRI || m === DNL;
const hex = (m: number) => `FF${m.toString(16).toUpperCase().padStart(2, "0")}`;

const ICC = Buffer.from("ICC_PROFILE\0", "latin1");
const ADOBE = Buffer.from("Adobe", "latin1");
/** Adobe's APP14: "Adobe", version, flags0, flags1, transform. */
const ADOBE_LENGTH = 12;
const EXIF = Buffer.from("Exif\0\0", "latin1");
const ORIENTATION = 0x0112;

class Malformed extends Error {}

/** The JPEG in `input` with its metadata removed as described above; its image data is the input's, byte for byte. */
export function stripJpegMetadata(input: Buffer): Outcome<Buffer> {
  try {
    return ok(strip(input));
  } catch (e) {
    if (e instanceof Malformed) return invalid(`not a whole JPEG: ${e.message}`);
    throw e;
  }
}

/** A segment as written: FF, the marker, the length (which counts itself) and the payload. */
const segmentOf = (code: number, payload: Buffer): Buffer => {
  const head = Buffer.from([0xff, code, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
};

/** The colour profile's chunks in their order, checked: one of each sequence number 1..count, and together exactly the profile. */
function iccSegments(chunks: Buffer[]): Buffer[] {
  if (chunks.length === 0) return [];
  const count = chunks[0]!.readUInt8(ICC.length + 1);
  const bySeq = new Map<number, Buffer>();
  for (const c of chunks) {
    const seq = c.readUInt8(ICC.length);
    if (c.readUInt8(ICC.length + 1) !== count) throw new Malformed("colour profile chunks that disagree on their count");
    if (seq < 1 || seq > count || bySeq.has(seq)) throw new Malformed(`a colour profile chunk numbered ${seq} of ${count}`);
    bySeq.set(seq, c);
  }
  if (bySeq.size !== count) throw new Malformed(`${bySeq.size} of ${count} colour profile chunks`);
  const ordered = [...bySeq.keys()].sort((a, b) => a - b).map((seq) => bySeq.get(seq)!);
  const profile = Buffer.concat(ordered.map((c) => c.subarray(ICC.length + 2)));
  if (profile.length < 4 || profile.readUInt32BE(0) !== profile.length)
    throw new Malformed("a colour profile whose data isn't the size its header says (something after it?)");
  return ordered.map((c) => segmentOf(APP2, c));
}

function strip(b: Buffer): Buffer {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== SOI) throw new Malformed("it doesn't start with SOI");
  const out: Buffer[] = [];
  const icc: Buffer[] = [];
  let iccAt = -1;
  let orientation: number | null = null;
  let frame = false;
  let pos = 2;

  /** The marker at `at` (after any fill bytes) and where its segment's length, or the next thing, starts. */
  const marker = (at: number): { code: number; next: number } => {
    if (b[at] !== 0xff) throw new Malformed(`no marker at byte ${at}`);
    while (at < b.length && b[at] === 0xff) at++;
    if (at >= b.length) throw new Malformed("it ends inside a marker");
    if (b[at] === 0x00) throw new Malformed(`a stuffed byte where a marker belongs, at byte ${at}`);
    return { code: b.readUInt8(at), next: at + 1 };
  };
  /** The end of the segment whose length starts at `at`. */
  const segmentEnd = (at: number): number => {
    if (at + 2 > b.length) throw new Malformed("it ends inside a segment's length");
    const length = b.readUInt16BE(at);
    if (length < 2) throw new Malformed(`a segment of length ${length}, at byte ${at}`);
    if (at + length > b.length) throw new Malformed("a segment runs past the end of the file");
    return at + length;
  };
  /**
   * A kept segment whose length the standard fixes, checked, so nothing rides along after what a decoder reads: DRI and DNL are 4 bytes,
   * a frame header 8 + 3 per component, a scan header 6 + 2 per component.
   */
  const pinned = (code: number, payload: Buffer) => {
    const exactly = (name: string, length: number) => {
      if (payload.length + 2 !== length) throw new Malformed(`a ${name} of ${payload.length + 2} bytes, not ${length}`);
    };
    if (code === DRI) exactly("DRI", 4);
    else if (code === DNL) exactly("DNL", 4);
    else if (isFrame(code)) {
      if (payload.length < 6) throw new Malformed("a frame header without its component count");
      exactly("frame header", 8 + 3 * payload.readUInt8(5));
    } else if (code === SOS) {
      if (payload.length < 1) throw new Malformed("a scan header without its component count");
      exactly("scan header", 6 + 2 * payload.readUInt8(0));
    }
  };

  // The header: everything up to the first SOS, segment by segment.
  let sos = -1;
  while (sos < 0) {
    const start = pos;
    const { code, next } = marker(pos);
    if (code === SOI) throw new Malformed("a second SOI");
    if (code === EOI) throw new Malformed("EOI before any image data");
    if (isRst(code)) throw new Malformed("a restart marker before any image data");
    if (code !== SOS && code !== COM && !isApp(code) && !isFrame(code) && !isTable(code)) throw new Malformed(`a marker JPEG photos don't carry, ${hex(code)}`);
    const end = segmentEnd(next);
    const payload = b.subarray(next + 2, end);
    pos = end;
    if (code === DNL) throw new Malformed("a DNL before the first scan");
    pinned(code, payload);
    if (code === SOS) {
      if (!frame) throw new Malformed("image data before the frame header");
      sos = start;
    } else if (isFrame(code)) {
      if (frame) throw new Malformed("a second frame header");
      frame = true;
      out.push(segmentOf(code, payload));
    } else if (isTable(code)) {
      out.push(segmentOf(code, payload));
    } else if (code === APP1 && orientation === null && startsWith(payload, EXIF)) {
      orientation = readOrientation(payload.subarray(EXIF.length));
    } else if (code === APP2 && startsWith(payload, ICC)) {
      if (payload.length < ICC.length + 2) throw new Malformed("a colour profile chunk without its sequence number");
      if (iccAt < 0) iccAt = out.length;
      icc.push(payload);
    } else if (code === APP14 && startsWith(payload, ADOBE)) {
      if (payload.length < ADOBE_LENGTH) throw new Malformed("an Adobe segment shorter than its 12 bytes");
      out.push(segmentOf(code, payload.subarray(0, ADOBE_LENGTH)));
    }
    // Any other APPn and every comment: dropped.
  }
  if (iccAt >= 0) out.splice(iccAt, 0, ...iccSegments(icc));

  // The scans: from the first SOS to EOI, copied as they are, less any APPn or comment found between them.
  const scans: Buffer[] = [];
  let from = sos;
  pos = sos;
  for (;;) {
    const { code, next } = marker(pos);
    if (code === EOI) {
      scans.push(b.subarray(from, next));
      break;
    }
    if (code === SOI) throw new Malformed("a second SOI");
    if (code !== SOS && code !== COM && !isApp(code) && !isTable(code)) throw new Malformed(`a marker JPEG photos don't carry between scans, ${hex(code)}`);
    const end = segmentEnd(next);
    pinned(code, b.subarray(next + 2, end));
    if (code === COM || isApp(code)) {
      scans.push(b.subarray(from, pos));
      from = end;
    }
    pos = code === SOS ? entropyEnd(b, end) : end;
  }

  const exif = orientation !== null && orientation !== 1 ? [Buffer.from([0xff, 0xe1]), exifSegment(orientation)] : [];
  return Buffer.concat([b.subarray(0, 2), ...exif, ...out, ...scans]);
}

/** Where the entropy-coded data starting at `at` ends: at the first marker that isn't a stuffed FF00 or a restart marker. */
function entropyEnd(b: Buffer, at: number): number {
  let i = at;
  for (;;) {
    i = b.indexOf(0xff, i);
    if (i < 0 || i + 1 >= b.length) throw new Malformed("it ends inside the image data (cut off?)");
    const next = b.readUInt8(i + 1);
    if (next === 0x00 || isRst(next)) i += 2;
    else if (next === 0xff) i += 1;
    else return i;
  }
}

/** The Orientation in an Exif's IFD0 (a TIFF structure), or null when there is none or it can't be read. */
function readOrientation(tiff: Buffer): number | null {
  if (tiff.length < 8) return null;
  const order = tiff.toString("latin1", 0, 2);
  if (order !== "II" && order !== "MM") return null;
  const le = order === "II";
  const u16 = (at: number) => (le ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
  const u32 = (at: number) => (le ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at));
  if (u16(2) !== 42) return null;
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return null;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12;
    if (at + 12 > tiff.length) return null;
    if (u16(at) !== ORIENTATION) continue;
    // SHORT, one value, held in the entry itself.
    if (u16(at + 2) !== 3 || u32(at + 4) !== 1) return null;
    const v = u16(at + 8);
    return v >= 1 && v <= 8 ? v : null;
  }
  return null;
}

/** An APP1 segment's length and payload: Exif holding a big-endian TIFF whose IFD0 has the one Orientation entry and no next IFD. */
function exifSegment(orientation: number): Buffer {
  const tiff = Buffer.alloc(8 + 2 + 12 + 4);
  tiff.write("MM", 0, "latin1");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8);
  tiff.writeUInt16BE(ORIENTATION, 10);
  tiff.writeUInt16BE(3, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt16BE(orientation, 18);
  // The next IFD's offset (bytes 22–25) stays 0: there is none.
  const payload = Buffer.concat([EXIF, tiff]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);
  return Buffer.concat([length, payload]);
}

const startsWith = (b: Buffer, prefix: Buffer) => b.length >= prefix.length && b.subarray(0, prefix.length).equals(prefix);
