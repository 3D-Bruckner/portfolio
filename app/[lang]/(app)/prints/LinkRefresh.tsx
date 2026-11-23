"use client";
// Reads a print's model link again and opens what it says as a review (AiReview), next to what the form holds: taken per field or all at
// once, and nothing is saved until the form is. Photos are never touched. A model with several profiles offers them, since they can differ
// a lot in size; choosing one reads the link again with its #profileId.
import { useState, useTransition, type RefObject } from "react";
import type { ModelReading } from "@/backend/client";
import { useCopy } from "@/components/CopyProvider";
import { Notice } from "@/components/Notice";
import { useHydrated } from "@/components/useHydrated";
import { ui } from "@/components/ui";
import { readModelLink, translateTexts } from "../actions";
import { AiReview, type ReviewRow } from "./AiReview";

type Texts = { title: string; description: string };
type Props = {
  form: RefObject<HTMLFormElement | null>;
  /** The source addresses the form holds now, saved or not. */
  urls: () => string[];
  rowsOf: (reading: ModelReading, german: Texts) => ReviewRow[];
  formatMinutes: (minutes: number) => string;
};
type Shown = { reading: ModelReading; link: string; rows: ReviewRow[]; version: number };

export function LinkRefresh({ form, urls, rowsOf, formatMinutes }: Props) {
  const t = useCopy().print.link;
  const hydrated = useHydrated();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);

  function read(list: string[]) {
    setError(null);
    start(async () => {
      const got = await readModelLink(list);
      if (!got.ok) {
        setShown(null);
        setError(got.error);
        return;
      }
      const original = { title: got.value.title, description: got.value.description };
      // The site is German and a model page mostly isn't. Without a translation the page's own words are offered.
      const german = await translateTexts(original).catch(() => original);
      setShown((s) => ({ reading: got.value, link: got.link, rows: rowsOf(got.value, german), version: (s?.version ?? 0) + 1 }));
    });
  }

  const reading = shown?.reading;
  const notes = reading
    ? [
        ...(reading.weightGrams === null || reading.printTimeMinutes === null ? [t.noNumbers] : []),
        ...(reading.scaled ? [t.scaled(reading.scaled.from, reading.scaled.factor)] : []),
      ]
    : [];

  return (
    <div className="mt-3">
      <button type="button" disabled={busy || !hydrated} className={ui.secondary} onClick={() => read(urls())}>
        {busy ? t.busy : t.refresh}
      </button>
      {error && <Notice result={{ ok: false, error }} />}
      {shown && reading && reading.profiles.length > 1 && (
        <div className="mt-3">
          <label htmlFor="link-profile" className={ui.label}>
            {t.profile}
          </label>
          <select
            id="link-profile"
            disabled={busy}
            value={reading.profileId ?? ""}
            onChange={(e) => read([`${shown.link.split("#")[0]}#profileId-${e.currentTarget.value}`])}
            className={ui.input}
          >
            {reading.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {t.profileOption(p.name, p.weightGrams, p.printTimeMinutes === null ? null : formatMinutes(p.printTimeMinutes))}
              </option>
            ))}
          </select>
        </div>
      )}
      {shown && (
        <AiReview key={shown.version} form={form} rows={shown.rows} notes={notes} proposal={t.proposal} noChange={t.noChange} onClose={() => setShown(null)} />
      )}
    </div>
  );
}
