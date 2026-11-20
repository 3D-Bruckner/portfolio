"use client";
// The print's photos as the site gets them (each one's cutout), in their order: drag one by its handle, or move it with "forward" and
// "back"; the star makes it the cover; "Choose cutout" opens the crop frame over the original; delete asks first, and for a published
// print's last photo warns that the print leaves the site.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useCopy } from "@/components/CopyProvider";
import { ConfirmDialog } from "@/components/Dialog";
import { CoverIcon, CropIcon, DeleteIcon, DragIcon, EarlierIcon, LaterIcon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { useDragReorder } from "@/components/useDragReorder";
import { ui } from "@/components/ui";
import { makeCover, orderPhotos, removePhoto, type Result } from "../actions";
import { CropFrame, type Crop } from "./CropFrame";

export type GridPhoto = { id: string; sha256: string; original: { width: number; height: number } | null; crop: Crop | null };

/** How many photos show before "show all". */
const FIRST_FEW = 6;

export function PhotoGrid({ printId, published, coverId, photos }: { printId: string; published: boolean; coverId: string | null; photos: GridPhoto[] }) {
  const t = useCopy();
  const tg = t.photoGrid;
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [busy, start] = useTransition();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [cropping, setCropping] = useState<string | null>(null);
  // A print with many photos shows the first few until asked, so its details aren't screens away.
  const [all, setAll] = useState(photos.length <= FIRST_FEW);
  // New photos are added at the end: once there are more than before, all of them show, so the new ones can be seen.
  const [seen, setSeen] = useState(photos.length);
  if (photos.length !== seen) {
    setSeen(photos.length);
    if (photos.length > seen) setAll(true);
  }
  const byId = new Map(photos.map((p) => [p.id, p]));

  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      setResult(r.ok ? null : r);
    });

  const drag = useDragReorder(
    photos.map((p) => p.id),
    async (order) => {
      const r = await orderPhotos(printId, order);
      setResult(r.ok ? null : r);
      if (!r.ok) router.refresh();
      return r.ok;
    },
  );
  const order = drag.order;

  function move(id: string, by: -1 | 1) {
    const list = [...order];
    const at = list.indexOf(id);
    const to = at + by;
    if (to < 0 || to >= list.length) return;
    [list[at], list[to]] = [list[to]!, list[at]!];
    run(() => orderPhotos(printId, list));
  }

  const last = published && photos.length === 1;
  const croppingPhoto = cropping ? byId.get(cropping) : undefined;

  return (
    <div className="mt-4">
      <Notice result={result} />
      {photos.length === 0 ? (
        <p className="mt-2 text-muted">{tg.none}</p>
      ) : (
        <ul aria-label={tg.label} className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {order.map((id, i) => {
            const p = byId.get(id);
            if (!p || (!all && i >= FIRST_FEW)) return null;
            const n = i + 1;
            const cover = id === coverId;
            return (
              <li
                key={id}
                data-drag-key={id}
                className={`relative rounded-xl border bg-surface p-2 ${cover ? "border-2 border-accent" : "border-border"} ${drag.dragging === id ? "opacity-60 ring-2 ring-accent" : ""}`}
              >
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the app's own photo route, private and per-session */}
                  <img
                    src={`/photos/${id}?v=${p.sha256}`}
                    alt={tg.photo(n)}
                    loading="lazy"
                    className="aspect-square w-full rounded-lg bg-paper object-contain"
                  />
                  <span
                    aria-hidden="true"
                    title={tg.drag}
                    {...drag.handleProps(id)}
                    className="absolute top-1 right-1 flex size-10 cursor-grab items-center justify-center rounded-lg bg-paper/90 text-ink"
                  >
                    <DragIcon className="size-5" />
                  </span>
                  {cover && (
                    <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-on-accent">
                      <CoverIcon aria-hidden="true" className="size-3.5 fill-current" />
                      {tg.cover}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex justify-between gap-1">
                  <button
                    type="button"
                    aria-label={cover ? tg.isCover(n) : tg.makeCover(n)}
                    aria-pressed={cover}
                    disabled={busy}
                    onClick={() => !cover && run(() => makeCover(printId, id))}
                    className={`${ui.icon} size-9`}
                  >
                    <CoverIcon aria-hidden="true" className={`${ui.iconSize} ${cover ? "fill-current" : ""}`} />
                  </button>
                  <button type="button" aria-label={tg.earlier(n)} disabled={busy || i === 0} onClick={() => move(id, -1)} className={`${ui.icon} size-9`}>
                    <EarlierIcon aria-hidden="true" className={ui.iconSize} />
                  </button>
                  <button
                    type="button"
                    aria-label={tg.later(n)}
                    disabled={busy || i === order.length - 1}
                    onClick={() => move(id, 1)}
                    className={`${ui.icon} size-9`}
                  >
                    <LaterIcon aria-hidden="true" className={ui.iconSize} />
                  </button>
                  <button type="button" aria-label={tg.delete(n)} disabled={busy} onClick={() => setDeleting(id)} className={`${ui.icon} size-9 text-danger`}>
                    <DeleteIcon aria-hidden="true" className={ui.iconSize} />
                  </button>
                </div>
                {p.original && (
                  <button
                    type="button"
                    aria-label={tg.crop(n)}
                    disabled={busy}
                    onClick={() => setCropping(id)}
                    className={`${ui.secondary} mt-2 min-h-9 w-full px-2 text-sm`}
                  >
                    <CropIcon aria-hidden="true" className={ui.iconSize} />
                    {tg.cropShort}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!all && (
        <button type="button" onClick={() => setAll(true)} className={`${ui.secondary} mt-3 w-full`}>
          {tg.showAll(photos.length)}
        </button>
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={tg.deleteTitle}
        text={<p className={last ? "font-medium" : undefined}>{last ? tg.deleteLast : tg.deleteConfirm}</p>}
        confirm={t.common.delete}
        cancel={t.common.cancel}
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          const id = deleting!;
          setDeleting(null);
          run(() => removePhoto(id));
        }}
      />
      {croppingPhoto?.original && (
        <CropFrame
          photoId={croppingPhoto.id}
          sha256={croppingPhoto.sha256}
          original={croppingPhoto.original}
          crop={croppingPhoto.crop}
          onClose={() => setCropping(null)}
        />
      )}
    </div>
  );
}
