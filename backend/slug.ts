// A print's or category's address on the site, exactly as the site makes it (3dbruckner's src/lib/printed.ts): lowercase, German umlauts
// and ß spelled out, every run of anything but a-z and 0-9 one hyphen, none at either end. Change both together or not at all.
export const toSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** What toSlug can return, other than "": the rule for a slug set by hand. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
