"use client";
// One of the site's two lists (the showcases, the rest of the portfolio): drag a print by its handle, or move it with its up and down
// buttons; pin it as a showcase or unpin it. Each change is saved at once and the site build follows after a quiet minute.
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { useCopy } from "@/components/CopyProvider";
import { DownIcon, DragIcon, PhotoIcon, ShowcaseIcon, UnpinIcon, UpIcon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { useDragReorder } from "@/components/useDragReorder";
import { useHydrated } from "@/components/useHydrated";
import { ui } from "@/components/ui";
import { moveAmongShowcases, moveInPortfolio, pin, type Result } from "../actions";

type Row = { id: string; title: string; showcase: boolean; cover: string | null };

export function OrderList({ kind, prints }: { kind: "showcases" | "portfolio"; prints: Row[] }) {
  const copy = useCopy();
  const t = copy.order;
  const router = useRouter();
  const headingId = useId();
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  // Until the page is hydrated a button would do nothing: it stays disabled (and a test's click waits for it).
  const hydrated = useHydrated();
  const busy = pending || !hydrated;
  const byId = new Map(prints.map((p) => [p.id, p]));
  const move = kind === "showcases" ? moveAmongShowcases : moveInPortfolio;

  async function save(fn: () => Promise<Result>): Promise<boolean> {
    const r = await fn();
    setResult(r);
    if (!r.ok) router.refresh();
    return r.ok;
  }
  const run = (fn: () => Promise<Result>) => start(async () => void (await save(fn)));

  /** Saves `id` standing where it is in `order`: before the print after it, or at the end. */
  const placed = (order: string[], id: string) => save(() => move(id, order[order.indexOf(id) + 1] ?? null));
  const drag = useDragReorder(
    prints.map((p) => p.id),
    placed,
  );
  const order = drag.order;

  function step(id: string, by: -1 | 1) {
    const list = [...order];
    const at = list.indexOf(id);
    list.splice(at, 1);
    list.splice(at + by, 0, id);
    start(async () => void (await placed(list, id)));
  }

  return (
    <section aria-labelledby={headingId} className="mt-8">
      <h2 id={headingId} className={`${ui.h2} flex items-center gap-2`}>
        {kind === "showcases" && <ShowcaseIcon aria-hidden="true" className={ui.iconSize} />}
        {kind === "showcases" ? t.showcases : t.portfolio}
      </h2>
      <div className="mt-2">
        <Notice result={result} />
      </div>
      {prints.length === 0 ? (
        <p className="mt-2 text-muted">{kind === "showcases" ? t.emptyShowcases : t.emptyPortfolio}</p>
      ) : (
        <ol aria-labelledby={headingId} className="mt-2 divide-y divide-border rounded-xl border border-border">
          {order.map((id, i) => {
            const p = byId.get(id);
            if (!p) return null;
            return (
              <li key={id} data-drag-key={id} className={`flex items-center gap-2 p-2 ${drag.dragging === id ? "bg-surface opacity-70" : ""}`}>
                <span
                  aria-hidden="true"
                  title={copy.photoGrid.drag}
                  {...drag.handleProps(id)}
                  className="flex size-10 shrink-0 cursor-grab items-center justify-center text-muted"
                >
                  <DragIcon className="size-5" />
                </span>
                {p.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the app's own photo route, private and per-session
                  <img src={p.cover} alt="" width={48} height={48} loading="lazy" className="size-12 shrink-0 rounded-md bg-surface object-cover" />
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-surface text-muted">
                    <PhotoIcon aria-hidden="true" className={ui.iconSize} />
                  </span>
                )}
                <span className="line-clamp-2 min-w-0 flex-1 font-medium break-words">{p.title}</span>
                <span className="flex shrink-0 gap-1">
                  <button type="button" aria-label={t.up(p.title)} disabled={busy || i === 0} onClick={() => step(id, -1)} className={`${ui.icon} size-9`}>
                    <UpIcon aria-hidden="true" className={ui.iconSize} />
                  </button>
                  <button
                    type="button"
                    aria-label={t.down(p.title)}
                    disabled={busy || i === order.length - 1}
                    onClick={() => step(id, 1)}
                    className={`${ui.icon} size-9`}
                  >
                    <DownIcon aria-hidden="true" className={ui.iconSize} />
                  </button>
                  <button
                    type="button"
                    aria-label={p.showcase ? t.unpinLabel(p.title) : t.pinLabel(p.title)}
                    disabled={busy}
                    onClick={() => run(() => pin(id, !p.showcase))}
                    className={`${ui.secondary} min-h-10 px-2 text-sm`}
                  >
                    {p.showcase ? <UnpinIcon aria-hidden="true" className={ui.iconSize} /> : <ShowcaseIcon aria-hidden="true" className={ui.iconSize} />}
                    <span className="sr-only sm:not-sr-only">{p.showcase ? t.unpin : t.pin}</span>
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
