"use client";
import { startTransition, useActionState, useState, useTransition, type FormEvent } from "react";
import { useCopy } from "@/components/CopyProvider";
import { ConfirmDialog } from "@/components/Dialog";
import { AddIcon, DeleteIcon, RenameIcon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { ui } from "@/components/ui";
import { addCategory, removeCategory, renameCategoryAction, type Result } from "../actions";

type Category = { id: string; name: string; slug: string; prints: number };

/** Submits a form through a useActionState dispatcher by hand, so a refused save keeps what was typed (no automatic form reset). */
function submitWith(dispatch: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
}

export function Categories({ categories }: { categories: Category[] }) {
  const t = useCopy();
  const tc = t.categories;
  const [created, create, creating] = useActionState(addCategory, null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, start] = useTransition();
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <>
      <form onSubmit={submitWith(create)} className="mt-5 flex flex-wrap items-end gap-3">
        <label className="block min-w-0 flex-1">
          <span className={ui.label}>{tc.newLabel}</span>
          {/* A created category empties the field: the input is new once the list has one more. A refusal leaves the list (and the
              typed name) as it was. */}
          <input name="name" required maxLength={60} key={categories.length} className={ui.input} />
        </label>
        <button type="submit" disabled={creating} className={ui.button}>
          <AddIcon aria-hidden="true" className={ui.iconSize} />
          {tc.create}
        </button>
      </form>
      <div className="mt-2">
        <Notice result={result ?? created} />
      </div>
      {categories.length === 0 ? (
        <p className="mt-4 text-muted">{tc.empty}</p>
      ) : (
        <ul aria-label={tc.list} className="mt-4 divide-y divide-border rounded-xl border border-border">
          {categories.map((c) => (
            <li key={c.id} className="p-3">
              {renaming === c.id ? (
                <Rename category={c} onDone={(r) => (setRenaming(null), setResult(r))} onCancel={() => setRenaming(null)} />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block text-sm text-muted">{tc.prints(c.prints)}</span>
                  </span>
                  <button type="button" aria-label={tc.rename(c.name)} onClick={() => setRenaming(c.id)} className={ui.icon}>
                    <RenameIcon aria-hidden="true" className={ui.iconSize} />
                  </button>
                  <button
                    type="button"
                    aria-label={tc.delete(c.name)}
                    aria-describedby={c.prints > 0 ? `in-use-${c.id}` : undefined}
                    disabled={busy || c.prints > 0}
                    onClick={() => setDeleting(c)}
                    className={`${ui.icon} text-danger`}
                  >
                    <DeleteIcon aria-hidden="true" className={ui.iconSize} />
                  </button>
                </div>
              )}
              {c.prints > 0 && renaming !== c.id && (
                <p id={`in-use-${c.id}`} className="sr-only">
                  {tc.inUse}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? tc.delete(deleting.name) : ""}
        text={<p>{deleting ? tc.deleteConfirm(deleting.name) : ""}</p>}
        confirm={t.common.delete}
        cancel={t.common.cancel}
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          const id = deleting!.id;
          setDeleting(null);
          start(async () => setResult(await removeCategory(id)));
        }}
      />
    </>
  );
}

function Rename({ category, onDone, onCancel }: { category: Category; onDone: (r: Result) => void; onCancel: () => void }) {
  const t = useCopy();
  const [result, dispatch, pending] = useActionState(async (prev: Result | null, fd: FormData) => {
    const r = await renameCategoryAction(category.id, prev, fd);
    if (r.ok) onDone(r);
    return r;
  }, null);
  return (
    <form onSubmit={submitWith(dispatch)} className="space-y-2">
      <label className="block">
        <span className={ui.label}>{t.categories.renameLabel(category.name)}</span>
        <input name="name" required maxLength={60} defaultValue={category.name} autoFocus className={ui.input} />
      </label>
      <Notice result={result} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={ui.button}>
          {t.common.save}
        </button>
        <button type="button" onClick={onCancel} className={ui.secondary}>
          {t.common.cancel}
        </button>
      </div>
    </form>
  );
}
