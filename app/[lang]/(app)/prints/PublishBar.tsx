"use client";
// Whether the print is on the site, in words and a mark (not colour alone); publishing (disabled, saying what is missing, until it can)
// or taking it off. Deleting it, after a question, is DeletePrint, at the end of the page.
import { useState, useTransition } from "react";
import { useCopy } from "@/components/CopyProvider";
import { ConfirmDialog } from "@/components/Dialog";
import { DeleteIcon, PublishIcon, UnpublishIcon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { ui } from "@/components/ui";
import { publish, removePrint, unpublish, type Result } from "../actions";

export function PublishBar({ printId, status, missing }: { printId: string; status: "draft" | "published"; missing: string[] }) {
  const t = useCopy();
  const [result, setResult] = useState<Result | null>(null);
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<Result>) => start(async () => setResult(await fn()));
  const published = status === "published";
  return (
    <div className="mt-2 space-y-3">
      <p className={`flex items-center gap-2 text-sm font-semibold ${published ? "text-success" : "text-muted"}`}>
        {published ? <PublishIcon aria-hidden="true" className={ui.iconSize} /> : <UnpublishIcon aria-hidden="true" className={ui.iconSize} />}
        <span>{t.print.status[status]}</span>
      </p>
      {!published && missing.length > 0 && <p className="text-sm text-muted">{t.print.missing(missing)}</p>}
      {published ? (
        <button type="button" disabled={busy} onClick={() => run(() => unpublish(printId))} className={ui.secondary}>
          <UnpublishIcon aria-hidden="true" className={ui.iconSize} />
          {t.print.unpublish}
        </button>
      ) : (
        <button type="button" disabled={busy || missing.length > 0} onClick={() => run(() => publish(printId))} className={`${ui.button} w-full`}>
          <PublishIcon aria-hidden="true" className={ui.iconSize} />
          {busy ? t.print.publishing : t.print.publish}
        </button>
      )}
      <Notice result={result} />
    </div>
  );
}

/** Deleting the print, after a question: at the end of its page, away from the buttons used every day. */
export function DeletePrint({ printId, title, published }: { printId: string; title: string; published: boolean }) {
  const t = useCopy();
  const [result, setResult] = useState<Result | null>(null);
  const [busy, start] = useTransition();
  const [asking, setAsking] = useState(false);
  return (
    <section aria-labelledby="delete-heading" className="mt-10 border-t border-border pt-5">
      <h2 id="delete-heading" className="sr-only">
        {t.print.deletePrint}
      </h2>
      <button type="button" disabled={busy} onClick={() => setAsking(true)} className={`${ui.danger} w-full`}>
        <DeleteIcon aria-hidden="true" className={ui.iconSize} />
        {t.print.deletePrint}
      </button>
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
          start(async () => setResult(await removePrint(printId)));
        }}
      />
    </section>
  );
}
