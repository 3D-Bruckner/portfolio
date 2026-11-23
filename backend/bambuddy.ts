// What portfolio reads from Bambuddy, where the filaments and what they cost are kept. Purchase prices are for the signed-in web form only:
// they are in no REST or MCP answer and not in the site export, and customer prices never follow them. Bambuddy runs at home, so an answer
// that doesn't come only means the cost isn't shown; the short timeout and the remembered result keep a page from waiting for it.
import * as z from "zod";
import type { Material } from "./pricing";
import type { Runtime } from "./runtime";

const TIMEOUT_MS = 3_000;
const KEEP_MS = 5 * 60_000;
const KEEP_FAILURE_MS = 60_000;

const spoolsSchema = z.array(z.object({ material: z.string().nullish(), cost_per_kg: z.number().nullish(), archived_at: z.string().nullish() }));

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

const remembered = new WeakMap<Runtime, { value: FilamentCosts | null; until: number }>();

/** The filament costs, or null when Bambuddy isn't set up or doesn't answer. */
export async function filamentCosts(rt: Runtime): Promise<FilamentCosts | null> {
  const { bambuddyUrl, bambuddyKey } = rt.config;
  if (!bambuddyUrl || !bambuddyKey) return null;
  const now = rt.clock().getTime();
  const kept = remembered.get(rt);
  if (kept && kept.until > now) return kept.value;
  let value: FilamentCosts | null = null;
  try {
    const r = await rt.fetch(`${bambuddyUrl}/api/v1/inventory/spools`, {
      headers: { "x-api-key": bambuddyKey, accept: "application/json", "user-agent": "portfolio" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`status ${r.status}`);
    value = averageCosts(spoolsSchema.parse(await r.json()));
  } catch (e) {
    rt.log.warn({ error: e instanceof Error ? e.message : String(e) }, "bambuddy: no filament costs");
  }
  remembered.set(rt, { value, until: now + (value ? KEEP_MS : KEEP_FAILURE_MS) });
  return value;
}
