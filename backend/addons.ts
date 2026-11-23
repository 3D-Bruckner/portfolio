// Add-ons: extra parts sold with a print, such as keychain rings, screws or damping feet. A small list of their own, like the categories, so
// one is made once and used on several prints. A print either includes an add-on (it is part of the print's price) or offers it (the
// customer chooses it when ordering). Only the price is kept, no stock. A price is in whole cents, so it adds up exactly.
import { randomUUID } from "node:crypto";
import * as z from "zod";
import type { AddOnRow } from "./db";
import { conflict, done, invalid, notFound, ok, type Outcome } from "./outcome";
import { mutation, type Runtime } from "./runtime";

export const ADD_ON_NAME_LIMIT = 60;

const name = z.string().trim().min(1).max(ADD_ON_NAME_LIMIT).describe(`The add-on's name, e.g. 'Schlüsselring'; at most ${ADD_ON_NAME_LIMIT} characters.`);
const priceCents = z.number().int().min(0).max(100000).describe("The price per piece in whole cents, e.g. 25 for 0.25 €.");
const available = z.boolean().describe("Whether it can be picked for a print and offered to customers.");
const invoiceNinjaProduct = z.string().trim().min(1).max(100).nullable().describe("The product key of the matching product in Invoice Ninja; null: none yet.");

export const addOnInputSchema = z.strictObject({ name, priceCents, available: available.optional(), invoiceNinjaProduct: invoiceNinjaProduct.optional() });
export const addOnPatchSchema = z.strictObject({
  name: name.optional(),
  priceCents: priceCents.optional(),
  available: available.optional(),
  invoiceNinjaProduct: invoiceNinjaProduct.optional(),
});
export const addOnSchema = z.object({ id: z.string(), name, priceCents, available, invoiceNinjaProduct });
export const addOnWithCountSchema = addOnSchema.extend({ prints: z.number().int().describe("Prints using it, drafts included.") });

export type AddOn = z.infer<typeof addOnSchema>;
export type AddOnInput = z.infer<typeof addOnInputSchema>;
export type AddOnPatch = z.infer<typeof addOnPatchSchema>;

export const addOnOf = (row: AddOnRow): AddOn => ({
  id: row.id,
  name: row.name,
  priceCents: row.price_cents,
  available: row.available === 1,
  invoiceNinjaProduct: row.invoice_ninja_product,
});

function parsed<T>(schema: z.ZodType<T>, input: unknown): Outcome<T> {
  const r = schema.safeParse(input);
  return r.success ? ok(r.data) : invalid(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
}

/** A new add-on; refused when its name, in any case, is another add-on's. Not a site change: no print uses it yet. */
export function createAddOn(rt: Runtime, input: AddOnInput): Outcome<AddOn> {
  const checked = parsed(addOnInputSchema, input);
  if (!checked.ok) return checked;
  const v = checked.value;
  return mutation(rt, () => {
    if (rt.store.addOnByName(v.name)) return conflict(`An add-on named "${v.name}" exists already.`);
    const row: AddOnRow = {
      id: randomUUID(),
      name: v.name,
      price_cents: v.priceCents,
      available: v.available === false ? 0 : 1,
      invoice_ninja_product: v.invoiceNinjaProduct ?? null,
      created_at: rt.clock().toISOString(),
    };
    rt.store.insertAddOn(row);
    return ok(addOnOf(row));
  });
}

/** Changes the fields `patch` names. A site change when a published print uses the add-on. A print's own price stays until it is edited. */
export function updateAddOn(rt: Runtime, id: string, patch: AddOnPatch): Outcome<AddOn> {
  const checked = parsed(addOnPatchSchema, patch);
  if (!checked.ok) return checked;
  const v = checked.value;
  return mutation(rt, (siteChange) => {
    const row = rt.store.addOn(id);
    if (!row) return notFound(`No add-on ${id}.`);
    if (v.name !== undefined) {
      const other = rt.store.addOnByName(v.name);
      if (other && other.id !== id) return conflict(`An add-on named "${v.name}" exists already.`);
    }
    const next = {
      ...(v.name !== undefined ? { name: v.name } : {}),
      ...(v.priceCents !== undefined ? { price_cents: v.priceCents } : {}),
      ...(v.available !== undefined ? { available: v.available ? 1 : 0 } : {}),
      ...(v.invoiceNinjaProduct !== undefined ? { invoice_ninja_product: v.invoiceNinjaProduct } : {}),
    };
    if (Object.entries(next).every(([k, value]) => (row as Record<string, unknown>)[k] === value)) return ok(addOnOf(row));
    rt.store.updateAddOn(id, next);
    if (rt.store.printsWithAddOn(id).some((p) => p.status === "published")) siteChange();
    return ok(addOnOf(rt.store.addOn(id)!));
  });
}

/** Deletes an add-on no print uses; refused, naming the prints, while any does (drafts included). */
export function deleteAddOn(rt: Runtime, id: string): Outcome<void> {
  return mutation(rt, () => {
    const row = rt.store.addOn(id);
    if (!row) return notFound(`No add-on ${id}.`);
    const prints = rt.store.printsWithAddOn(id);
    if (prints.length > 0) {
      const names = prints.map((p) => `"${p.title}"${p.status === "draft" ? " (draft)" : ""}`).join(", ");
      return conflict(`The add-on "${row.name}" is still used by ${names}; take it off ${prints.length === 1 ? "that print" : "those prints"} first.`);
    }
    rt.store.deleteAddOn(id);
    return done;
  });
}

/** Every add-on by name, with how many prints (drafts included) use it. */
export function listAddOns(rt: Runtime): (AddOn & { prints: number })[] {
  return rt.store.addOnsWithCounts().map((row) => ({ ...addOnOf(row), prints: row.prints }));
}
