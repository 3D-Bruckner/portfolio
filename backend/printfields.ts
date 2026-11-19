// A print's fields, each listed once (conventions: architecture/one-field-list): its wire name (the key here, the same in JSON, MCP and
// the form), kind, limit, rule, description, and what leaving it out or emptying it means on create and on edit. printInputSchema
// (create) and printPatchSchema (edit) are built from this table, and so are the MCP tools, the REST bodies and the form's parse; no
// surface writes a field's limit or description out again. The checks that need the database (categories exist, the slug is free, a
// published print keeps its description) are prints.ts's one write-path check, used by create and edit alike.
import * as z from "zod";
import { invalid, ok, type Outcome } from "./outcome";
import { SLUG_PATTERN } from "./slug";

type Field = {
  kind: "text" | "integer" | "boolean" | "ids" | "sources" | "slug";
  /** The most characters, the highest number or the most entries; null for a boolean. */
  limit: number | null;
  rule: string;
  /** The description every surface shows (MCP input schemas, openapi.json). */
  description: string;
  /** What leaving it out means on create; null: create doesn't take it (named with the reason). */
  onCreate: string | null;
  /** Whether create needs it. */
  required: boolean;
  /** What leaving it out, null or emptying it means on edit. */
  onEdit: string;
  /** Whether null is accepted (and clears the field). */
  nullable: boolean;
  /** The value's schema with its limit; the builders add optional/nullable and the description. */
  value: z.ZodType;
};

const field = <const F extends Field>(f: F): F => f;

const WHOLE = "a whole number";

export const PRINT_FIELDS = {
  title: field({
    kind: "text",
    limit: 200,
    rule: "Not empty; the slug is made from it.",
    description: "The print's title as the site shows it, e.g. 'Beyblade – Dragoon'.",
    onCreate: "Required.",
    required: true,
    onEdit: "Left out: unchanged. Can't be emptied. On a print never published, the slug follows it unless the slug was set by hand.",
    nullable: false,
    value: z.string().trim().min(1).max(200),
  }),
  shortTitle: field({
    kind: "text",
    limit: 80,
    rule: "Optional.",
    description: "A shorter title for cards and lists; without it the site uses the title up to ' – '.",
    onCreate: "Left out: none.",
    required: false,
    onEdit: "Left out: unchanged. null or empty: removed.",
    nullable: true,
    value: z.string().trim().max(80),
  }),
  description: field({
    kind: "text",
    limit: 5000,
    rule: "May be empty while a draft; publishing needs it, and a published print keeps it.",
    description: "What the print is, in German, as the site shows it under the photos.",
    onCreate: "Required (may be empty for a draft).",
    required: true,
    onEdit: "Left out: unchanged. Empty: only while a draft.",
    nullable: false,
    value: z.string().trim().max(5000),
  }),
  price: field({
    kind: "integer",
    limit: 100000,
    rule: `Whole euros, ${WHOLE} from 0.`,
    description: "The price in whole euros; none: the site shows no price.",
    onCreate: "Left out: no price.",
    required: false,
    onEdit: "Left out: unchanged. null: removed.",
    nullable: true,
    value: z.number().int().min(0).max(100000),
  }),
  selfDesigned: field({
    kind: "boolean",
    limit: null,
    rule: "true or false.",
    description: "Whether Marcel designed the model himself (rather than printing someone else's).",
    onCreate: "Left out: false.",
    required: false,
    onEdit: "Left out: unchanged.",
    nullable: false,
    value: z.boolean(),
  }),
  weightGrams: field({
    kind: "integer",
    limit: 100000,
    rule: `${WHOLE} from 1.`,
    description: "The filament used, in grams, from the slicer.",
    onCreate: "Left out: unknown.",
    required: false,
    onEdit: "Left out: unchanged. null: removed.",
    nullable: true,
    value: z.number().int().min(1).max(100000),
  }),
  printTimeMinutes: field({
    kind: "integer",
    limit: 100000,
    rule: `${WHOLE} from 1.`,
    description: "The print time in minutes, from the slicer.",
    onCreate: "Left out: unknown.",
    required: false,
    onEdit: "Left out: unchanged. null: removed.",
    nullable: true,
    value: z.number().int().min(1).max(100000),
  }),
  colors: field({
    kind: "integer",
    limit: 100,
    rule: `${WHOLE} from 1.`,
    description: "How many filament colours the print uses.",
    onCreate: "Left out: unknown.",
    required: false,
    onEdit: "Left out: unchanged. null: removed.",
    nullable: true,
    value: z.number().int().min(1).max(100),
  }),
  categoryIds: field({
    kind: "ids",
    limit: 20,
    rule: "Ids of existing categories; a new category is created on its own first.",
    description: "The ids of the print's categories, in order: the first is its main one (list them with the categories' list).",
    onCreate: "Left out: none.",
    required: false,
    onEdit: "Left out: unchanged. A list replaces them all; [] removes them.",
    nullable: false,
    value: z.array(z.string().min(1).max(100)).max(20),
  }),
  sources: field({
    kind: "sources",
    limit: 10,
    rule: "Each a label and an http(s) URL.",
    description: "Where the model comes from, e.g. [{label: 'MakerWorld', url: 'https://makerworld.com/…'}].",
    onCreate: "Left out: none.",
    required: false,
    onEdit: "Left out: unchanged. A list replaces them all; [] removes them.",
    nullable: false,
    value: z
      .array(z.strictObject({ label: z.string().trim().min(1).max(100), url: z.url({ protocol: /^https?$/, error: "an http(s) URL" }).max(2000) }))
      .max(10),
  }),
  slug: field({
    kind: "slug",
    limit: 100,
    rule: "Lowercase a-z, 0-9 and single hyphens; free and not reserved; fixed once the print was first published.",
    description: "The print's address on the site (/portfolio/<slug>). Can change only until the print is first published.",
    // Left out of create: the slug is made from the title, so a new print's address always matches its title.
    onCreate: null,
    required: false,
    onEdit: "Left out: unchanged. Refused once the print was first published.",
    nullable: false,
    value: z.string().regex(SLUG_PATTERN, "lowercase a-z, 0-9 and single hyphens").max(100),
  }),
} as const;

type Fields = typeof PRINT_FIELDS;
type CreateName = { [K in keyof Fields]: Fields[K]["onCreate"] extends null ? never : K }[keyof Fields];
type Optional<F> = F extends { value: infer S extends z.ZodType; nullable: true }
  ? z.ZodOptional<z.ZodNullable<S>>
  : F extends { value: infer S extends z.ZodType }
    ? z.ZodOptional<S>
    : never;
type OnCreate<F> = F extends { value: infer S extends z.ZodType; required: true } ? S : Optional<F>;

function build(name: keyof Fields, mode: "create" | "edit"): z.ZodType {
  const f: Field = PRINT_FIELDS[name];
  const s = mode === "create" && f.required ? f.value : (f.nullable ? f.value.nullable() : f.value).optional();
  return s.describe(f.description);
}

const names = Object.keys(PRINT_FIELDS) as (keyof Fields)[];

/** A new print: every field create takes. Unknown keys are refused, so a misspelt field isn't silently dropped. */
export const printInputSchema = z.strictObject(
  Object.fromEntries(names.filter((n) => PRINT_FIELDS[n].onCreate !== null).map((n) => [n, build(n, "create")])) as { [K in CreateName]: OnCreate<Fields[K]> },
);

/** An edit: every field, each optional; null clears a nullable one. */
export const printPatchSchema = z.strictObject(Object.fromEntries(names.map((n) => [n, build(n, "edit")])) as { [K in keyof Fields]: Optional<Fields[K]> });

export type PrintInput = z.infer<typeof printInputSchema>;
export type PrintPatch = z.infer<typeof printPatchSchema>;

function parse<T>(schema: z.ZodType<T>, input: unknown): Outcome<T> {
  const r = schema.safeParse(input);
  if (r.success) return ok(r.data);
  return invalid(r.error.issues.map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "));
}

/** A new print's fields, checked against the table. */
export const parsePrintInput = (input: unknown): Outcome<PrintInput> => parse(printInputSchema, input);
/** An edit's fields, checked against the table. */
export const parsePrintPatch = (patch: unknown): Outcome<PrintPatch> => parse(printPatchSchema, patch);
