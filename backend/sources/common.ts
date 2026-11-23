// What every model site's reader (makerworld.ts, printables.ts, thingiverse.ts) shares: the draft it makes, the HTTP rules (an honest
// name of our own, a timeout), the description as plain text, and the numbers with the site's price, the time put onto Marcel's A1.
import * as z from "zod";
import { invalid, notFound, ok, type Outcome } from "../outcome";
import { PRINT_FIELDS, type PrintInput } from "../printfields";
import { suggestedPrice, type Material } from "../pricing";
import type { Runtime } from "../runtime";
import { plainText } from "../threemf";
import { onOurPrinter } from "./printer";

export const USER_AGENT = "3dbruckner-portfolio (+https://portfolio.3dbruckner.de)";
export const TIMEOUT_MS = 20_000;

/** One of a model's print profiles, its time put onto the A1. They can differ a lot in size, so a refresh offers them to choose from. */
export type ModelProfile = { id: number; name: string; printer: string | null; printTimeMinutes: number | null; weightGrams: number | null };

/** What a reader makes of a model page: the print's fields, its pictures' addresses, and where its numbers came from. */
export type Draft = {
  input: PrintInput;
  pictures: string[];
  /** The profile or file the numbers are from, as the site names it. */
  profile: string | null;
  /** The profile picked, by the id a link's #profileId-<n> names, and all the model has; none on a site without such links. */
  profileId: number | null;
  profiles: ModelProfile[];
  /** The printer those numbers were sliced for, and the factor its time was scaled by for the A1 (1: unchanged). */
  slicedFor: string | null;
  factor: number;
};

export type Reader = {
  /** The site's name, also the source's label. */
  site: string;
  /** The model the link names, by the site's own id; null when the link isn't this site's. */
  match(url: URL): string | null;
  /** The model's page address, for its source. */
  page(id: string): string;
  /** Whether an address (from the site's answer) is one of its picture hosts. */
  isPicture(url: URL): boolean;
  read(rt: Runtime, id: string, url: URL): Promise<Outcome<Draft>>;
};

/** A JSON answer from a site's API, checked with `schema`; the reasons a page can't be read, as refusals. */
export async function getJson<T>(rt: Runtime, site: string, url: string, init: RequestInit, schema: z.ZodType<T>): Promise<Outcome<T>> {
  try {
    const r = await rt.fetch(url, {
      ...init,
      headers: { accept: "application/json", "user-agent": USER_AGENT, ...(init.headers as Record<string, string>) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (r.status === 404) return notFound(`${site} has no such model.`);
    if (!r.ok) {
      rt.log.warn({ site, status: r.status }, "import: the site refused");
      return invalid(`${site} didn't answer (${r.status}); try again later.`);
    }
    const parsed = schema.safeParse(await r.json());
    if (!parsed.success) {
      rt.log.warn({ site, issues: parsed.error.issues.slice(0, 3) }, "import: an answer of another shape");
      return invalid(`${site} answered with something portfolio doesn't read; the import needs a change.`);
    }
    return ok(parsed.data);
  } catch (e) {
    rt.log.warn({ site, error: e instanceof Error ? e.message : String(e) }, "import: unreachable");
    return invalid(`${site} can't be reached right now; try again later.`);
  }
}

/** A model page's HTML as the description's plain text, paragraphs kept, at most the field's limit. */
export const descriptionOf = (html: string): string =>
  plainText(html)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, PRINT_FIELDS.description.limit);

/** The numbers a profile or G-code gives, as the print's fields: the time put onto the A1, and the site's price from weight and time. */
export function numbers(n: { minutes?: number; grams?: number; colors?: number; material: Material; printer: string | null }): {
  fields: Partial<PrintInput>;
  factor: number;
} {
  const time = n.minutes ? onOurPrinter(n.minutes, n.printer) : null;
  const grams = n.grams ? Math.max(1, Math.round(n.grams)) : undefined;
  const colors = n.colors && n.colors >= 2 ? n.colors : undefined;
  return {
    factor: time?.factor ?? 1,
    fields: {
      ...(time ? { printTimeMinutes: time.minutes } : {}),
      ...(grams ? { weightGrams: grams } : {}),
      ...(colors ? { colors } : {}),
      ...(time && grams
        ? { price: suggestedPrice({ weightGrams: grams, printTimeMinutes: time.minutes, multicolor: Boolean(colors), material: n.material }) }
        : {}),
    },
  };
}

/** A title the field takes. */
export const titleOf = (title: string, fallback: string): string => title.trim().slice(0, PRINT_FIELDS.title.limit) || fallback;
