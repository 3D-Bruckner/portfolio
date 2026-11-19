import type { PRINT_FIELDS } from "@/backend";

// The order the print form shows the field table's fields in; printform.test.ts checks it names each field once.
export type PrintFieldName = keyof typeof PRINT_FIELDS;

export const FORM_ORDER: readonly PrintFieldName[] = [
  "title",
  "description",
  "price",
  "categoryIds",
  "shortTitle",
  "selfDesigned",
  "weightGrams",
  "printTimeMinutes",
  "colors",
  "sources",
  "slug",
];

/** What the form needs to know of a field to draw it; fieldSpecs builds it from the table, on the server. */
export type FieldSpec = {
  kind: "text" | "integer" | "boolean" | "ids" | "sources" | "slug";
  required: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
};
