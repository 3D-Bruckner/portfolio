"use client";
// "Enhance with AI": the form's texts as they are now go to Claude (enhanceWithAi, backend/enhance.ts), and its suggestion fills the
// title, short title, description and categories. Nothing is saved; "Undo" puts the texts back as they were before.
import { useState, useTransition } from "react";
import type { EnhanceInput, Suggestion } from "@/backend/client";
import { useCopy } from "@/components/CopyProvider";
import { AiIcon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { useHydrated } from "@/components/useHydrated";
import { ui } from "@/components/ui";
import { enhanceWithAi } from "../actions";

type Props = {
  /** What the form shows now. */
  read: () => EnhanceInput;
  /** Fills the form with the suggestion; returns what puts the form back. */
  apply: (s: Suggestion) => () => void;
};

export function AiEnhance({ read, apply }: Props) {
  const t = useCopy().print.ai;
  const hydrated = useHydrated();
  const [busy, start] = useTransition();
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; error: string } | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [undo, setUndo] = useState<(() => void) | null>(null);

  return (
    <div className="rounded-lg border border-dashed border-border p-3">
      <button
        type="button"
        disabled={busy || !hydrated}
        className={`${ui.secondary} w-full justify-center`}
        aria-describedby="ai-hint"
        onClick={() => {
          setResult(null);
          setNotes([]);
          start(async () => {
            const got = await enhanceWithAi(read());
            if (!got.ok) return setResult({ ok: false, error: got.error });
            setUndo(() => apply(got.value));
            setNotes(got.value.notes);
            setResult({ ok: true, message: t.done });
          });
        }}
      >
        <AiIcon aria-hidden="true" className={ui.iconSize} />
        {busy ? t.busy : t.button}
      </button>
      <span id="ai-hint" className={ui.hint}>
        {t.hint}
      </span>
      <Notice result={result} />
      {notes.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {undo && (
        <button
          type="button"
          className={`${ui.secondary} mt-2`}
          onClick={() => {
            undo();
            setUndo(null);
            setNotes([]);
            setResult({ ok: true, message: t.undone });
          }}
        >
          {t.undo}
        </button>
      )}
    </div>
  );
}
