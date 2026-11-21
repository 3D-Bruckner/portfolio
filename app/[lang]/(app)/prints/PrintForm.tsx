"use client";
// A print's fields, drawn from the field table's specs in FORM_ORDER (fieldorder.ts), so every field the table lists is here once. It
// posts to savePrint, whose parse is the table's (printform.ts). Submitted by hand (startTransition), not as <form action>, so a refused
// save keeps what was typed.
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { priceParts, suggestedPrice, type EnhanceInput, type Suggestion, type ThreeMfReading } from "@/backend/client";
import { useCopy } from "@/components/CopyProvider";
import { AddIcon, CloseIcon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { useHydrated } from "@/components/useHydrated";
import { ui } from "@/components/ui";
import { savePrint } from "../actions";
import { FORM_GROUPS, FORM_ORDER, type FieldSpec, type PrintFieldName } from "./fieldorder";
import { AiEnhance } from "./AiEnhance";
import { NewCategory } from "./NewCategory";
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
  /** Whether "Enhance with AI" is offered (the server has a Claude gateway). */
  ai?: boolean;
};

/** Each field's posted entries (a source's label and url go under "sources"), as one string to compare. */
function snapshot(form: HTMLFormElement): Record<string, string> {
  const entries = [...new FormData(form).entries()].map(([k, v]) => [k, String(v)] as const);
  return Object.fromEntries(FORM_ORDER.map((n) => [n, JSON.stringify(entries.filter(([k]) => k === n || k.startsWith(`${n}.`)))]));
}

/** 135 → "2 h 15 min". */
const formatMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);

export function PrintForm({ printId, specs, categories, values, slugFixed, ai = false }: Props) {
  const held = values?.categoryIds ?? [];
  const rank = (id: string) => (held.includes(id) ? held.indexOf(id) : held.length);
  const t = useCopy();
  const [result, dispatch, pending] = useActionState(savePrint.bind(null, printId), null);
  const [sources, setSources] = useState(() => (values?.sources ?? []).map((s, i) => ({ ...s, key: i })));
  const [nextKey, setNextKey] = useState(sources.length);
  const form = useRef<HTMLFormElement>(null);
  // Categories made in this form stay last and ticked, also once the refreshed page lists them among the others.
  const [added, setAdded] = useState<{ id: string; name: string }[]>([]);
  const allCategories = [...categories.filter((c) => !added.some((a) => a.id === c.id)), ...added];
  // Saving needs the page's script (the form is sent by submit, not by the browser): before it runs, the button waits.
  const hydrated = useHydrated();

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
    setNums((n) => ({
      price: r.price ?? n.price ?? null,
      weightGrams: r.weightGrams ?? n.weightGrams ?? null,
      printTimeMinutes: r.printTimeMinutes ?? n.printTimeMinutes ?? null,
      colors: r.colors ?? n.colors ?? null,
    }));
    put("weightGrams", r.weightGrams);
    put("colors", r.colors);
    put("price", r.price);
    put("title", r.title, true);
    put("description", r.description, true);
    // A source counts as there when its address field holds something now (typed, not only the one the page came with).
    const typed = [...(form.current?.querySelectorAll<HTMLInputElement>('input[name="sources.url"]') ?? [])].some((i) => i.value.trim());
    if (r.source && !typed) {
      setSources([{ ...r.source, key: nextKey }]);
      setNextKey(nextKey + 1);
      filled.push("sources");
    }
    return filled;
  }

  // "Enhance with AI": what the form shows now goes to Claude; its texts and categories come back into the fields, and the returned
  // function puts the earlier ones back. Nothing is saved until the form is.
  const named = (name: string) => form.current?.elements.namedItem(name);
  const text = (name: string) => {
    const el = named(name);
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : "";
  };
  const boxes = () => [...(form.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="categoryIds"]') ?? [])];
  function readForAi(): EnhanceInput {
    const urls = [...(form.current?.querySelectorAll<HTMLInputElement>('input[name="sources.url"]') ?? [])];
    const labels = [...(form.current?.querySelectorAll<HTMLInputElement>('input[name="sources.label"]') ?? [])];
    const num = (n: string) => (text(n).trim() && Number.isFinite(Number(text(n))) ? Number(text(n)) : null);
    return {
      printId,
      title: text("title"),
      shortTitle: text("shortTitle"),
      description: text("description"),
      categoryIds: boxes()
        .filter((b) => b.checked)
        .map((b) => b.value),
      sources: urls.map((u, i) => ({ label: labels[i]?.value ?? "", url: u.value })).filter((s) => s.url.trim()),
      weightGrams: num("weightGrams"),
      printTimeMinutes: num("printTimeMinutes"),
      colors: num("colors"),
    };
  }
  function applyAi(s: Suggestion): () => void {
    const set = (name: string, value: string) => {
      const el = named(name);
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = value;
    };
    const before = { title: text("title"), shortTitle: text("shortTitle"), description: text("description"), checked: boxes().map((b) => b.checked) };
    set("title", s.title);
    set("shortTitle", s.shortTitle ?? "");
    set("description", s.description);
    if (s.categoryIds.length > 0) for (const b of boxes()) b.checked = s.categoryIds.includes(b.value);
    return () => {
      set("title", before.title);
      set("shortTitle", before.shortTitle);
      set("description", before.description);
      boxes().forEach((b, i) => (b.checked = before.checked[i] ?? b.checked));
    };
  }

  // The form's values as they were shown (and as last saved), per field: a save sends only the fields that differ, so what Claude or
  // another tab changed since stays (printform.ts, _fields).
  const shown = useRef<Record<string, string> | null>(null);
  useEffect(() => {
    if (form.current) shown.current = snapshot(form.current);
  }, []);
  useEffect(() => {
    if (result?.ok && form.current) shown.current = snapshot(form.current);
  }, [result]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (printId !== null && shown.current) {
      const now = snapshot(e.currentTarget);
      fd.set("_fields", FORM_ORDER.filter((n) => now[n] !== shown.current![n]).join(","));
    }
    startTransition(() => dispatch(fd));
  }

  const groups = FORM_GROUPS.map((g) => ({ ...g, fields: g.fields.filter((n) => printId !== null || n !== "slug") })).filter((g) => g.fields.length > 0);
  // The print time as hours and minutes, under its field, as it is typed.
  // The numbers as typed, for the print time in hours and the price the site's formula suggests from weight and time.
  const [nums, setNums] = useState<Record<string, number | null>>({
    price: values?.price ?? null,
    weightGrams: values?.weightGrams ?? null,
    printTimeMinutes: values?.printTimeMinutes ?? null,
    colors: values?.colors ?? null,
  });
  const setNum = (name: string, value: string) => setNums((n) => ({ ...n, [name]: value === "" ? null : Number(value) }));
  const minutes = nums.printTimeMinutes ?? null;
  const priceInput =
    nums.weightGrams && nums.printTimeMinutes
      ? { weightGrams: nums.weightGrams, printTimeMinutes: nums.printTimeMinutes, multicolor: (nums.colors ?? 1) >= 2, material: "PLA" as const }
      : null;
  const suggestion = priceInput ? suggestedPrice(priceInput) : null;
  const parts = priceInput ? priceParts(priceInput) : null;
  function takeSuggestion() {
    const el = form.current?.elements.namedItem("price");
    if (suggestion === null || !(el instanceof HTMLInputElement)) return;
    el.value = String(suggestion);
    setNum("price", el.value);
  }

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
              onInput={(e) => setNum(name, e.currentTarget.value)}
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
            {allCategories.length === 0 ? (
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
                {[...allCategories]
                  .sort((a, b) => rank(a.id) - rank(b.id))
                  .map((c) => (
                    <label
                      key={c.id}
                      className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-3 has-checked:border-2 has-checked:border-accent has-checked:font-semibold has-focus-visible:outline-3 has-focus-visible:outline-accent"
                    >
                      <input
                        type="checkbox"
                        name={name}
                        value={c.id}
                        defaultChecked={values?.categoryIds.includes(c.id) || added.some((a) => a.id === c.id)}
                        className="size-4 accent-accent"
                      />
                      {c.name}
                    </label>
                  ))}
              </div>
            )}
            <NewCategory onCreated={(c) => setAdded((list) => [...list, c])} />
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
            {/* Keyed by the stored address: when a save changes it (it follows a new title), the field shows the new one. */}
            <input
              key={values?.slug ?? ""}
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
      <ThreeMfFill printId={printId} onRead={fill} />
      {ai && <AiEnhance read={readForAi} apply={applyAi} />}
      {groups.map(({ group, fields }) =>
        group === "numbers" ? (
          <section key={group} aria-labelledby={`group-${group}`} className={ui.card}>
            <h3 id={`group-${group}`} className={ui.h2}>
              {t.print.groups[group]}
            </h3>
            <p className={`${ui.hint} mt-0.5`}>{t.print.groups.numbersHint}</p>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-4">{fields.map(field)}</div>
            {/* From weight and time, the price the site's own formula gives (PLA), and what it is made of: one tap takes it. */}
            {suggestion !== null && parts !== null && (
              <div className="mt-3 rounded-lg border border-border bg-paper px-3 py-2 text-sm" aria-live="polite">
                <p className="flex min-h-9 flex-wrap items-center justify-between gap-x-3">
                  <span className="tabular text-muted">{t.print.suggestedPrice(suggestion)}</span>
                  {suggestion !== nums.price && (
                    <button type="button" onClick={takeSuggestion} className="min-h-11 font-semibold text-ink underline underline-offset-2">
                      {t.print.takeSuggestion}
                    </button>
                  )}
                </p>
                <p className="tabular text-xs text-muted">{t.print.priceParts(parts)}</p>
              </div>
            )}
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
        <button type="submit" disabled={pending || !hydrated} className={`${ui.button} w-full`}>
          {pending ? t.common.saving : t.common.save}
        </button>
      </div>
    </form>
  );
}
