// The print form's parse, built from the field table (backend/printfields.ts; conventions: architecture/one-field-list): each field is
// read from the posted form by its kind, and the result goes to the table's own check (createPrint/updatePrint parse it). The form always
// posts every field it shows, so an unticked box, no category and no source mean false and none; the slug is left out once it is fixed
// (its input is then disabled, and a disabled input isn't posted). Server only: the page hands the specs to the client form.
import { PRINT_FIELDS } from "@/backend";
import type { FieldSpec, PrintFieldName } from "./fieldorder";

const NAMES = Object.keys(PRINT_FIELDS) as PrintFieldName[];

function read(fd: FormData, name: PrintFieldName): unknown {
  const f = PRINT_FIELDS[name];
  const text = (fd.get(name) ?? "").toString();
  switch (f.kind) {
    case "boolean":
      return fd.has(name);
    case "ids":
      return fd.getAll(name).map(String);
    case "sources": {
      const labels = fd.getAll(`${name}.label`).map(String);
      const urls = fd.getAll(`${name}.url`).map(String);
      return labels.map((label, i) => ({ label, url: urls[i] ?? "" })).filter((s) => s.label.trim() !== "" || s.url.trim() !== "");
    }
    case "integer": {
      const t = text.trim();
      if (t === "") return null;
      // Not a whole number: the string goes on, and the table's check names the field.
      return /^-?\d+$/.test(t) ? Number(t) : t;
    }
    case "text":
    case "slug":
      return f.nullable && text.trim() === "" ? null : text;
  }
}

/** The wire values of a posted print form: on create the fields create takes, on edit every field (the slug only when posted). */
export function formValues(fd: FormData, mode: "create" | "edit"): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of NAMES) {
    const f = PRINT_FIELDS[name];
    if (mode === "create" && f.onCreate === null) continue;
    if (f.kind === "slug" && !fd.has(name)) continue;
    out[name] = read(fd, name);
  }
  return out;
}

type Limits = { minLength?: number | null; maxLength?: number | null; minValue?: number | null; maxValue?: number | null };

/** What the form needs of each field: its kind, whether create needs it, and its limits, read from the table's schemas. */
export function fieldSpecs(): Record<PrintFieldName, FieldSpec> {
  return Object.fromEntries(
    NAMES.map((name) => {
      const f = PRINT_FIELDS[name];
      const s = f.value as unknown as Limits;
      // Required in the browser: what create needs and may not be empty (the title; a draft's description may be).
      const spec: FieldSpec = { kind: f.kind, required: f.required && (s.minLength ?? 0) >= 1 };
      if (f.kind === "text" || f.kind === "slug") spec.maxLength = s.maxLength ?? f.limit ?? undefined;
      if (f.kind === "integer") {
        spec.min = s.minValue ?? undefined;
        spec.max = s.maxValue ?? undefined;
      }
      return [name, spec];
    }),
  ) as Record<PrintFieldName, FieldSpec>;
}
