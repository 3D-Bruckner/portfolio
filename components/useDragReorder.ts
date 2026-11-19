"use client";
// Drag to reorder by touch or mouse (pointer events, one code path for both): a handle starts the drag, the item under the pointer
// makes room, and letting go reports the new order; when onDrop answers that it wasn't saved, the list goes back. The keyboard has buttons for the same moves; the handle is for pointers only.
import { useRef, useState, type PointerEvent } from "react";

export function useDragReorder(keys: string[], onDrop: (order: string[], moved: string) => Promise<boolean>) {
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const start = useRef<string[]>([]);
  // A dropped order stays shown until the server's order (keys) changes, so the list doesn't jump back while the move is saved.
  const [seen, setSeen] = useState(keys.join());
  if (seen !== keys.join()) {
    setSeen(keys.join());
    setOrder(null);
  }
  const shown = order ?? keys;

  function handleProps(key: string) {
    return {
      onPointerDown(e: PointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = shown;
        setOrder(shown);
        setDragging(key);
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        if (dragging !== key) return;
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-drag-key]")?.dataset.dragKey;
        if (!over || over === key) return;
        setOrder((o) => {
          const cur = o ?? shown;
          const list = [...cur].filter((k) => k !== key);
          list.splice(list.indexOf(over) + (cur.indexOf(over) > cur.indexOf(key) ? 1 : 0), 0, key);
          return list;
        });
      },
      onPointerUp() {
        if (dragging !== key) return;
        const final = order ?? keys;
        setDragging(null);
        if (final.some((k, i) => start.current[i] !== k)) void onDrop(final, key).then((saved) => saved || setOrder(null));
        else setOrder(null);
      },
      onPointerCancel() {
        setDragging(null);
        setOrder(null);
      },
      style: { touchAction: "none" as const },
    };
  }

  return { order: shown, dragging, handleProps };
}
