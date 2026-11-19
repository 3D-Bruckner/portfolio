"use client";
// A print's fields, drawn from the field table's specs in FORM_ORDER (fieldorder.ts), so every field the table lists is here once. It
// posts to savePrint, whose parse is the table's (printform.ts). Submitted by hand (startTransition), not as <form action>, so a refused
// save keeps what was typed.
import Link from "next/link";
import { startTransition, useActionState, useRef, useState, type FormEvent } from "react";
import type { ThreeMfReading } from "@/backend/client";
import { useCopy } from "@/components/CopyProvider";
import { AddIcon, CloseIcon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { ui } from "@/components/ui";
import { savePrint } from "../actions";
import { FORM_GROUPS, type FieldSpec, type PrintFieldName } from "./fieldorder";
import { ThreeMfFill, type FillPart } from "./ThreeMfFill";

export type FormValues = {
  title: string;
  shortTitle: string | null;
  description: string;
  price: number | null;
  selfDesigned: boolean;
  weightGrams: number | null;
  printTimeMinutes: number | null;
  colors: number | null;
  categoryIds: string[];
  sources: { label: string; url: string }[];
  slug: string;
};

type Props = {
  printId: string | null;
  specs: Record<PrintFieldName, FieldSpec>;
  categories: { id: string; name: string }[];
  values: FormValues | null;
  slugFixed: boolean;
};

/** 135 → "2 h 15 min". */
const formatMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);

export function PrintForm({ printId, specs, categories, values, slugFixed }: Props) {
  const held = values?.categoryIds ?? [];
  const rank = (id: string) => (held.includes(id) ? held.indexOf(id) : held.length);
  const t = useCopy();
  const [result, dispatch, pending] = useActionState(savePrint.bind(null, printId), null);
  const [sources, setSources] = useState(() => (values?.sources ?? []).map((s, i) => ({ ...s, key: i })));
  const [nextKey, setNextKey] = useState(sources.length);
  const form = useRef<HTMLFormElement>(null);

  // What a 3MF holds goes into the fields: the slicer's numbers and the suggested price always (they belong to that file), the title and
  // the description only into empty fields, the MakerWorld page only when no source is set. Nothing is saved until the form is.
  function fill(r: ThreeMfReading): FillPart[] {
    const filled: FillPart[] = [];
    const put = (name: FillPart, value: string | number | undefined, onlyIfEmpty = false) => {
      const el = form.current?.elements.namedItem(name);
      if (value === undefined || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
      if (onlyIfEmpty && el.value.trim()) return;
      el.value = String(value);
      filled.push(name);
    };
    put("printTimeMinutes", r.printTimeMinutes);
    if (r.printTimeMinutes !== undefined) setMinutes(r.printTimeMinutes);
    put("weightGrams", r.weightGrams);
    put("colors", r.colors);
    put("price", r.price);
    put("title", r.title, true);
    put("description", r.description, true);
    if (r.source && !sources.some((s) => s.url.trim())) {
      setSources([{ ...r.source, key: nextKey }]);
      setNextKey(nextKey + 1);
      filled.push("sources");
    }
    return filled;
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }

  const groups = FORM_GROUPS.map((g) => ({ ...g, fields: g.fields.filter((n) => printId !== null || n !== "slug") })).filter((g) => g.fields.length > 0);
  // The print time as hours and minutes, under its field, as it is typed.
  const [minutes, setMinutes] = useState<number | null>(values?.printTimeMinutes ?? null);

  function field(name: PrintFieldName) {
    const spec = specs[name];
    const words = t.print.fields[name];
    const id = `field-${name}`;
    const hint = words.hint ? `${id}-hint` : undefined;
    const hintEl = words.hint ? (
      <span id={hint} className={ui.hint}>
        {words.hint}
      </span>
    ) : null;
    switch (spec.kind) {
      case "text": {
        const value = (values?.[name] as string | null | undefined) ?? "";
        const long = (spec.maxLength ?? 0) > 500;
        return (
          <div key={name}>
            <label htmlFor={id} className={ui.label}>
              {words.label}
            </label>
            {long ? (
              <textarea id={id} name={name} defaultValue={value} maxLength={spec.maxLength} rows={6} aria-describedby={hint} className={ui.input} />
            ) : (
              <input
                id={id}
                name={name}
                defaultValue={value}
                maxLength={spec.maxLength}
                required={spec.required}
                aria-describedby={hint}
                className={ui.input}
              />
            )}
            {hintEl}
          </div>
        );
      }
      case "integer":
        return (
          <div key={name}>
            <label htmlFor={id} className={ui.label}>
              {words.label}
            </label>
            <input
              id={id}
              name={name}
              type="number"
              inputMode="numeric"
              step={1}
              min={spec.min}
              max={spec.max}
              defaultValue={(values?.[name] as number | null | undefined) ?? ""}
              aria-describedby={name === "printTimeMinutes" ? `${id}-as-hours` : undefined}
              onInput={name === "printTimeMinutes" ? (e) => setMinutes(e.currentTarget.value ? Number(e.currentTarget.value) : null) : undefined}
              className={`${ui.input} tabular`}
            />
            {/* The group says where these come from; the print time also says itself in hours. */}
            {name === "printTimeMinutes" && (
              <span id={`${id}-as-hours`} className={`${ui.hint} tabular`} aria-live="polite">
                {minutes !== null && minutes > 0 ? `= ${formatMinutes(minutes)}` : ""}
              </span>
            )}
          </div>
        );
      case "boolean":
        return (
          <label key={name} className="flex min-h-11 items-center gap-3">
            <input name={name} type="checkbox" defaultChecked={Boolean(values?.[name])} className="size-5 accent-accent" />
            <span className="font-medium">{words.label}</span>
          </label>
        );
      case "ids":
        return (
          <fieldset key={name}>
            {/* The card's heading says it; the legend still names the group of checkboxes. */}
            <legend className="sr-only">{words.label}</legend>
            {categories.length === 0 ? (
              <p className={ui.hint}>
                {t.print.noCategories}{" "}
                <Link href="/categories" className="underline">
                  {t.nav.categories}
                </Link>
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {/* The print's own categories first, in their order (the first is its main one), then the rest: a save sends the ticked ones
                    in this order, so it keeps theirs and puts a newly ticked one last. */}
                {[...categories]
                  .sort((a, b) => rank(a.id) - rank(b.id))
                  .map((c) => (
                    <label
                      key={c.id}
                      className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-3 has-checked:border-2 has-checked:border-accent has-checked:font-semibold has-focus-visible:outline-3 has-focus-visible:outline-accent"
                    >
                      <input type="checkbox" name={name} value={c.id} defaultChecked={values?.categoryIds.includes(c.id)} className="size-4 accent-accent" />
                      {c.name}
                    </label>
                  ))}
              </div>
            )}
          </fieldset>
        );
      case "sources":
        return (
          <fieldset key={name} aria-describedby={hint}>
            <legend className={ui.label}>{words.label}</legend>
            {hintEl}
            <ul className="mt-2 space-y-3">
              {sources.map((s, i) => (
                <li key={s.key} className="rounded-lg border border-border p-3">
                  <fieldset>
                    <legend className="sr-only">{t.print.sourceN(i + 1)}</legend>
                    <div className="flex items-end gap-2">
                      <label className="block flex-1">
                        <span className={ui.label}>{t.print.sourceLabel}</span>
                        <input name={`${name}.label`} defaultValue={s.label} maxLength={spec.labelMaxLength} className={ui.input} />
                      </label>
                      <button
                        type="button"
                        aria-label={t.print.removeSource(i + 1)}
                        onClick={() => setSources((list) => list.filter((x) => x.key !== s.key))}
                        className={ui.icon}
                      >
                        <CloseIcon aria-hidden="true" className={ui.iconSize} />
                      </button>
                    </div>
                    <label className="mt-2 block">
                      <span className={ui.label}>{t.print.sourceUrl}</span>
                      <input name={`${name}.url`} type="url" inputMode="url" defaultValue={s.url} maxLength={spec.urlMaxLength} className={ui.input} />
                    </label>
                  </fieldset>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={spec.max !== undefined && sources.length >= spec.max}
              onClick={() => {
                setSources((list) => [...list, { label: "", url: "", key: nextKey }]);
                setNextKey((k) => k + 1);
              }}
              className={`${ui.secondary} mt-3`}
            >
              <AddIcon aria-hidden="true" className={ui.iconSize} />
              {t.print.addSource}
            </button>
          </fieldset>
        );
      case "slug":
        return (
          <div key={name}>
            <label htmlFor={id} className={ui.label}>
              {words.label}
            </label>
            <input
              id={id}
              name={name}
              defaultValue={values?.slug ?? ""}
              maxLength={spec.maxLength}
              disabled={slugFixed}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              autoCapitalize="none"
              aria-describedby={`${id}-hint`}
              className={`${ui.input} font-mono disabled:bg-surface disabled:text-muted`}
            />
            <span id={`${id}-hint`} className={ui.hint}>
              {slugFixed ? t.print.slugFixed : words.hint}
            </span>
          </div>
        );
    }
  }

  return (
    <form ref={form} onSubmit={submit} className="mt-4 space-y-5">
      <ThreeMfFill onRead={fill} />
      {groups.map(({ group, fields }) =>
        group === "numbers" ? (
          <section key={group} aria-labelledby={`group-${group}`} className={ui.card}>
            <h3 id={`group-${group}`} className={ui.h2}>
              {t.print.groups[group]}
            </h3>
            <p className={`${ui.hint} mt-0.5`}>{t.print.groups.numbersHint}</p>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-4">{fields.map(field)}</div>
          </section>
        ) : (
          <section key={group} aria-labelledby={`group-${group}`} className={`${ui.card} space-y-4`}>
            <h3 id={`group-${group}`} className={ui.h2}>
              {t.print.groups[group]}
            </h3>
            {fields.map(field)}
          </section>
        ),
      )}
      <div data-sticky-bottom className="sticky bottom-[var(--tabbar)] z-10 -mx-safe space-y-2 border-t border-border bg-paper px-safe py-3">
        <Notice result={result} />
        <button type="submit" disabled={pending} className={`${ui.button} w-full`}>
          {pending ? t.common.saving : t.common.save}
        </button>
      </div>
    </form>
  );
}
