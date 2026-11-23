"use client";
// One tip of "For the website", at the field it belongs to: what's missing and, where the app can help, a button. The formula's price is
// filled in at once (with "Undo"); what Claude suggests opens as a review first (AiReview). Nothing is saved until the form is.
import { useState, useTransition, type RefObject } from "react";
import { useCopy } from "@/components/CopyProvider";
import { TipIcon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { ui } from "@/components/ui";
import { AiReview, type ReviewResult } from "./AiReview";

export type FormTip = { code: string; field: string; words: string };
export type TipApply = { label: string; fill: () => () => void } | { label: string; review: () => Promise<ReviewResult> };

type Props = { words: string; apply?: TipApply; form?: RefObject<HTMLFormElement | null> };

export function FieldTip({ words, apply, form }: Props) {
  const t = useCopy();
  const [busy, start] = useTransition();
  const [undo, setUndo] = useState<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Extract<ReviewResult, { ok: true }> | null>(null);

  function act() {
    if (!apply) return;
    setError(null);
    if ("fill" in apply) {
      const back = apply.fill();
      setUndo(() => back);
      return;
    }
    const ask = apply.review;
    start(async () => {
      const got = await ask();
      if (got.ok) setReview(got);
      else setError(got.error);
    });
  }

  return (
    <div className="rounded-lg border border-border bg-paper px-3 py-2 text-sm">
      <p className="flex items-start gap-2">
        <TipIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
        <span className="flex-1">{undo ? t.print.readiness.applied : words}</span>
      </p>
      {undo ? (
        <button
          type="button"
          className={`${ui.secondary} mt-2`}
          onClick={() => {
            undo();
            setUndo(null);
          }}
        >
          {t.print.ai.undo}
        </button>
      ) : (
        apply &&
        !review && (
          <button type="button" disabled={busy} className={`${ui.secondary} mt-2`} onClick={act}>
            {busy ? t.print.ai.busy : apply.label}
          </button>
        )
      )}
      {error && <Notice result={{ ok: false, error }} />}
      {review && form && <AiReview form={form} rows={review.rows} notes={review.notes} onClose={() => setReview(null)} />}
    </div>
  );
}
