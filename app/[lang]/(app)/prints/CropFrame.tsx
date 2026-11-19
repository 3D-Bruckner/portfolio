"use client";
// The crop frame: the photo's original (its orientation applied), scaled to the screen, with a frame for the cutout. Drag the frame to
// move it and a corner to resize it, by touch or mouse; or focus the frame and use the arrow keys to move it, Shift with the arrows to
// resize it. "Whole photo" resets it. Saving sends the rectangle in the original's pixels as shown (setCrop); the whole photo is null.
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent } from "react";
import { useCopy } from "@/components/CopyProvider";
import { Dialog } from "@/components/Dialog";
import { WholeIcon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { ui } from "@/components/ui";
import { cropPhoto, type Result } from "../actions";

export type Crop = { left: number; top: number; width: number; height: number };
type Corner = "nw" | "ne" | "sw" | "se";
type Drag = { mode: "move" | Corner; x: number; y: number; from: Crop };

const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];

/** Keeps a rectangle inside the photo and at least `min` big, in whole pixels. */
export function clampCrop(c: Crop, size: { width: number; height: number }, min: number): Crop {
  const width = Math.round(Math.min(Math.max(c.width, min), size.width));
  const height = Math.round(Math.min(Math.max(c.height, min), size.height));
  const left = Math.round(Math.min(Math.max(c.left, 0), size.width - width));
  const top = Math.round(Math.min(Math.max(c.top, 0), size.height - height));
  return { left, top, width, height };
}

/** The rectangle after dragging `mode` by (dx, dy) original pixels from `from`: the frame moves, or a corner moves and the opposite stays. */
export function dragCrop(mode: Drag["mode"], from: Crop, dx: number, dy: number, size: { width: number; height: number }, min: number): Crop {
  if (mode === "move") return clampCrop({ ...from, left: from.left + dx, top: from.top + dy }, size, min);
  let { left, top } = from;
  let right = from.left + from.width;
  let bottom = from.top + from.height;
  if (mode.includes("w")) left = Math.min(Math.max(0, left + dx), right - min);
  else right = Math.max(Math.min(size.width, right + dx), left + min);
  if (mode.includes("n")) top = Math.min(Math.max(0, top + dy), bottom - min);
  else bottom = Math.max(Math.min(size.height, bottom + dy), top + min);
  return clampCrop({ left, top, width: right - left, height: bottom - top }, size, min);
}

export function CropFrame({
  photoId,
  sha256,
  original,
  crop,
  onClose,
}: {
  photoId: string;
  sha256: string;
  original: { width: number; height: number };
  crop: Crop | null;
  onClose: () => void;
}) {
  const t = useCopy();
  const router = useRouter();
  const whole: Crop = { left: 0, top: 0, width: original.width, height: original.height };
  const [rect, setRect] = useState<Crop>(crop ?? whole);
  const [shownWidth, setShownWidth] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, start] = useTransition();
  const drag = useRef<Drag | null>(null);
  const help = useId();
  const min = Math.max(16, Math.round(Math.min(original.width, original.height) * 0.05));
  const scale = shownWidth > 0 ? shownWidth / original.width : 0;
  const isWhole = rect.left === 0 && rect.top === 0 && rect.width === original.width && rect.height === original.height;

  function begin(mode: Drag["mode"], e: PointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, from: rect };
  }
  function moveTo(e: PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || scale === 0) return;
    setRect(dragCrop(d.mode, d.from, (e.clientX - d.x) / scale, (e.clientY - d.y) / scale, original, min));
  }
  const end = () => {
    drag.current = null;
  };

  function onKey(e: KeyboardEvent) {
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation();
    const stepX = Math.max(1, Math.round(original.width * 0.02));
    const stepY = Math.max(1, Math.round(original.height * 0.02));
    const [dx, dy] = [dir[0]! * stepX, dir[1]! * stepY];
    setRect((r) => (e.shiftKey ? dragCrop("se", r, dx, dy, original, min) : dragCrop("move", r, dx, dy, original, min)));
  }

  function save() {
    start(async () => {
      const r = await cropPhoto(photoId, isWhole ? null : rect);
      if (r.ok) {
        router.refresh();
        onClose();
      } else setResult(r);
    });
  }

  const px = (v: number) => `${v * scale}px`;
  return (
    <Dialog open title={t.crop.title} onClose={onClose} wide>
      <p id={help} className="mt-2 text-sm text-muted">
        {t.crop.instructions}
      </p>
      <div className="mt-3 flex justify-center">
        <div className="relative inline-block touch-none select-none" onPointerMove={moveTo} onPointerUp={end} onPointerCancel={end}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the original, the app's own private route */}
          <img
            src={`/photos/${photoId}/original?v=${sha256}`}
            alt=""
            draggable={false}
            ref={(img) => {
              if (!img) return;
              // The shown size follows the screen (a turned phone, a resized window), so the frame keeps to the photo.
              const seen = new ResizeObserver(() => setShownWidth(img.complete ? img.getBoundingClientRect().width : 0));
              seen.observe(img);
              return () => seen.disconnect();
            }}
            onLoad={(e) => setShownWidth(e.currentTarget.getBoundingClientRect().width)}
            className="block max-h-[60vh] w-auto max-w-full"
          />
          {scale > 0 && (
            // The shade outside the cutout, clipped to the photo so it doesn't darken the dialog.
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
              <div
                className="absolute shadow-[0_0_0_9999px_rgb(0_0_0/0.55)]"
                style={{ left: px(rect.left), top: px(rect.top), width: px(rect.width), height: px(rect.height) }}
              />
            </div>
          )}
          {scale > 0 && (
            <div
              role="group"
              tabIndex={0}
              aria-label={t.crop.frame}
              aria-describedby={help}
              onKeyDown={onKey}
              onPointerDown={(e) => begin("move", e)}
              onPointerMove={moveTo}
              onPointerUp={end}
              className="absolute cursor-move border-2 border-white outline-offset-2 focus-visible:outline-3 focus-visible:outline-accent"
              style={{ left: px(rect.left), top: px(rect.top), width: px(rect.width), height: px(rect.height) }}
            >
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 border border-dashed border-black/60" />
              {CORNERS.map((c) => (
                <span
                  key={c}
                  aria-hidden="true"
                  title={t.crop.corner[c]}
                  onPointerDown={(e) => begin(c, e)}
                  onPointerMove={moveTo}
                  onPointerUp={end}
                  className={`absolute flex size-8 items-center justify-center ${c.includes("n") ? "-top-4" : "-bottom-4"} ${c.includes("w") ? "-left-4" : "-right-4"} ${c === "nw" || c === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`}
                >
                  <span className="size-4 rounded-sm border-2 border-black bg-white" />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <p aria-live="polite" className="mt-2 text-center text-sm text-muted">
        {t.crop.size(rect.left, rect.top, rect.width, rect.height)}
      </p>
      <div className="mt-2">
        <Notice result={result} />
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-3">
        <button type="button" disabled={busy || isWhole} onClick={() => setRect(whole)} className={ui.secondary}>
          <WholeIcon aria-hidden="true" className={ui.iconSize} />
          {t.crop.whole}
        </button>
        <button type="button" onClick={onClose} className={ui.secondary}>
          {t.common.cancel}
        </button>
        <button type="button" disabled={busy} onClick={save} className={ui.button}>
          {t.crop.save}
        </button>
      </div>
    </Dialog>
  );
}
