// What portfolio reads from print-bridge (3D-Bruckner/print-bridge), the one service that talks to Bambuddy: the average purchase cost per
// kilogram of each material. It is for the signed-in web form only: in no REST or MCP answer and not in the site export, and customer
// prices never follow it. An answer that doesn't come only means the cost isn't shown.
import * as z from "zod";
import type { Material } from "./pricing";
import type { Runtime } from "./runtime";

const TIMEOUT_MS = 3_000;
const KEEP_MS = 5 * 60_000;
const KEEP_FAILURE_MS = 60_000;

/** What a kilogram of each material costs, on average over the spools in stock that have a price. */
export type FilamentCosts = Partial<Record<Material, number>>;

const answerSchema = z.object({
  version: z.literal(1),
  costs: z.object({ PLA: z.number().min(0).optional(), PETG: z.number().min(0).optional() }),
});

async function readCosts(rt: Runtime): Promise<FilamentCosts | null> {
  try {
    const r = await rt.fetch(`${rt.config.bridgeUrl}/costs`, {
      headers: { authorization: `Bearer ${rt.config.bridgeToken}`, accept: "application/json", "user-agent": "portfolio" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const { costs } = answerSchema.parse(await r.json());
    const out: FilamentCosts = {};
    if (costs.PLA !== undefined) out.PLA = costs.PLA;
    if (costs.PETG !== undefined) out.PETG = costs.PETG;
    return out;
  } catch (e) {
    rt.log.warn({ error: e instanceof Error ? e.name : "error" }, "bridge: the filament costs can't be read");
    return null;
  }
}

const remembered = new WeakMap<Runtime, { value: FilamentCosts | null; until: number }>();

/** The filament costs, or null when print-bridge isn't set up or doesn't answer. */
export async function filamentCosts(rt: Runtime): Promise<FilamentCosts | null> {
  if (!rt.config.bridgeUrl || !rt.config.bridgeToken) return null;
  const now = rt.clock().getTime();
  const kept = remembered.get(rt);
  if (kept && kept.until > now) return kept.value;
  const value = await readCosts(rt);
  remembered.set(rt, { value, until: now + (value ? KEEP_MS : KEEP_FAILURE_MS) });
  return value;
}
