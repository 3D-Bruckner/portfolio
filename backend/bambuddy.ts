// What portfolio reads from Bambuddy, where the filaments and what they cost are kept. Purchase prices are for the signed-in web form only:
// they are in no REST or MCP answer and not in the site export, and customer prices never follow them. The site's swatches come from the
// same spools as a public list (colour, material, finish, swatch; never a brand, weight, price or note), kept so the export still has it
// while Bambuddy is away. Bambuddy runs at home, so an answer that doesn't come only means the cost isn't shown or the last list stays.
import * as z from "zod";
import type { Material } from "./pricing";
import type { Runtime } from "./runtime";

const TIMEOUT_MS = 3_000;
const KEEP_MS = 5 * 60_000;
const KEEP_FAILURE_MS = 60_000;

const spoolsSchema = z.array(
  z.object({
    material: z.string().nullish(),
    subtype: z.string().nullish(),
    color_name: z.string().nullish(),
    rgba: z.string().nullish(),
    cost_per_kg: z.number().nullish(),
    archived_at: z.string().nullish(),
  }),
);

/** What a kilogram of each material costs, on average over the spools in stock that have a price. */
export type FilamentCosts = Partial<Record<Material, number>>;

const MATERIALS: Material[] = ["PLA", "PETG"];

export function averageCosts(spools: z.infer<typeof spoolsSchema>): FilamentCosts {
  const costs: FilamentCosts = {};
  for (const material of MATERIALS) {
    const prices = spools.filter((s) => !s.archived_at && s.material === material && typeof s.cost_per_kg === "number").map((s) => s.cost_per_kg!);
    if (prices.length > 0) costs[material] = Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100;
  }
  return costs;
}

/** The spools, or null when Bambuddy isn't set up or doesn't answer. */
async function readSpools(rt: Runtime): Promise<z.infer<typeof spoolsSchema> | null> {
  const { bambuddyUrl, bambuddyKey } = rt.config;
  if (!bambuddyUrl || !bambuddyKey) return null;
  try {
    const r = await rt.fetch(`${bambuddyUrl}/api/v1/inventory/spools`, {
      headers: { "x-api-key": bambuddyKey, accept: "application/json", "user-agent": "portfolio" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`status ${r.status}`);
    return spoolsSchema.parse(await r.json());
  } catch (e) {
    rt.log.warn({ error: e instanceof Error ? e.message : String(e) }, "bambuddy: the spools can't be read");
    return null;
  }
}

const remembered = new WeakMap<Runtime, { value: FilamentCosts | null; until: number }>();

/** The filament costs, or null when Bambuddy isn't set up or doesn't answer. */
export async function filamentCosts(rt: Runtime): Promise<FilamentCosts | null> {
  if (!rt.config.bambuddyUrl || !rt.config.bambuddyKey) return null;
  const now = rt.clock().getTime();
  const kept = remembered.get(rt);
  if (kept && kept.until > now) return kept.value;
  const spools = await readSpools(rt);
  const value = spools ? averageCosts(spools) : null;
  remembered.set(rt, { value, until: now + (value ? KEEP_MS : KEEP_FAILURE_MS) });
  return value;
}

export const MAX_COLORS = 200;
const MAX_TEXT = 64;
const COLORS_KEY = "filamentColors";

export const filamentColorSchema = z.object({
  name: z.string().describe("The colour's name, as Bambuddy has it."),
  material: z.string().describe("The material, e.g. PLA."),
  finish: z.string().nullable().describe("The finish, e.g. Matte; null when it has none."),
  rgba: z
    .string()
    .regex(/^[0-9A-F]{8}$/)
    .describe("The swatch as RRGGBBAA."),
});
export type FilamentColor = z.infer<typeof filamentColorSchema>;

const text = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.length <= MAX_TEXT && /^[\p{L}\p{N}\p{P}\p{S} ]+$/u.test(t) ? t : null;
};

/** The public list: one entry per colour, material and finish, in a stable order so an unchanged inventory gives the same list. */
export function publicColors(spools: z.infer<typeof spoolsSchema>): FilamentColor[] {
  const out = new Map<string, FilamentColor>();
  for (const s of spools) {
    if (s.archived_at) continue;
    const name = text(s.color_name);
    const material = text(s.material);
    const rgba = typeof s.rgba === "string" && /^[0-9a-f]{8}$/i.test(s.rgba) ? s.rgba.toUpperCase() : null;
    if (!name || !material || !rgba) continue;
    const finish = text(s.subtype);
    const key = JSON.stringify([material, finish, name]);
    if (!out.has(key)) out.set(key, { name, material, finish, rgba });
  }
  const order = (c: FilamentColor) => `${c.material}\u0000${c.finish ?? ""}\u0000${c.name}`;
  return [...out.values()].sort((a, b) => (order(a) < order(b) ? -1 : 1)).slice(0, MAX_COLORS);
}

/** Reads the colours from Bambuddy and keeps them. No answer, or an empty inventory, leaves the last list. */
export async function refreshFilamentColors(rt: Runtime): Promise<void> {
  const spools = await readSpools(rt);
  if (!spools) return;
  const colors = publicColors(spools);
  if (colors.length > 0) rt.store.writeSiteState({ [COLORS_KEY]: JSON.stringify(colors) });
}

/** The last list that was read; empty before the first. */
export function keptFilamentColors(rt: Runtime): FilamentColor[] {
  const raw = rt.store.siteState()[COLORS_KEY];
  if (!raw) return [];
  const parsed = z.array(filamentColorSchema).safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : [];
}
