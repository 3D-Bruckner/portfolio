"use client";
import { startTransition, useActionState, useState, useTransition, type FormEvent } from "react";
import { useCopy } from "@/components/CopyProvider";
import { ConfirmDialog } from "@/components/Dialog";
import { AddIcon, DeleteIcon, RenameIcon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { ui } from "@/components/ui";
import { addAddOn, removeAddOn, saveAddOn, type Result } from "../actions";

type AddOn = { id: string; name: string; priceCents: number; available: boolean; invoiceNinjaProduct: string | null; prints: number };

/** Submits a form through a useActionState dispatcher by hand, so a refused save keeps what was typed. */
function submitWith(dispatch: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
}

function Fields({ addOn }: { addOn?: AddOn }) {
  const t = useCopy().addOns;
  const id = addOn?.id ?? "new";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor={`addon-name-${id}`} className={ui.label}>
          {t.name}
        </label>
        <input id={`addon-name-${id}`} name="name" required maxLength={60} defaultValue={addOn?.name} className={ui.input} />
      </div>
      <div>
        <label htmlFor={`addon-price-${id}`} className={ui.label}>
          {t.price}
        </label>
        <input
          id={`addon-price-${id}`}
          name="price"
          type="number"
          inputMode="decimal"
          required
          min={0}
          max={1000}
          step={0.01}
          defaultValue={addOn ? addOn.priceCents / 100 : undefined}
          className={`${ui.input} tabular`}
        />
      </div>
      <div>
        <label htmlFor={`addon-product-${id}`} className={ui.label}>
          {t.product}
        </label>
        <input
          id={`addon-product-${id}`}
          name="invoiceNinjaProduct"
          maxLength={100}
          defaultValue={addOn?.invoiceNinjaProduct ?? ""}
          aria-describedby={`addon-product-${id}-hint`}
          className={ui.input}
        />
        <span id={`addon-product-${id}-hint`} className={ui.hint}>
          {t.productHint}
        </span>
      </div>
      <label className="flex min-h-11 items-center gap-3 self-start sm:mt-6">
        <input name="available" type="checkbox" defaultChecked={addOn?.available ?? true} className="size-5 accent-accent" />
        <span className="font-medium">{t.available}</span>
      </label>
    </div>
  );
}

export function AddOns({ addOns }: { addOns: AddOn[] }) {
  const t = useCopy();
  const ta = t.addOns;
  const [created, create, creating] = useActionState(addAddOn, null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, start] = useTransition();
  const [deleting, setDeleting] = useState<AddOn | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <>
      {/* A created add-on empties the form: it is new once the list has one more. A refusal leaves what was typed. */}
      <form key={addOns.length} onSubmit={submitWith(create)} aria-label={ta.newHeading} className={`${ui.card} mt-5 space-y-3`}>
        <h2 className={ui.h2}>{ta.newHeading}</h2>
        <Fields />
        <button type="submit" disabled={creating} className={ui.button}>
          <AddIcon aria-hidden="true" className={ui.iconSize} />
          {ta.create}
        </button>
      </form>
      <div className="mt-2">
        <Notice result={result ?? created} />
      </div>
      {addOns.length === 0 ? (
        <p className="mt-4 text-muted">{ta.empty}</p>
      ) : (
        <ul aria-label={ta.list} className="mt-4 divide-y divide-border rounded-xl border border-border">
          {addOns.map((a) => (
            <li key={a.id} className="p-3">
              {editing === a.id ? (
                <Edit addOn={a} onDone={(r) => (setEditing(null), setResult(r))} onCancel={() => setEditing(null)} />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.name}</span>
                    <span className="tabular block text-sm text-muted">
                      {ta.summary(a.priceCents / 100, a.prints)}
                      {!a.available && ` · ${ta.unavailable}`}
                    </span>
                  </span>
                  <button type="button" aria-label={ta.edit(a.name)} onClick={() => setEditing(a.id)} className={ui.icon}>
                    <RenameIcon aria-hidden="true" className={ui.iconSize} />
                  </button>
                  <button
                    type="button"
                    aria-label={ta.delete(a.name)}
                    aria-describedby={a.prints > 0 ? `addon-in-use-${a.id}` : undefined}
                    disabled={busy || a.prints > 0}
                    onClick={() => setDeleting(a)}
                    className={`${ui.icon} text-danger`}
                  >
                    <DeleteIcon aria-hidden="true" className={ui.iconSize} />
                  </button>
                </div>
              )}
              {a.prints > 0 && editing !== a.id && (
                <p id={`addon-in-use-${a.id}`} className="sr-only">
                  {ta.inUse}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? ta.delete(deleting.name) : ""}
        text={<p>{deleting ? ta.deleteConfirm(deleting.name) : ""}</p>}
        confirm={t.common.delete}
        cancel={t.common.cancel}
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          const id = deleting!.id;
          setDeleting(null);
          start(async () => setResult(await removeAddOn(id)));
        }}
      />
    </>
  );
}

function Edit({ addOn, onDone, onCancel }: { addOn: AddOn; onDone: (r: Result) => void; onCancel: () => void }) {
  const t = useCopy();
  const [result, dispatch, pending] = useActionState(async (prev: Result | null, fd: FormData) => {
    const r = await saveAddOn(addOn.id, prev, fd);
    if (r.ok) onDone(r);
    return r;
  }, null);
  return (
    <form onSubmit={submitWith(dispatch)} aria-label={t.addOns.edit(addOn.name)} className="space-y-3">
      <Fields addOn={addOn} />
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
