"use client";
// A print's fields, drawn from the field table's specs in FORM_ORDER (fieldorder.ts), so every field the table lists is here once. It
// posts to savePrint, whose parse is the table's (printform.ts). Submitted by hand (startTransition), not as <form action>, so a refused
// save keeps what was typed.
import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { useCopy } from "@/components/CopyProvider";
import { AddIcon, CloseIcon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { ui } from "@/components/ui";
import { savePrint } from "../actions";
import { FORM_ORDER, type FieldSpec, type PrintFieldName } from "./fieldorder";

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

export function PrintForm({ printId, specs, categories, values, slugFixed }: Props) {
  const t = useCopy();
  const [result, dispatch, pending] = useActionState(savePrint.bind(null, printId), null);
  const [sources, setSources] = useState(() => (values?.sources ?? []).map((s, i) => ({ ...s, key: i })));
  const [nextKey, setNextKey] = useState(sources.length);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }

  const fields = FORM_ORDER.filter((n) => printId !== null || n !== "slug");

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
              aria-describedby={hint}
              className={`${ui.input} max-w-40`}
            />
            {hintEl}
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
            <legend className={ui.label}>{words.label}</legend>
            {categories.length === 0 ? (
              <p className={ui.hint}>
                {t.print.noCategories}{" "}
                <Link href="/categories" className="underline">
                  {t.nav.categories}
                </Link>
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {categories.map((c) => (
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
                        <input name={`${name}.label`} defaultValue={s.label} maxLength={100} className={ui.input} />
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
                      <input name={`${name}.url`} type="url" inputMode="url" defaultValue={s.url} maxLength={2000} className={ui.input} />
                    </label>
                  </fieldset>
                </li>
              ))}
            </ul>
            <button
              type="button"
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
    <form onSubmit={submit} className="mt-4 space-y-5">
      {fields.map(field)}
      <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-border bg-paper px-4 py-3">
        <Notice result={result} />
        <button type="submit" disabled={pending} className={`${ui.button} w-full`}>
          {pending ? t.common.saving : t.common.save}
        </button>
      </div>
    </form>
  );
}
