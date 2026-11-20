"use client";
// "Paste a MakerWorld link": the model's words, numbers and pictures become a draft (importMakerWorld, backend/makerworld.ts), which opens
// at once. A model imported before opens its print instead.
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { useCopy } from "@/components/CopyProvider";
import { LinkIcon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { useHydrated } from "@/components/useHydrated";
import { ui } from "@/components/ui";
import { importMakerWorld } from "./actions";

export function FromMakerWorld() {
  const t = useCopy().list;
  const router = useRouter();
  const id = useId();
  const [url, setUrl] = useState("");
  const [busy, start] = useTransition();
  const hydrated = useHydrated();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!url.trim()) return;
        setProblem(null);
        start(async () => {
          const got = await importMakerWorld(url.trim());
          if (!got.ok) setProblem(got.error);
          // A model imported before still opens: its print.
          if (got.id) router.push(`/prints/${got.id}`);
        });
      }}
    >
      <label htmlFor={id} className={ui.label}>
        {t.makerWorld}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id={id}
          type="url"
          inputMode="url"
          autoComplete="off"
          required
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          placeholder={t.makerWorldPlaceholder}
          aria-describedby={`${id}-hint`}
          disabled={busy}
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink"
        />
        <button type="submit" disabled={busy || !hydrated || !url.trim()} className={`${ui.button} shrink-0`}>
          <LinkIcon aria-hidden="true" className={ui.iconSize} />
          {busy ? t.makerWorldBusy : t.makerWorldGo}
        </button>
      </div>
      <span id={`${id}-hint`} className={ui.hint}>
        {t.makerWorldHint}
      </span>
      <Notice result={problem ? { ok: false, error: problem } : null} />
    </form>
  );
}
