// Is a print ready for 3dbruckner.de? What publishing needs (missingToPublish), and tips beyond it that make the print look right on
// the site: what its card shows (a title that fits, a price, a category instead of "Sonstiges"), what its page shows (the slicer's
// numbers, enough photos, a description with something in it, where the model comes from). The web app shows them as a checklist on the
// print's page; MCP results carry them as guidance. The words for people are the copy modules' (by code); `text` is for an assistant.
import type { Print } from "./prints";

export type HintCode = "title" | "description" | "photo" | "price" | "category" | "slicer" | "cardTitle" | "morePhotos" | "longerDescription" | "origin";

export type Hint = {
  code: HintCode;
  /** needed: publishing is refused without it; tip: the print can go up, but looks better with it. */
  level: "needed" | "tip";
  /** The form field it is fixed in ("photos" for the photo section). */
  field: string;
  /** For an assistant: what to do, naming the tool or field. */
  text: string;
};

/** What the site's cards show of a title (src/lib/printed.ts): the short title, or the title up to its " – ". */
export const cardTitle = (p: Pick<Print, "title" | "shortTitle">): string => p.shortTitle ?? p.title.split(" – ")[0]!;

/** Longer than this, a card's title wraps three times on a phone. */
export const CARD_TITLE_MAX = 32;
/** Fewer photos than this make a thin page. */
export const ENOUGH_PHOTOS = 3;
/** A description shorter than this says little more than the title. */
export const DESCRIPTION_MIN = 60;

export function readiness(p: Print): Hint[] {
  const hints: Hint[] = [];
  const add = (code: HintCode, level: Hint["level"], field: string, text: string) => hints.push({ code, level, field, text });
  if (p.title.trim() === "") add("title", "needed", "title", "Publishing needs a title: update_print sets it.");
  if (p.description.trim() === "")
    add("description", "needed", "description", "Publishing needs a description (German, as the site shows it): update_print sets it.");
  if (p.photos.length === 0) add("photo", "needed", "photos", "Publishing needs a photo: Marcel adds photos in the web form at the print's url.");
  if (p.price === null) add("price", "tip", "price", "No price: the site shows none on its card. update_print's price sets one in whole euros.");
  if (p.categories.length === 0)
    add("category", "tip", "categoryIds", 'No category: the site files it under "Sonstiges". update_print\'s categoryIds sets them, the main one first.');
  if (p.weightGrams === null || p.printTimeMinutes === null)
    add(
      "slicer",
      "tip",
      "weightGrams",
      "No slicer numbers (weightGrams, printTimeMinutes): the site's page shows them; Marcel can fill them from a sliced 3MF in the web form.",
    );
  if (p.title.trim() !== "" && cardTitle(p).length > CARD_TITLE_MAX)
    add("cardTitle", "tip", "shortTitle", `The card's title "${cardTitle(p)}" is long for a card: a shortTitle of up to ${CARD_TITLE_MAX} characters fits.`);
  if (p.photos.length > 0 && p.photos.length < ENOUGH_PHOTOS)
    add("morePhotos", "tip", "photos", `Only ${p.photos.length} photo(s): ${ENOUGH_PHOTOS} or more show the print from several sides.`);
  if (p.description.trim() !== "" && p.description.trim().length < DESCRIPTION_MIN)
    add("longerDescription", "tip", "description", "The description is very short: a sentence or two on what it is and what it's for helps.");
  if (p.sources.length === 0 && !p.selfDesigned)
    add("origin", "tip", "sources", "Neither a source nor selfDesigned: add where the model comes from (sources) or mark it as Marcel's own design.");
  return hints;
}
