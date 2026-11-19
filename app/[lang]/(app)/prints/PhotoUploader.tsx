"use client";
// Photos from the camera roll, one request per photo, one after the other, each with its progress: a phone on mobile data that drops one
// upload loses that photo only, which says so and can be sent again. accept names JPEG, PNG and WebP, so an iPhone's picker hands over a
// JPEG instead of HEIC. A connection that goes dead without failing (mobile data in a dead spot) would leave a photo "sending" for
// ever: an upload that hasn't moved for a minute is stopped and offered again, and no request lasts longer than a quarter of an hour.
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { useCopy } from "@/components/CopyProvider";
import { AddPhotoIcon, BusyIcon, CloseIcon, ProblemIcon, RetryIcon } from "@/components/icons";
import { ui } from "@/components/ui";

type Item = { key: number; file: File; state: "waiting" | "sending" | "processing" | "failed"; percent: number; error?: string };

const ACCEPT = "image/jpeg,image/png,image/webp";
/** How long an upload may go without moving before it is stopped. */
const STALL_MS = 60_000;
/** The longest a request may take at all: a 40 MB photo at 0.5 Mbit/s, with time left over. */
const TIMEOUT_MS = 15 * 60_000;

/**
 * Sends one photo; resolves to null when it was stored, "network" or "stalled" when the connection failed or stopped moving, else what
 * the route said went wrong (its own words, or none).
 */
function send(printId: string, file: File, onProgress: (percent: number) => void, onSent: () => void): Promise<string | null | undefined> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const moved = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        xhr.abort();
        resolve("stalled");
      }, STALL_MS);
    };
    const settle = (outcome: string | null | undefined) => {
      clearTimeout(watchdog);
      resolve(outcome);
    };
    xhr.open("POST", `/api/prints/${encodeURIComponent(printId)}/photos`);
    xhr.timeout = TIMEOUT_MS;
    xhr.upload.onprogress = (e) => {
      moved();
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.upload.onload = () => {
      moved();
      onSent();
    };
    xhr.onload = () => {
      clearTimeout(watchdog);
      if (xhr.status === 201) return resolve(null);
      try {
        const body = JSON.parse(xhr.responseText) as { error?: unknown };
        resolve(typeof body.error === "string" ? body.error : undefined);
      } catch {
        resolve(undefined);
      }
    };
    xhr.onerror = () => settle("network");
    xhr.ontimeout = () => settle("network");
    const fd = new FormData();
    fd.append("photo", file);
    xhr.send(fd);
    moved();
  });
}

export function PhotoUploader({ printId }: { printId: string }) {
  const t = useCopy();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const nextKey = useRef(0);
  // The photos waiting their turn and whether one is under way: the queue is worked through one at a time (pump), outside rendering.
  const waiting = useRef<{ key: number; file: File }[]>([]);
  const running = useRef(false);
  const inputId = useId();
  const update = (key: number, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function pump() {
    if (running.current) return;
    running.current = true;
    try {
      for (let next = waiting.current.shift(); next; next = waiting.current.shift()) {
        const { key, file } = next;
        update(key, { state: "sending", percent: 0, error: undefined });
        const error = await send(
          printId,
          file,
          (percent) => update(key, { percent }),
          () => update(key, { state: "processing" }),
        );
        if (error === null) {
          setItems((list) => list.filter((i) => i.key !== key));
          router.refresh();
        } else
          update(key, {
            state: "failed",
            error: error === "network" ? t.photoGrid.network : error === "stalled" ? t.photoGrid.stalled : (error ?? t.common.failed),
          });
      }
    } finally {
      running.current = false;
    }
  }

  function enqueue(entries: { key: number; file: File }[]) {
    waiting.current.push(...entries);
    void pump();
  }

  return (
    <div className="mt-3">
      <label htmlFor={inputId} className={`${ui.button} w-full cursor-pointer has-[+input:focus-visible]:outline-3 has-[+input:focus-visible]:outline-accent`}>
        <AddPhotoIcon aria-hidden="true" className={ui.iconSize} />
        {t.photoGrid.add}
      </label>
      <input
        id={inputId}
        type="file"
        multiple
        accept={ACCEPT}
        aria-describedby={`${inputId}-hint`}
        className="peer sr-only"
        onChange={(e) => {
          const added = [...(e.currentTarget.files ?? [])].map((file) => ({ key: nextKey.current++, file }));
          e.currentTarget.value = "";
          setItems((list) => [...list, ...added.map((a) => ({ ...a, state: "waiting" as const, percent: 0 }))]);
          enqueue(added);
        }}
      />
      <span id={`${inputId}-hint`} className={ui.hint}>
        {t.photoGrid.addHint}
      </span>
      {items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map((i) =>
            i.state === "failed" ? (
              <li key={i.key} role="alert" className={`${ui.problem} flex-wrap`}>
                <ProblemIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 flex-1 break-words">{t.photoGrid.failed(i.file.name, i.error ?? "")}</span>
                <span className="flex w-full gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      update(i.key, { state: "waiting" });
                      enqueue([{ key: i.key, file: i.file }]);
                    }}
                    className={ui.secondary}
                  >
                    <RetryIcon aria-hidden="true" className={ui.iconSize} />
                    {t.photoGrid.retry(i.file.name)}
                  </button>
                  <button
                    type="button"
                    aria-label={t.photoGrid.dismiss(i.file.name)}
                    onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))}
                    className={ui.icon}
                  >
                    <CloseIcon aria-hidden="true" className={ui.iconSize} />
                  </button>
                </span>
              </li>
            ) : (
              <li key={i.key} className="text-sm">
                <span className="flex items-center gap-2">
                  <BusyIcon aria-hidden="true" className={`${ui.iconSize} ${i.state === "waiting" ? "" : "motion-safe:animate-spin"}`} />
                  <span className="min-w-0 flex-1 truncate">
                    {i.state === "processing" ? t.photoGrid.processing(i.file.name) : t.photoGrid.uploading(i.file.name, i.percent)}
                  </span>
                </span>
                <progress
                  value={i.state === "processing" ? undefined : i.percent}
                  max={100}
                  aria-label={i.file.name}
                  className="mt-1 h-2 w-full accent-accent"
                />
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
