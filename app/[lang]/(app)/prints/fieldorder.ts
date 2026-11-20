import type { PRINT_FIELDS } from "@/backend";

// How the print form groups the field table's fields, each group a card; printform.test.ts checks they name each field once.
export type PrintFieldName = keyof typeof PRINT_FIELDS;

export type FormGroup = "text" | "numbers" | "categories" | "origin" | "address";

export const FORM_GROUPS: readonly { group: FormGroup; fields: readonly PrintFieldName[] }[] = [
  { group: "text", fields: ["title", "shortTitle", "description"] },
  // The price and the slicer's totals, side by side; a 3MF fills them in.
  { group: "numbers", fields: ["price", "weightGrams", "printTimeMinutes", "colors"] },
  { group: "categories", fields: ["categoryIds"] },
  { group: "origin", fields: ["sources", "selfDesigned"] },
  { group: "address", fields: ["slug"] },
];

export const FORM_ORDER: readonly PrintFieldName[] = FORM_GROUPS.flatMap((g) => g.fields);

/** What the form needs to know of a field to draw it; fieldSpecs builds it from the table, on the server. */
export type FieldSpec = {
  kind: "text" | "integer" | "boolean" | "ids" | "sources" | "slug";
  required: boolean;
  maxLength?: number;
  min?: number;
  /** An integer's highest value; for sources, the most entries. */
  max?: number;
  /** A source's label and URL limits. */
  labelMaxLength?: number;
  urlMaxLength?: number;
};
