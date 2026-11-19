"use client";
// Whether the print is on the site, in words and a mark (not colour alone); publishing (disabled, saying what is missing, until it can)
// or taking it off; and deleting it after a question.
import { useState, useTransition } from "react";
import { useCopy } from "@/components/CopyProvider";
import { ConfirmDialog } from "@/components/Dialog";
import { DeleteIcon, PublishIcon, UnpublishIcon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { ui } from "@/components/ui";
import { publish, removePrint, unpublish, type Result } from "../actions";

export function PublishBar({ printId, title, status, missing }: { printId: string; title: string; status: "draft" | "published"; missing: string[] }) {
  const t = useCopy();
  const [result, setResult] = useState<Result | null>(null);
  const [busy, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const run = (fn: () => Promise<Result>) => start(async () => setResult(await fn()));
  const published = status === "published";
  return (
    <div className="mt-3 space-y-3">
      <p className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${published ? "bg-accent text-on-accent" : "border border-dashed border-line text-ink"}`}
        >
          {published ? <PublishIcon aria-hidden="true" className={ui.iconSize} /> : <UnpublishIcon aria-hidden="true" className={ui.iconSize} />}
          <span>{t.print.status[status]}</span>
        </span>
      </p>
      {!published && missing.length > 0 && <p className="text-sm text-muted">{t.print.missing(missing)}</p>}
      <div className="flex flex-wrap gap-3">
        {published ? (
          <button type="button" disabled={busy} onClick={() => run(() => unpublish(printId))} className={ui.secondary}>
            <UnpublishIcon aria-hidden="true" className={ui.iconSize} />
            {t.print.unpublish}
          </button>
        ) : (
          <button type="button" disabled={busy || missing.length > 0} onClick={() => run(() => publish(printId))} className={ui.button}>
            <PublishIcon aria-hidden="true" className={ui.iconSize} />
            {busy ? t.print.publishing : t.print.publish}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => setAsking(true)} className={ui.danger}>
          <DeleteIcon aria-hidden="true" className={ui.iconSize} />
          {t.print.deletePrint}
        </button>
      </div>
      <Notice result={result} />
      <ConfirmDialog
        open={asking}
        title={t.print.deletePrint}
        text={
          <>
            <p>{t.print.deleteConfirm(title)}</p>
            {published && <p className="font-medium">{t.print.deletePublished}</p>}
          </>
        }
        confirm={t.common.delete}
        cancel={t.common.cancel}
        busy={busy}
        onClose={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          run(() => removePrint(printId));
        }}
      />
    </div>
  );
}
