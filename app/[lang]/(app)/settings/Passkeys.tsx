"use client";
// The person's passkeys through Better Auth's passkey client: add one (the device asks for Face ID, a fingerprint or its PIN), list
// them, remove one after a question.
import { useEffect, useId, useState } from "react";
import { authClient } from "@/app/_lib/auth-client";
import { useCopy, useLocale } from "@/components/CopyProvider";
import { ConfirmDialog } from "@/components/Dialog";
import { formatWhen } from "@/components/format";
import { AddIcon, DeleteIcon, PasskeyIcon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { ui } from "@/components/ui";
import type { Result } from "../actions";

type Passkey = { id: string; name?: string | null; createdAt: Date | string };

export function Passkeys() {
  const t = useCopy();
  const lang = useLocale();
  const tp = t.settings.passkeys;
  const headingId = useId();
  // null while loading; "failed" when the list couldn't be read (shown as a problem, not as "no passkeys").
  const [keys, setKeys] = useState<Passkey[] | "failed" | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Passkey | null>(null);

  // Bumped after a change, so the list is asked for again.
  const [version, setVersion] = useState(0);
  const load = () => setVersion((v) => v + 1);

  useEffect(() => {
    let live = true;
    authClient.passkey.listUserPasskeys().then(
      ({ data, error }) => {
        if (live) setKeys(error ? "failed" : ((data as Passkey[] | null) ?? []));
      },
      () => {
        if (live) setKeys("failed");
      },
    );
    return () => {
      live = false;
    };
  }, [version]);

  async function add() {
    setBusy(true);
    try {
      const r = await authClient.passkey.addPasskey();
      setResult(!r || r.error ? { ok: false, error: tp.failed } : { ok: true, message: tp.added });
    } catch {
      setResult({ ok: false, error: tp.failed });
    } finally {
      setBusy(false);
      load();
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const { error } = await authClient.passkey.deletePasskey({ id });
      setResult(error ? { ok: false, error: t.common.failed } : { ok: true, message: tp.removed });
    } catch {
      setResult({ ok: false, error: t.common.failed });
    } finally {
      setBusy(false);
      load();
    }
  }

  return (
    <section aria-labelledby={headingId} className="mt-10">
      <h2 id={headingId} className={`${ui.h2} flex items-center gap-2`}>
        <PasskeyIcon aria-hidden="true" className={ui.iconSize} />
        {tp.heading}
      </h2>
      <p className="mt-1 text-sm text-muted">{tp.intro}</p>
      <button type="button" disabled={busy} onClick={add} className={`${ui.button} mt-4`}>
        <AddIcon aria-hidden="true" className={ui.iconSize} />
        {tp.add}
      </button>
      <div className="mt-2">
        <Notice result={result} />
      </div>
      <h3 className="mt-6 font-semibold">{tp.list}</h3>
      {keys === "failed" && (
        <div className="mt-2">
          <Notice result={{ ok: false, error: tp.listFailed }} />
        </div>
      )}
      {Array.isArray(keys) && keys.length === 0 && <p className="mt-2 text-muted">{tp.none}</p>}
      {Array.isArray(keys) && keys.length > 0 && (
        <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
          {keys.map((k) => {
            const name = k.name || tp.unnamed;
            return (
              <li key={k.id} className="flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{name}</span>
                  <span className="block text-sm text-muted">{tp.createdAt(formatWhen(lang, k.createdAt))}</span>
                </span>
                <button type="button" aria-label={tp.remove(name)} disabled={busy} onClick={() => setRemoving(k)} className={ui.danger}>
                  <DeleteIcon aria-hidden="true" className={ui.iconSize} />
                  <span className="sr-only sm:not-sr-only">{tp.removeShort}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        title={removing ? tp.remove(removing.name || tp.unnamed) : ""}
        text={<p>{removing ? tp.removeConfirm(removing.name || tp.unnamed) : ""}</p>}
        confirm={tp.removeShort}
        cancel={t.common.cancel}
        busy={busy}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          const id = removing!.id;
          setRemoving(null);
          void remove(id);
        }}
      />
    </section>
  );
}
