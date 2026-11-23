// One Claude answer holds the title, short title, description and categories, and each ask costs time and plan usage. So the form keeps
// its last answer, in memory only: another block takes its part without asking again. Asking for a part already taken means "another
// version" and asks anew, and so does a form that has changed since (the answer was written for what it showed then).
export type SuggestionPart = "title" | "shortTitle" | "description" | "categories";

type Got<T> = { ok: true; value: T } | { ok: false; error: string };

export function suggestionCache<T>() {
  let last: { key: string; value: T; used: Set<SuggestionPart> } | null = null;
  let asking: { key: string; answer: Promise<Got<T>> } | null = null;

  return {
    /** The answer for the form as `key` describes it: the kept one if these parts are still unused, else `load`'s (one at a time per key). */
    async ask(key: string, parts: readonly SuggestionPart[], load: () => Promise<Got<T>>): Promise<Got<T>> {
      if (last?.key === key && !parts.some((p) => last!.used.has(p))) return { ok: true, value: last.value };
      if (asking?.key === key) return asking.answer;
      const answer = load();
      const mine = { key, answer };
      asking = mine;
      try {
        const got = await answer;
        if (got.ok) last = { key, value: got.value, used: new Set() };
        return got;
      } finally {
        if (asking === mine) asking = null;
      }
    },
    /** `parts` went into the form, which was `before` and is now `after`. If it had changed since the answer, the answer is dropped. */
    applied(parts: readonly SuggestionPart[], before: string, after: string) {
      if (last?.key !== before) {
        last = null;
        return;
      }
      for (const p of parts) last.used.add(p);
      last.key = after;
    },
  };
}
