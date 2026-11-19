"use client";
// Tabs (the ARIA tab pattern, conventions: code/accessibility): a tablist whose arrows, Home and End move between tabs and stop there,
// the open tab marked by aria-selected, in bold and with a thicker underline, not by colour alone. The panels come rendered from the
// server; the open one is kept in the URL's ?tab=, so a reload or the back button returns to it.
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export function Tabs({ label, tabs, initial }: { label: string; tabs: { id: string; label: string; panel: ReactNode }[]; initial: string }) {
  const [open, setOpen] = useState(tabs.some((t) => t.id === initial) ? initial : tabs[0]!.id);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function choose(id: string, focus = false) {
    setOpen(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
    if (focus) refs.current[tabs.findIndex((t) => t.id === id)]?.focus();
  }

  function onKey(e: KeyboardEvent, i: number) {
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    choose(tabs[(to + tabs.length) % tabs.length]!.id, true);
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex border-b border-border">
        {tabs.map((t, i) => {
          const selected = t.id === open;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={`-mb-px min-h-11 flex-1 px-3 ${selected ? "border-b-4 border-accent font-semibold text-ink" : "border-b-2 border-transparent text-muted"}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={t.id !== open} className="pt-4">
          {t.panel}
        </div>
      ))}
    </div>
  );
}
