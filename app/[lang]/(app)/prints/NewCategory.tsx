"use client";
// A new category from inside the print form. Not a <form> (it sits in the print's own): Enter and the button create it, and its input has
// no name, so a save of the print never sends what is typed here. The input is uncontrolled, so what a slow phone's thumb typed before the
// page's script ran stays.
import { useRef, useState, useTransition, type KeyboardEvent } from "react";
import { useCopy } from "@/components/CopyProvider";
import { AddIcon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { useHydrated } from "@/components/useHydrated";
import { ui } from "@/components/ui";
import { createCategoryInForm, type Result } from "../actions";

export function NewCategory({ onCreated }: { onCreated: (category: { id: string; name: string }) => void }) {
  const t = useCopy().categories;
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const hydrated = useHydrated();

  function create() {
    const name = input.current?.value ?? "";
    if (pending || name.trim() === "") return;
    start(async () => {
      const out = await createCategoryInForm(name);
      if (!out.ok) return setResult(out);
      onCreated(out.category);
      if (input.current) input.current.value = "";
      setResult({ ok: true, message: t.created });
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault(); // Enter here makes the category; it doesn't save the print
    create();
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-0 flex-1 basis-40">
          <span className={ui.label}>{t.newLabel}</span>
          <input ref={input} onKeyDown={onKeyDown} maxLength={60} enterKeyHint="done" className={ui.input} />
        </label>
        <button type="button" onClick={create} disabled={!hydrated || pending} className={ui.secondary}>
          <AddIcon aria-hidden="true" className={ui.iconSize} />
          {t.create}
        </button>
      </div>
      <div className="mt-2">
        <Notice result={result} />
      </div>
    </div>
  );
}
