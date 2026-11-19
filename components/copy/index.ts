// The UI's languages (conventions: code/language): one copy module per language, English first, the others typed as Copy. The language
// is the one picked in the switch (its cookie), else the browser's Accept-Language, else English; proxy.ts picks it and rewrites each
// page to app/[lang]/, so no URL carries it. Server code takes copyFor(lang); client components useCopy() (components/CopyProvider.tsx).
import { de } from "./de";
import { en, type Copy } from "./en";

export type { Copy } from "./en";

export const COPIES = { en, de } satisfies Record<string, Copy>;
export type Locale = keyof typeof COPIES;
export const LOCALES = Object.keys(COPIES) as Locale[];
export const DEFAULT_LOCALE: Locale = "en";

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && Object.hasOwn(COPIES, v);
export const copyFor = (lang: string): Copy => COPIES[isLocale(lang) ? lang : DEFAULT_LOCALE];

/** The cookie the language switch sets, which wins over the browser's languages. */
export const LANG_COOKIE = "upload_lang";
/** The request header proxy.ts sets to the page's language, for server components without a `lang` param. */
export const LANG_HEADER = "x-upload-lang";

/** The language for a request: the picked one if the UI speaks it, else the best of Accept-Language by weight ("de-AT" matches "de"), else English. */
export function negotiate(picked: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(picked)) return picked;
  const asked = (acceptLanguage ?? "")
    .split(",")
    .map((part, i) => {
      const [tag = "", ...params] = part.trim().toLowerCase().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.split("=")[1] ?? 1);
      return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0, i };
    })
    .filter((a) => a.tag && a.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const { tag } of asked) {
    if (isLocale(tag)) return tag;
    const primary = tag.split("-")[0];
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}
