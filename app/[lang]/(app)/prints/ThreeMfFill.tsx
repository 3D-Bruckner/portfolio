"use client";
// "Fill in from a 3MF file": reads a Bambu Studio 3MF on the phone itself (backend/threemf.ts, a few kilobytes of a file that may be
// 200 MB) and hands what it found to the form, which fills its fields; nothing is uploaded and nothing is saved until the form is.
import { useRef, useState } from "react";
import { readThreeMf, type ThreeMfReading } from "@/backend/client";
import { useCopy } from "@/components/CopyProvider";
import { FileIcon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { ui } from "@/components/ui";

export type FillPart = "printTimeMinutes" | "weightGrams" | "colors" | "price" | "title" | "description" | "sources";

type Props = {
  /** Fills the form from the reading and says which parts it filled. */
  onRead: (reading: ThreeMfReading) => FillPart[];
};

export function ThreeMfFill({ onRead }: Props) {
  const t = useCopy().print.threeMf;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; error: string } | null>(null);

  async function read(file: File) {
    setBusy(true);
    setResult(null);
    try {
      const got = await readThreeMf({ size: file.size, read: async (o, l) => new Uint8Array(await file.slice(o, o + l).arrayBuffer()) });
      if (!got.ok) return setResult({ ok: false, error: got.reason === "not_3mf" ? t.notThreeMf : t.unreadable });
      const parts = onRead(got.value);
      if (parts.length === 0) return setResult({ ok: false, error: got.value.sliced ? t.nothing : t.notSliced });
      const filled = t.filled(parts.map((p) => t.parts[p]));
      setResult({ ok: true, message: got.value.sliced ? filled : `${filled} ${t.notSliced}` });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-border p-3">
      <input
        ref={input}
        id="threemf-file"
        type="file"
        accept=".3mf,model/3mf,application/vnd.ms-package.3dmanufacturing-3dmodel+xml"
        className="sr-only"
        aria-describedby="threemf-hint"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) void read(file);
        }}
      />
      <label htmlFor="threemf-file" className={`${ui.secondary} w-full cursor-pointer justify-center`} aria-disabled={busy}>
        <FileIcon aria-hidden="true" className={ui.iconSize} />
        {busy ? t.reading : t.button}
      </label>
      <span id="threemf-hint" className={ui.hint}>
        {t.hint}
      </span>
      <Notice result={result} />
    </div>
  );
}
