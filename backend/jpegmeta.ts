// A JPEG's metadata taken out without touching its image: a walk over the file's marker segments (no decoding), keeping what a decoder
// needs and dropping the rest. Kept: the frame, the tables, the restart interval, every scan's entropy-coded data byte for byte, the
// colour profile (APP2 ICC_PROFILE, however many chunks) and Adobe's APP14 (it says how the colour components are coded, nothing about
// the photo). Dropped: every other APPn (Exif with its GPS position, camera and date, XMP, JFIF and its thumbnail, IPTC, MPF, makers'
// own), every comment, and whatever follows EOI (an iPhone puts further images there). The orientation, read from the Exif, is written
// back as a minimal Exif of its own: IFD0 with the one Orientation entry. A file that isn't one whole JPEG is refused as invalid.
import { invalid, ok, type Outcome } from "./outcome";

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const COM = 0xfe;
const TEM = 0x01;
const isApp = (m: number) => m >= 0xe0 && m <= 0xef;
const isRst = (m: number) => m >= 0xd0 && m <= 0xd7;
/** SOF0–SOF15, less DHT (C4), JPG (C8) and DAC (CC), which share the range. */
const isFrame = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

const ICC = Buffer.from("ICC_PROFILE\0", "latin1");
const ADOBE = Buffer.from("Adobe", "latin1");
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

function strip(b: Buffer): Buffer {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== SOI) throw new Malformed("it doesn't start with SOI");
  const out: Buffer[] = [];
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
  const kept = (code: number, payload: Buffer): boolean =>
    code === COM ? false : !isApp(code) || (code === 0xe2 && startsWith(payload, ICC)) || (code === 0xee && startsWith(payload, ADOBE));

  // The header: everything up to the first SOS, segment by segment.
  let sos = -1;
  while (sos < 0) {
    const start = pos;
    const { code, next } = marker(pos);
    if (code === SOI) throw new Malformed("a second SOI");
    if (code === EOI) throw new Malformed("EOI before any image data");
    if (code === TEM) {
      pos = next;
      continue;
    }
    if (isRst(code)) throw new Malformed("a restart marker before any image data");
    const end = segmentEnd(next);
    const payload = b.subarray(next + 2, end);
    if (code === SOS) {
      if (!frame) throw new Malformed("image data before the frame header");
      sos = start;
      break;
    }
    if (isFrame(code)) frame = true;
    if (code === 0xe1 && orientation === null && startsWith(payload, EXIF)) orientation = readOrientation(payload.subarray(EXIF.length));
    if (kept(code, payload)) out.push(Buffer.from([0xff, code]), b.subarray(next, end));
    pos = end;
  }

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
    if (code === TEM || isRst(code)) {
      pos = next;
      continue;
    }
    const end = segmentEnd(next);
    if (!kept(code, b.subarray(next + 2, end))) {
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
