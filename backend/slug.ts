// A print's or category's address on the site, exactly as the site makes it (3dbruckner's src/lib/printed.ts): lowercase, German umlauts
// and ß spelled out, every run of anything but a-z and 0-9 one hyphen, none at either end. Change both together or not at all.
export const toSlug = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug.length <= SLUG_MAX) return slug;
  // A long title (a MakerWorld one from a 3MF) gives a short address: cut at the last hyphen that keeps it within the limit.
  const cut = slug.slice(0, SLUG_MAX + 1);
  const at = cut.lastIndexOf("-");
  return (at > 0 ? cut.slice(0, at) : slug.slice(0, SLUG_MAX)).replace(/-$/, "");
};

/** The longest address made from a title (the slug field takes up to 100, so one set by hand may be longer). */
export const SLUG_MAX = 80;

/** What toSlug can return, other than "": the rule for a slug set by hand. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
