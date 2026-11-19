// The portfolio's order: newest first by default, reorderable, with pinned showcases above the rest in their own order. Positions are
// REALs: a move writes only the moved print, at the midpoint between its new neighbours; when that gap gets below 1e-9, the list is
// renumbered 1..n first. A print's position stays while it is pinned, so unpinning puts it back where it was.
import type { PrintRow } from "./db";
import { done, invalid, notFound, type Outcome } from "./outcome";
import { mutation, type Runtime } from "./runtime";

export type Placed = { id: string; position: number };

const MIN_GAP = 1e-9;

/**
 * Where a print goes in `others` (sorted ascending, without the print itself) to stand before `beforeId`, or at the end for null: the
 * midpoint between its new neighbours, one less than the first, one more than the last. null when the gap is too small: renumber first.
 */
export function positionBefore(others: Placed[], beforeId: string | null): number | null {
  const at = beforeId === null ? others.length : others.findIndex((p) => p.id === beforeId);
  const prev = others[at - 1]?.position;
  const next = others[at]?.position;
  if (prev === undefined && next === undefined) return 1;
  if (prev === undefined) return next! - 1;
  if (next === undefined) return prev + 1;
  const mid = (prev + next) / 2;
  return mid - prev < MIN_GAP || next - mid < MIN_GAP ? null : mid;
}

type Ordered = Pick<PrintRow, "id" | "position" | "showcase_position">;

/** Published prints as the site shows them: the showcases by their own order, then the rest by position. */
export function siteSort<T extends Ordered>(rows: T[]): T[] {
  const showcases = rows.filter((r) => r.showcase_position !== null).sort((a, b) => a.showcase_position! - b.showcase_position!);
  const rest = rows.filter((r) => r.showcase_position === null).sort((a, b) => a.position! - b.position!);
  return [...showcases, ...rest];
}

type List = "portfolio" | "showcases";
const KEY = { portfolio: "position", showcases: "showcase_position" } as const;
const at = (key: "position" | "showcase_position", value: number) => (key === "position" ? { position: value } : { showcase_position: value });

function members(rt: Runtime, list: List): PrintRow[] {
  const key = KEY[list];
  const published = rt.store.prints("published");
  const inList = list === "portfolio" ? published.filter((r) => r.showcase_position === null) : published.filter((r) => r.showcase_position !== null);
  return inList.sort((a, b) => a[key]! - b[key]!);
}

/** Positions 1..n in the current order: for the portfolio every published print's (showcases keep their place to return to). */
function renumber(rt: Runtime, list: List) {
  const key = KEY[list];
  const rows = list === "portfolio" ? rt.store.prints("published").sort((a, b) => a.position! - b.position!) : members(rt, list);
  rows.forEach((r, i) => rt.store.updatePrint(r.id, at(key, i + 1)));
}

function move(rt: Runtime, list: List, id: string, beforeId: string | null): Outcome<void> {
  const key = KEY[list];
  return mutation(rt, (siteChange) => {
    const row = rt.store.print(id);
    if (!row) return notFound(`No print ${id}.`);
    const rows = members(rt, list);
    const refuse = (title: string) =>
      invalid(
        list === "portfolio"
          ? `"${title}" isn't in the portfolio order: only a published print that isn't a showcase is (showcases move among themselves).`
          : `"${title}" isn't a showcase.`,
      );
    if (!rows.some((r) => r.id === id)) return refuse(row.title);
    if (beforeId !== null && !rows.some((r) => r.id === beforeId)) {
      const before = rt.store.print(beforeId);
      return before ? refuse(before.title) : notFound(`No print ${beforeId}.`);
    }
    if (beforeId === id) return done;
    const others = (rs: PrintRow[]) => rs.filter((r) => r.id !== id).map((r) => ({ id: r.id, position: r[key]! }));
    let position = positionBefore(others(rows), beforeId);
    if (position === null) {
      renumber(rt, list);
      position = positionBefore(others(members(rt, list)), beforeId)!;
    }
    rt.store.updatePrint(id, at(key, position));
    siteChange();
    return done;
  });
}

/** Moves a published print that isn't a showcase before `beforeId` in the portfolio order; null: to the end. */
export const movePrint = (rt: Runtime, id: string, beforeId: string | null): Outcome<void> => move(rt, "portfolio", id, beforeId);

/** Moves a showcase before another; null: to the end of the showcases. */
export const moveShowcase = (rt: Runtime, id: string, beforeId: string | null): Outcome<void> => move(rt, "showcases", id, beforeId);

/** Pins a published print as a showcase (at the end of the showcases) or unpins it, back to its place in the portfolio order. */
export function setShowcase(rt: Runtime, id: string, on: boolean): Outcome<void> {
  return mutation(rt, (siteChange) => {
    const row = rt.store.print(id);
    if (!row) return notFound(`No print ${id}.`);
    if (row.status !== "published") return invalid(`"${row.title}" is a draft: only a published print can be a showcase.`);
    if ((row.showcase_position !== null) === on) return done;
    const last = members(rt, "showcases").at(-1)?.showcase_position ?? 0;
    rt.store.updatePrint(id, { showcase_position: on ? last + 1 : null });
    siteChange();
    return done;
  });
}
