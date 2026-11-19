import { cardTitle, readiness, type Print } from "@/backend";
import { copyFor } from "@/components/copy";
import { ReadyIcon, TipIcon } from "@/components/icons";
import { ui } from "@/components/ui";

// "For the website": the tips of backend/readiness.ts as a checklist on the print's page, each linking to where it is fixed. What
// publishing needs is said by the publish button; this is what makes the print look right on the site once it is there.
const ANCHOR: Record<string, string> = {
  price: "field-price",
  categoryIds: "group-categories",
  weightGrams: "group-numbers",
  shortTitle: "field-shortTitle",
  photos: "photos-heading",
  description: "field-description",
  sources: "group-origin",
};

export function Readiness({ print, lang }: { print: Print; lang: string }) {
  const t = copyFor(lang).print.readiness;
  const tips = readiness(print).filter((h) => h.level === "tip");
  const words = (code: string): string => {
    switch (code) {
      case "cardTitle":
        return t.cardTitle(cardTitle(print));
      case "morePhotos":
        return t.morePhotos(print.photos.length);
      default:
        return t[code as "price" | "category" | "slicer" | "longerDescription" | "origin"];
    }
  };
  return (
    <section aria-labelledby="readiness-heading" className={`${ui.card} mt-4`}>
      <h2 id="readiness-heading" className={`${ui.h2} flex items-center justify-between gap-2`}>
        <span>{t.heading}</span>
        {tips.length > 0 && <span className="text-sm font-semibold text-muted">{t.tips(tips.length)}</span>}
      </h2>
      {tips.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-success">
          <ReadyIcon aria-hidden="true" className={ui.iconSize} />
          {t.ready}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {tips.map((h) => (
            <li key={h.code}>
              <a href={`#${ANCHOR[h.field] ?? `field-${h.field}`}`} className="flex min-h-11 items-start gap-2 py-2 text-sm hover:underline">
                <TipIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
                <span className="flex-1">{words(h.code)}</span>
                <span className="sr-only">{t.go}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
