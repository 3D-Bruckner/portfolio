"use client";
// A form block's heading with its small AI button (the text block's "Improve", the categories' "Suggest"). What Claude answers opens as
// a review under it (AiReview): the form changes only by what is taken there. Tapping the button again asks for another version.
import { useState, useTransition, type RefObject } from "react";
import { useCopy } from "@/components/CopyProvider";
import { AiIcon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { useHydrated } from "@/components/useHydrated";
import { ui } from "@/components/ui";
import { AiReview, type ReviewResult } from "./AiReview";

type Props = {
  id: string;
  heading: string;
  /** The button's word, and its full name for a screen reader (which starts from what is seen). */
  label: string;
  name: string;
  form: RefObject<HTMLFormElement | null>;
  run: () => Promise<ReviewResult>;
};

export function AiBlockHeading({ id, heading, label, name, form, run }: Props) {
  const t = useCopy().print.ai;
  const hydrated = useHydrated();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<(Extract<ReviewResult, { ok: true }> & { version: number }) | null>(null);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={id} className={ui.h2}>
          {heading}
        </h3>
        <button
          type="button"
          aria-label={name}
          disabled={busy || !hydrated}
          className={ui.secondary}
          onClick={() => {
            setError(null);
            start(async () => {
              const got = await run();
              if (!got.ok) return setError(got.error);
              setReview((r) => ({ ...got, version: (r?.version ?? 0) + 1 }));
            });
          }}
        >
          <AiIcon aria-hidden="true" className={ui.iconSize} />
          {busy ? t.busy : label}
        </button>
      </div>
      {error && <Notice result={{ ok: false, error }} />}
      {review && <AiReview key={review.version} form={form} rows={review.rows} notes={review.notes} onClose={() => setReview(null)} />}
    </div>
  );
}
