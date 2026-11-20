"use server";
// The web app's server actions: each checks who is asking, calls the domain through @/backend and answers in the page's language
// (proxy.ts's header). A refusal comes back as words for the person, never the domain's English message; the page is re-rendered after
// a change (refresh), so what it shows is what is stored.
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createApiToken, revokeApiToken } from "next-app-kit/tokens";
import { actionPerson } from "@/app/_lib/signin";
import { runtime } from "@/app/_lib/runtime";
import {
  createCategory,
  createPrint,
  deleteCategory,
  deletePhoto,
  deletePrint,
  importFromLink,
  printOfModel,
  suggestForPrint,
  type EnhanceInput,
  type Suggestion,
  movePrint,
  moveShowcase,
  publishPrint,
  renameCategory,
  reorderPhotos,
  setCover,
  setCrop,
  setShowcase,
  unpublishPrint,
  updatePrint,
  type Crop,
  type Outcome,
} from "@/backend";
import { copyFor, LANG_HEADER, type Copy } from "@/components/copy";
import type { PrintFieldName } from "./prints/fieldorder";
import { formValues } from "./prints/printform";

export type Result = { ok: true; message?: string; token?: string } | { ok: false; error: string };

async function words(): Promise<Copy> {
  return copyFor((await headers()).get(LANG_HEADER) ?? "");
}

/** Runs `fn` for a signed-in person; a domain refusal becomes `problem(outcome)`, success `done`, and the page is re-rendered. */
async function act<T>(
  fn: () => Outcome<T> | Promise<Outcome<T>>,
  problem: (o: Exclude<Outcome<T>, { ok: true }>, t: Copy) => string,
  done?: (t: Copy) => string,
): Promise<Result> {
  const t = await words();
  if (!(await actionPerson())) return { ok: false, error: t.common.signedOut };
  const out = await fn();
  if (!out.ok) return { ok: false, error: problem(out as Exclude<Outcome<T>, { ok: true }>, t) };
  refresh();
  return { ok: true, message: done?.(t) };
}

const generic = (_o: unknown, t: Copy) => t.common.failed;

/** A refused print write in words: the field the table's check named, a slug clash, or a missing print. */
function printProblem(o: { reason: string; message: string }, t: Copy, creating = false): string {
  if (o.reason === "not_found") return t.print.errors.notFound;
  // A publish refused for what is missing (changed elsewhere since the page was opened): say what.
  if (o.message.startsWith("Publishing needs")) {
    const parts = t.print.missingParts;
    const missing = [/a title/.test(o.message) && parts.title, /a description/.test(o.message) && parts.description, /photo/.test(o.message) && parts.photo];
    return t.print.missing(missing.filter((m): m is string => typeof m === "string"));
  }
  const slug = /slug "([^"]+)"/.exec(o.message)?.[1];
  if (slug) return creating ? t.print.errors.slugNew(slug) : t.print.errors.slug(slug);
  const field = /^([A-Za-z]+)[.:]/.exec(o.message)?.[1];
  if (field && field in t.print.fields) return t.print.errors.field(t.print.fields[field as PrintFieldName].label);
  return t.common.failed;
}

// ---- prints

/** The print form (useActionState): a new print is created and opened; an edit is saved in place. */
export async function savePrint(id: string | null, _prev: Result | null, fd: FormData): Promise<Result> {
  const t = await words();
  if (!(await actionPerson())) return { ok: false, error: t.common.signedOut };
  const rt = runtime();
  if (id === null) {
    const made = createPrint(rt, formValues(fd, "create") as Parameters<typeof createPrint>[1]);
    if (!made.ok) return { ok: false, error: printProblem(made, t, true) };
    redirect(`/prints/${made.value.id}`);
  }
  const saved = updatePrint(rt, id, formValues(fd, "edit"));
  if (!saved.ok) return { ok: false, error: printProblem(saved, t) };
  refresh();
  return { ok: true, message: t.common.saved };
}

/** "Start with photos": a draft named by the moment, for photos picked on the prints list; its page names it (its address follows). */
export async function startWithPhotos(): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const t = await words();
  if (!(await actionPerson())) return { ok: false, error: t.common.signedOut };
  const rt = runtime();
  const when = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "medium" }).format(rt.clock());
  const made = createPrint(rt, { title: t.list.draftTitle(when), description: "" });
  if (!made.ok) return { ok: false, error: printProblem(made, t) };
  return { ok: true, id: made.value.id };
}

/** A draft from a model page's link, with its pictures (backend/sources). A model imported before opens its print instead. */
export async function importLink(url: string): Promise<{ ok: true; id: string } | { ok: false; error: string; id?: string }> {
  const t = await words();
  if (!(await actionPerson())) return { ok: false, error: t.common.signedOut };
  const got = await importFromLink(runtime(), url);
  const e = t.list.importErrors;
  if (got.ok) return { ok: true, id: got.value.print.id };
  if (got.reason === "conflict") {
    const id = /is print ([0-9a-f-]{36})/.exec(got.message)?.[1];
    return { ok: false, error: e.already, ...(id ? { id } : {}) };
  }
  if (got.reason === "not_found") return { ok: false, error: e.noModel };
  if (got.message.startsWith("url:")) return { ok: false, error: e.link };
  if (got.message.startsWith("thingiverse:")) return { ok: false, error: e.thingiverse };
  return { ok: false, error: e.unreachable };
}

/** Another print made from the same model page as `link` (a 3MF's MakerWorld page), so the form can say so before a second one is saved. */
export async function otherPrintOfModel(link: string, printId: string | null): Promise<{ id: string; title: string } | null> {
  if (!(await actionPerson())) return null;
  const p = printOfModel(runtime(), link, printId);
  return p ? { id: p.id, title: p.title } : null;
}

/** Claude's suggestion for the texts of the print the form shows (backend/enhance.ts); nothing is saved. */
export async function enhanceWithAi(input: EnhanceInput): Promise<{ ok: true; value: Suggestion } | { ok: false; error: string }> {
  const t = await words();
  if (!(await actionPerson())) return { ok: false, error: t.common.signedOut };
  const got = await suggestForPrint(runtime(), input);
  if (got.ok) return { ok: true, value: got.value };
  const e = t.print.ai.errors;
  if (got.reason === "conflict") return { ok: false, error: e.off };
  return { ok: false, error: got.message.startsWith("title:") ? e.empty : e.failed };
}

export async function publish(id: string): Promise<Result> {
  return act(
    () => publishPrint(runtime(), id),
    // A reserved slug names the clash (Review Focus 4: the refusal names the slug); what is missing the page shows already.
    printProblem,
    (t) => t.print.published,
  );
}

export async function unpublish(id: string): Promise<Result> {
  return act(
    () => unpublishPrint(runtime(), id),
    printProblem,
    (t) => t.print.unpublished,
  );
}

export async function removePrint(id: string): Promise<Result> {
  const out = await act(() => deletePrint(runtime(), id), printProblem);
  if (out.ok) redirect("/");
  return out;
}

// ---- photos

export async function makeCover(printId: string, photoId: string): Promise<Result> {
  return act(() => setCover(runtime(), printId, photoId), generic);
}

export async function orderPhotos(printId: string, photoIds: string[]): Promise<Result> {
  return act(() => reorderPhotos(runtime(), printId, photoIds), generic);
}

export async function cropPhoto(photoId: string, crop: Crop | null): Promise<Result> {
  return act(() => setCrop(runtime(), photoId, crop), generic);
}

export async function removePhoto(photoId: string): Promise<Result> {
  return act(() => deletePhoto(runtime(), photoId), generic);
}

// ---- order

export async function moveInPortfolio(id: string, beforeId: string | null): Promise<Result> {
  return act(
    () => movePrint(runtime(), id, beforeId),
    generic,
    (t) => t.order.saved,
  );
}

export async function moveAmongShowcases(id: string, beforeId: string | null): Promise<Result> {
  return act(
    () => moveShowcase(runtime(), id, beforeId),
    generic,
    (t) => t.order.saved,
  );
}

export async function pin(id: string, on: boolean): Promise<Result> {
  return act(
    () => setShowcase(runtime(), id, on),
    generic,
    (t) => t.order.saved,
  );
}

// ---- categories

const categoryProblem = (o: { reason: string }, t: Copy) =>
  o.reason === "conflict" ? t.categories.exists : o.reason === "invalid" ? t.categories.needsLetter : t.common.failed;

export async function addCategory(_prev: Result | null, fd: FormData): Promise<Result> {
  return act(
    () => createCategory(runtime(), String(fd.get("name") ?? "")),
    categoryProblem,
    (t) => t.categories.created,
  );
}

export async function renameCategoryAction(id: string, _prev: Result | null, fd: FormData): Promise<Result> {
  return act(
    () => renameCategory(runtime(), id, String(fd.get("name") ?? "")),
    categoryProblem,
    (t) => t.categories.renamed,
  );
}

export async function removeCategory(id: string): Promise<Result> {
  return act(
    () => deleteCategory(runtime(), id),
    (o, t) => (o.reason === "conflict" ? t.categories.inUse : t.common.failed),
    (t) => t.categories.deleted,
  );
}

// ---- API tokens (the kit's; the dev user has none)

const EXPIRIES: Record<string, number | null> = { "30": 30, "90": 90, "365": 365, never: null };

export async function addToken(_prev: Result | null, fd: FormData): Promise<Result> {
  const t = await words();
  const person = await actionPerson();
  if (!person) return { ok: false, error: t.common.signedOut };
  const scope = fd.get("scope") === "read+write" ? "read+write" : "read";
  const expiry = String(fd.get("expiry") ?? "90");
  const expiresInDays = Object.hasOwn(EXPIRIES, expiry) ? EXPIRIES[expiry]! : 90;
  const made = await createApiToken(await runtime().auth(), person.id, { name: String(fd.get("name") ?? "").trim(), scope, expiresInDays });
  if ("error" in made) return { ok: false, error: t.common.failed };
  refresh();
  return { ok: true, token: made.token };
}

export async function revokeToken(id: string): Promise<Result> {
  const t = await words();
  const person = await actionPerson();
  if (!person) return { ok: false, error: t.common.signedOut };
  const out = await revokeApiToken(await runtime().auth(), person.id, id);
  if (!out.ok) return { ok: false, error: t.common.failed };
  refresh();
  return { ok: true, message: t.settings.tokens.revoked };
}
