"use client";
// "Start with photos": right after a print comes off the printer, the camera roll first. Picking photos makes a draft named by the
// moment (startWithPhotos) and opens it, where its PhotoUploader sends the photos (handoff.ts); the name and the rest come later, by
// hand or through Claude.
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { useCopy } from "@/components/CopyProvider";
import { CameraIcon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { ui } from "@/components/ui";
import { startWithPhotos } from "./actions";
import { handOver } from "./prints/handoff";

export function StartWithPhotos() {
  const t = useCopy().list;
  const router = useRouter();
  const inputId = useId();
  const [busy, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div>
      <label
        htmlFor={inputId}
        className={`${ui.secondary} w-full cursor-pointer has-[+input:focus-visible]:outline-3 has-[+input:focus-visible]:outline-accent`}
      >
        <CameraIcon aria-hidden="true" className={ui.iconSize} />
        {busy ? t.starting : t.startWithPhotos}
      </label>
      <input
        id={inputId}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        aria-describedby={`${inputId}-hint`}
        className="sr-only"
        onChange={(e) => {
          const files = [...(e.currentTarget.files ?? [])];
          e.currentTarget.value = "";
          if (files.length === 0) return;
          setProblem(null);
          start(async () => {
            const made = await startWithPhotos();
            if (!made.ok) return setProblem(made.error);
            handOver(made.id, files);
            router.push(`/prints/${made.id}`);
          });
        }}
      />
      <span id={`${inputId}-hint`} className={ui.hint}>
        {t.startHint}
      </span>
      <Notice result={problem ? { ok: false, error: problem } : null} />
    </div>
  );
}
