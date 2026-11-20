// What a print's form can be filled with from a Bambu Studio 3MF: the slicer's totals (time, weight, colours) from a sliced file, and the
// model's title, description and MakerWorld page from any. Pure (no Node, no file system), so the web app runs it in the browser on the
// phone's own file: a sliced 3MF with its G-code is often 50 to 200 MB, and only the few kilobytes read here leave the file.
//
// A 3MF is a zip. Read from it, by random access (ByteSource), so a large file is never read whole:
//   Metadata/slice_info.config  per plate: <metadata key="prediction" value="<seconds>"/>, <metadata key="weight" value="<grams>"/>,
//                               <filament id type color used_m used_g/>; there only once the file was sliced
//   3D/3dmodel.model            <metadata name="Title">, "Description" (MakerWorld's, HTML), "Designer", "DesignModelId"
import { inflateSync } from "fflate";
import { suggestedPrice, type Material } from "./pricing";
import { bambuPrinter, onOurPrinter } from "./sources/printer";

/** The file, read by ranges: a browser File (slice) or bytes in memory. */
export type ByteSource = { size: number; read(offset: number, length: number): Promise<Uint8Array> };

export const bytesSource = (bytes: Uint8Array): ByteSource => ({ size: bytes.length, read: async (o, l) => bytes.subarray(o, o + l) });

export type Filament = { type: string; color: string; grams: number };

export type ThreeMfReading = {
  /** Whether the file holds the slicer's results; without them there is no time, weight or colour count. */
  sliced: boolean;
  plates: number;
  printTimeMinutes?: number;
  weightGrams?: number;
  /** The printer the file was sliced for (Bambu Studio's printer_model_id), e.g. "A1" or "P1S". */
  slicedFor?: string;
  /** When it was sliced for a faster printer: the slicer's own time, before printTimeMinutes was scaled for the A1 (sources/printer.ts). */
  slicerMinutes?: number;
  /** The filaments the plates use, by colour; only set for two or more (the site leaves a single colour out). */
  colors?: number;
  filaments: Filament[];
  /** The site's rough price from weight and time (backend/pricing.ts). */
  price?: number;
  title?: string;
  description?: string;
  designer?: string;
  source?: { label: string; url: string };
};

export type ThreeMfResult = { ok: true; value: ThreeMfReading } | { ok: false; reason: "not_3mf" | "unreadable" };

const MAX_ENTRY = 8 * 1024 * 1024; // the two files read are a few kilobytes; anything far larger is not what it claims to be
const DESCRIPTION_MAX = 5000;

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

type Entry = { name: string; method: number; compressed: number; size: number; offset: number };

/** The zip's directory: its entries' names, sizes and where their data starts. */
async function directory(src: ByteSource): Promise<Entry[] | null> {
  // The end-of-directory record is in the last 22 bytes plus a comment of up to 64 KiB.
  const tailLength = Math.min(src.size, 22 + 65535);
  const tail = await src.read(src.size - tailLength, tailLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (u32(tail, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = u16(tail, eocd + 10);
  const dirSize = u32(tail, eocd + 12);
  const dirOffset = u32(tail, eocd + 16);
  if (dirOffset + dirSize > src.size || dirSize > 16 * 1024 * 1024) return null;
  const dir = await src.read(dirOffset, dirSize);
  const entries: Entry[] = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= dir.length; i++) {
    if (u32(dir, p) !== 0x02014b50) return null;
    const nameLength = u16(dir, p + 28);
    const extraLength = u16(dir, p + 30);
    const commentLength = u16(dir, p + 32);
    const name = new TextDecoder().decode(dir.subarray(p + 46, p + 46 + nameLength));
    entries.push({ name, method: u16(dir, p + 10), compressed: u32(dir, p + 20), size: u32(dir, p + 24), offset: u32(dir, p + 42) });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** One entry's text, or null when it isn't there. */
async function text(src: ByteSource, entries: Entry[], name: string): Promise<string | null> {
  const e = entries.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!e) return null;
  if (e.size > MAX_ENTRY || e.compressed > MAX_ENTRY) throw new Error(`${name} is too large`);
  const header = await src.read(e.offset, 30);
  if (u32(header, 0) !== 0x04034b50) throw new Error(`${name}: no local header`);
  const start = e.offset + 30 + u16(header, 26) + u16(header, 28);
  const data = await src.read(start, e.compressed);
  const raw = e.method === 0 ? data : e.method === 8 ? inflateSync(data, { out: new Uint8Array(e.size) }) : null;
  if (!raw) throw new Error(`${name}: compression method ${e.method}`);
  return new TextDecoder().decode(raw);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m),
  );

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? decode(m[1]!) : undefined;
};

/** Everything from a < to the next > goes, in one pass over the characters (no pattern that a nested tag could get past). */
function withoutTags(html: string): string {
  let out = "";
  let inTag = false;
  for (const c of html) {
    if (c === "<") inTag = true;
    else if (c === ">" && inTag) inTag = false;
    else if (!inTag) out += c;
  }
  return out;
}

/** MakerWorld's HTML description as plain text: paragraphs and line breaks kept, tags and entities gone, and no < or > left at all (it
 * is shown as text, but nothing in it should ever read as markup). */
export function plainText(html: string): string {
  return decode(
    withoutTags(
      html
        .replace(/<\s*br\s*\/?>/gi, "\n")
        .replace(/<\/\s*li\s*>/gi, "\n")
        .replace(/<\/\s*(p|div|h[1-6]|ul|ol)\s*>/gi, "\n\n")
        .replace(/<li[^>]*>/gi, "• "),
    ),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/[<>]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sliceInfo(xml: string): Pick<ThreeMfReading, "plates" | "printTimeMinutes" | "weightGrams" | "filaments" | "slicedFor"> {
  const plates = [...xml.matchAll(/<plate>([\s\S]*?)<\/plate>/g)].map((m) => m[1]!);
  let seconds = 0;
  let grams = 0;
  const byColor = new Map<string, Filament>();
  for (const plate of plates) {
    const meta = (key: string) => {
      const tag = new RegExp(`<metadata[^>]*\\bkey="${key}"[^>]*>`).exec(plate)?.[0];
      return tag ? Number(attr(tag, "value")) : NaN;
    };
    const prediction = meta("prediction");
    if (Number.isFinite(prediction)) seconds += prediction;
    const weight = meta("weight");
    let plateGrams = Number.isFinite(weight) ? weight : 0;
    let filamentGrams = 0;
    for (const [tag] of plate.matchAll(/<filament\b[^>]*>/g)) {
      const used = Number(attr(tag, "used_g") ?? 0);
      if (!(used > 0)) continue;
      filamentGrams += used;
      const color = (attr(tag, "color") ?? "").toUpperCase();
      const known = byColor.get(color);
      if (known) known.grams += used;
      else byColor.set(color, { type: (attr(tag, "type") ?? "").trim(), color, grams: used });
    }
    if (!plateGrams) plateGrams = filamentGrams;
    grams += plateGrams;
  }
  const filaments = [...byColor.values()].map((f) => ({ ...f, grams: Math.round(f.grams * 100) / 100 }));
  const code = /<metadata[^>]*\bkey="printer_model_id"[^>]*>/.exec(xml)?.[0];
  const printer = code ? attr(code, "value")?.trim() : undefined;
  return {
    plates: plates.length,
    ...(printer ? { slicedFor: bambuPrinter(printer) } : {}),
    ...(seconds > 0 ? { printTimeMinutes: Math.max(1, Math.round(seconds / 60)) } : {}),
    ...(grams > 0 ? { weightGrams: Math.max(1, Math.round(grams)) } : {}),
    filaments,
  };
}

function model(xml: string): Pick<ThreeMfReading, "title" | "description" | "designer" | "source"> {
  const meta = (name: string) => {
    const m = new RegExp(`<metadata\\s+name="${name}"[^>]*>([\\s\\S]*?)</metadata>`).exec(xml);
    const value = m ? decode(m[1]!).trim() : "";
    return value || undefined;
  };
  const title = meta("Title");
  const description = meta("Description");
  const designer = meta("Designer");
  const modelId = meta("DesignModelId");
  return {
    ...(title ? { title: title.slice(0, 200) } : {}),
    ...(description ? { description: plainText(description).slice(0, DESCRIPTION_MAX) } : {}),
    ...(designer ? { designer } : {}),
    ...(modelId && /^\d+$/.test(modelId) ? { source: { label: "MakerWorld", url: `https://makerworld.com/en/models/${modelId}` } } : {}),
  };
}

/** The material the price is counted in: PETG when a filament is PETG, else PLA (the site's two). */
export const materialOf = (filaments: Pick<Filament, "type">[]): Material => (filaments.some((f) => /PETG/i.test(f.type)) ? "PETG" : "PLA");

/** Reads what a print's form can be filled with from a 3MF; nothing in the file is trusted beyond the numbers and text it yields. */
export async function readThreeMf(src: ByteSource): Promise<ThreeMfResult> {
  let entries: Entry[] | null;
  try {
    entries = await directory(src);
  } catch {
    return { ok: false, reason: "not_3mf" };
  }
  if (!entries || !entries.some((e) => e.name === "[Content_Types].xml" || e.name.startsWith("3D/"))) return { ok: false, reason: "not_3mf" };
  // Each part on its own: a model file too large to read (a mesh inline) still leaves the slicer's numbers, and the other way round.
  const part = async (name: string): Promise<string | null | Error> => {
    try {
      return await text(src, entries!, name);
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  };
  const sliceRead = await part("Metadata/slice_info.config");
  const modelRead = await part("3D/3dmodel.model");
  const there = [sliceRead, modelRead].filter((r) => r !== null);
  if (there.length > 0 && there.every((r) => r instanceof Error)) return { ok: false, reason: "unreadable" };
  try {
    const slice = sliceRead instanceof Error ? null : sliceRead;
    const modelXml = modelRead instanceof Error ? null : modelRead;
    const totals = slice ? sliceInfo(slice) : { plates: 0, filaments: [] as Filament[] };
    const sliced = totals.printTimeMinutes !== undefined || totals.weightGrams !== undefined;
    const colors = totals.filaments.length;
    const reading: ThreeMfReading = {
      sliced,
      ...totals,
      ...(colors >= 2 ? { colors } : {}),
      ...(modelXml ? model(modelXml) : {}),
    };
    // A file sliced for a faster printer than Marcel's A1: its time is scaled, and the slicer's own kept beside it.
    if (reading.printTimeMinutes && reading.slicedFor) {
      const onA1 = onOurPrinter(reading.printTimeMinutes, reading.slicedFor);
      if (onA1.factor !== 1) {
        reading.slicerMinutes = reading.printTimeMinutes;
        reading.printTimeMinutes = onA1.minutes;
      }
    }
    if (reading.weightGrams && reading.printTimeMinutes)
      reading.price = suggestedPrice({
        weightGrams: reading.weightGrams,
        printTimeMinutes: reading.printTimeMinutes,
        multicolor: colors >= 2,
        material: materialOf(totals.filaments),
      });
    return { ok: true, value: reading };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
