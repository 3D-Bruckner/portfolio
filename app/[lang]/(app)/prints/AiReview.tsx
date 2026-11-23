"use client";
// What Claude suggests, next to what the form holds now (stacked on a phone, side by side when there's room). Nothing changes until a
// suggestion is taken, field by field or all at once; a taken one can be undone, and nothing is saved until the form is.
import { useEffect, useState, type RefObject } from "react";
import { useCopy } from "@/components/CopyProvider";
import { ui } from "@/components/ui";

export type ReviewRow = {
  key: string;
  label: string;
  /** What the form holds now, as words. */
  now: () => string;
  next: string;
  /** Puts the suggestion into the form; returns what puts the earlier value back. */
  take: () => () => void;
};
export type ReviewResult = { ok: true; rows: ReviewRow[]; notes: string[] } | { ok: false; error: string };

type Props = { form: RefObject<HTMLFormElement | null>; rows: ReviewRow[]; notes: string[]; onClose: () => void };

export function AiReview({ form, rows, notes, onClose }: Props) {
  const t = useCopy().print.ai;
  const read = () => Object.fromEntries(rows.map((r) => [r.key, r.now()]));
  const [nows, setNows] = useState<Record<string, string>>(read);
  const [undos, setUndos] = useState<Record<string, () => void>>({});

  // What is typed while the suggestion is open shows as "now".
  useEffect(() => {
    const el = form.current;
    const changed = () => setNows(Object.fromEntries(rows.map((r) => [r.key, r.now()])));
    el?.addEventListener("input", changed);
    return () => el?.removeEventListener("input", changed);
  }, [form, rows]);

  const shown = rows.filter((r) => undos[r.key] || nows[r.key] !== r.next);
  const open = shown.filter((r) => !undos[r.key]);
  function take(list: ReviewRow[]) {
    const taken = Object.fromEntries(list.map((r) => [r.key, r.take()]));
    setUndos((u) => ({ ...u, ...taken }));
    setNows(read());
  }
  function undo(r: ReviewRow) {
    undos[r.key]?.();
    setUndos((u) => Object.fromEntries(Object.entries(u).filter(([k]) => k !== r.key)));
    setNows(read());
  }

  return (
    <div role="group" aria-label={t.proposal} className="mt-3 space-y-3 rounded-lg border border-border bg-paper p-3 text-sm">
      {shown.length === 0 && <p className="text-muted">{t.noChange}</p>}
      {shown.map((r) => (
        <div key={r.key} role="group" aria-label={`${t.proposal}: ${r.label}`}>
          <p className="font-semibold">{r.label}</p>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-border p-2">
              <p className="text-xs font-semibold text-muted">{undos[r.key] ? t.before : t.now}</p>
              <p className="mt-0.5 break-words whitespace-pre-wrap text-muted">{undos[r.key] ? t.replaced : nows[r.key] || t.empty}</p>
            </div>
            <div className="rounded-md border-2 border-accent p-2">
              <p className="text-xs font-semibold text-muted">{t.proposal}</p>
              <p className="mt-0.5 break-words whitespace-pre-wrap">{r.next}</p>
            </div>
          </div>
          {undos[r.key] ? (
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-muted">{t.taken}</span>
              <button type="button" className={ui.secondary} aria-label={`${t.undo}: ${r.label}`} onClick={() => undo(r)}>
                {t.undo}
              </button>
            </p>
          ) : (
            <button type="button" className={`${ui.secondary} mt-2`} aria-label={`${t.take}: ${r.label}`} onClick={() => take([r])}>
              {t.take}
            </button>
          )}
        </div>
      ))}
      {notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-muted">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        {open.length > 1 && (
          <button type="button" className={ui.button} onClick={() => take(open)}>
            {t.takeAll}
          </button>
        )}
        <button type="button" className={ui.secondary} onClick={onClose}>
          {open.length > 0 && Object.keys(undos).length === 0 ? t.dismiss : t.close}
        </button>
      </div>
    </div>
  );
}
