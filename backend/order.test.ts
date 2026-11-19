import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { movePrint, moveShowcase, positionBefore, setShowcase } from "./order";
import type { Outcome } from "./outcome";
import { createPrint, publishPrint, siteOrder, unpublishPrint, type Print } from "./prints";
import { seedPhoto, testRuntime, type TestRuntime } from "./testing/runtime";

let rt: TestRuntime;
beforeEach(() => {
  rt = testRuntime();
});
afterEach(() => rt.store.close());

function value<T>(o: Outcome<T>): T {
  if (!o.ok) throw new Error(`expected ok, got ${o.reason}: ${o.message}`);
  return o.value;
}

function published(title: string): Print {
  const p = value(createPrint(rt, { title, description: `About ${title}.` }));
  seedPhoto(rt, p.id);
  return value(publishPrint(rt, p.id));
}

const order = () => siteOrder(rt).map((p) => p.title);

/** A, B and C published in that order: the site shows [C, B, A]. */
function abc() {
  const a = published("A");
  const b = published("B");
  const c = published("C");
  expect(order()).toEqual(["C", "B", "A"]);
  return { a, b, c };
}

describe("positionBefore", () => {
  const list = [
    { id: "x", position: 1 },
    { id: "y", position: 2 },
  ];
  it("is the midpoint between the neighbours, one less than the first, one more than the last", () => {
    expect(positionBefore(list, "y")).toBe(1.5);
    expect(positionBefore(list, "x")).toBe(0);
    expect(positionBefore(list, null)).toBe(3);
    expect(positionBefore([], null)).toBe(1);
  });

  it("asks for renumbering (null) when the gap is below 1e-9", () => {
    expect(
      positionBefore(
        [
          { id: "x", position: 1 },
          { id: "y", position: 1 + 1e-10 },
        ],
        "y",
      ),
    ).toBeNull();
  });
});

describe("movePrint", () => {
  it("moves a print before another: [C,B,A], A before C → [A,C,B]", () => {
    const { a, c } = abc();
    expect(movePrint(rt, a.id, c.id)).toEqual({ ok: true, value: undefined });
    expect(order()).toEqual(["A", "C", "B"]);
  });

  it("moves to the end with beforeId null", () => {
    const { c } = abc();
    value(movePrint(rt, c.id, null));
    expect(order()).toEqual(["B", "A", "C"]);
  });

  it("keeps the order right when the gap gets tiny, by renumbering", () => {
    const { a, b } = abc();
    for (let i = 0; i < 80; i++) {
      value(movePrint(rt, a.id, b.id));
      expect(order()).toEqual(["C", "A", "B"]);
      value(movePrint(rt, b.id, a.id));
      expect(order()).toEqual(["C", "B", "A"]);
    }
  });

  it("refuses a draft, a showcase and an unknown print", () => {
    const { a, b } = abc();
    const draft = value(createPrint(rt, { title: "Draft", description: "" }));
    expect(movePrint(rt, draft.id, null)).toMatchObject({ ok: false, reason: "invalid" });
    expect(movePrint(rt, a.id, draft.id)).toMatchObject({ ok: false, reason: "invalid" });
    value(setShowcase(rt, b.id, true));
    expect(movePrint(rt, b.id, null)).toMatchObject({ ok: false, reason: "invalid" });
    expect(movePrint(rt, "nope", null)).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("is a site change", () => {
    const { a } = abc();
    const before = rt.siteChanges;
    value(movePrint(rt, a.id, null));
    expect(rt.siteChanges).toBe(before + 1);
  });
});

describe("showcases", () => {
  it("showcasesFirst: a showcase stands above the rest and returns to its place when unpinned", () => {
    const { b } = abc();
    value(setShowcase(rt, b.id, true));
    expect(order()).toEqual(["B", "C", "A"]);
    expect(siteOrder(rt)[0]!.showcase).toBe(true);
    value(setShowcase(rt, b.id, false));
    expect(order()).toEqual(["C", "B", "A"]);
  });

  it("new showcases go to the end of the showcases and moveShowcase reorders them", () => {
    const { a, b, c } = abc();
    value(setShowcase(rt, a.id, true));
    value(setShowcase(rt, c.id, true));
    expect(order()).toEqual(["A", "C", "B"]);
    value(moveShowcase(rt, c.id, a.id));
    expect(order()).toEqual(["C", "A", "B"]);
    value(moveShowcase(rt, c.id, null));
    expect(order()).toEqual(["A", "C", "B"]);
    expect(moveShowcase(rt, b.id, null)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("only a published print can be a showcase; unpublishing unpins it", () => {
    const { a } = abc();
    const draft = value(createPrint(rt, { title: "Draft", description: "" }));
    expect(setShowcase(rt, draft.id, true)).toMatchObject({ ok: false, reason: "invalid" });
    value(setShowcase(rt, a.id, true));
    value(unpublishPrint(rt, a.id));
    value(publishPrint(rt, a.id));
    expect(siteOrder(rt).find((p) => p.title === "A")!.showcase).toBe(false);
  });
});
