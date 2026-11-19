import * as z from "zod";
import { describe, expect, it } from "vitest";
import { PRINT_FIELDS, printInputSchema, printPatchSchema } from "./printfields";

/** The limit a JSON Schema node carries (maxLength, maximum or maxItems), looking through optional/nullable wrappers. */
function limitOf(node: Record<string, unknown>): number | undefined {
  for (const key of ["maxLength", "maximum", "maxItems"]) if (typeof node[key] === "number") return node[key] as number;
  for (const inner of (node.anyOf ?? node.oneOf ?? []) as Record<string, unknown>[]) {
    const limit = limitOf(inner);
    if (limit !== undefined) return limit;
  }
  return undefined;
}

describe("printfields", () => {
  it("printFieldsBuildBothSchemas: every field is in the create and the patch schema with its description and limit", () => {
    const create = z.toJSONSchema(printInputSchema, { io: "input" }) as { properties: Record<string, Record<string, unknown>>; required?: string[] };
    const patch = z.toJSONSchema(printPatchSchema, { io: "input" }) as { properties: Record<string, Record<string, unknown>>; required?: string[] };
    for (const [name, field] of Object.entries(PRINT_FIELDS)) {
      const surfaces = field.onCreate === null ? [patch] : [create, patch];
      for (const schema of surfaces) {
        const node = schema.properties[name];
        expect(node, `${name} missing`).toBeDefined();
        expect(node!.description, `${name}'s description`).toBe(field.description);
        expect(limitOf(node!), `${name}'s limit`).toBe(field.limit ?? undefined);
      }
    }
    // Left out of create by name: a print's slug comes from its title at creation (PRINT_FIELDS.slug.onCreate is null).
    expect(Object.keys(create.properties).sort()).toEqual(
      Object.keys(PRINT_FIELDS)
        .filter((n) => n !== "slug")
        .sort(),
    );
    expect(Object.keys(patch.properties).sort()).toEqual(Object.keys(PRINT_FIELDS).sort());
    expect(create.required?.sort()).toEqual(["description", "title"]);
    expect(patch.required ?? []).toEqual([]);
  });

  it("documents what leaving a field out or emptying it means", () => {
    for (const [name, field] of Object.entries(PRINT_FIELDS)) {
      expect(field.rule, name).not.toBe("");
      expect(field.onEdit, name).not.toBe("");
    }
  });
});
