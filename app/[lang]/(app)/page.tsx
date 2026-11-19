import Link from "next/link";
import { requirePerson } from "@/app/_lib/signin";
import { runtime } from "@/app/_lib/runtime";
import { listPrints, type Print } from "@/backend";
import { copyFor, type Copy } from "@/components/copy";
import { AddIcon, ChevronIcon, PhotoIcon, ShowcaseIcon } from "@/components/icons";
import { Tabs } from "@/components/Tabs";
import { ui } from "@/components/ui";
import { StartWithPhotos } from "./StartWithPhotos";

// The start page: the prints, published ones in the site's order and drafts newest first, each with its cover; "New print" on top.
export default async function Home({ params, searchParams }: PageProps<"/[lang]">) {
  await requirePerson("/");
  const t = copyFor((await params).lang);
  const tab = (await searchParams).tab;
  const prints = listPrints(runtime());
  const published = prints.filter((p) => p.status === "published");
  const drafts = prints.filter((p) => p.status === "draft");
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className={ui.h1}>{t.home.title}</h1>
        <Link href="/prints/new" className={ui.button}>
          <AddIcon aria-hidden="true" className={ui.iconSize} />
          {t.list.newPrint}
        </Link>
      </div>
      <div className="mt-4">
        <StartWithPhotos />
      </div>
      <div className="mt-5">
        <Tabs
          label={t.list.tabs}
          initial={typeof tab === "string" ? tab : published.length === 0 && drafts.length > 0 ? "drafts" : "published"}
          tabs={[
            {
              id: "published",
              label: t.list.tab(t.list.published, published.length),
              panel: <PrintList prints={published} empty={t.list.emptyPublished} t={t} />,
            },
            { id: "drafts", label: t.list.tab(t.list.drafts, drafts.length), panel: <PrintList prints={drafts} empty={t.list.emptyDrafts} t={t} /> },
          ]}
        />
      </div>
    </>
  );
}

function PrintList({ prints, empty, t }: { prints: Print[]; empty: string; t: Copy }) {
  if (prints.length === 0) return <p className="text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {prints.map((p) => {
        const cover = p.coverPhotoId ?? p.photos[0]?.id;
        const sha = p.photos.find((ph) => ph.id === cover)?.sha256;
        return (
          <li key={p.id}>
            <Link href={`/prints/${p.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- the app's own photo route, private and per-session
                <img
                  src={`/photos/${cover}?size=thumb&v=${sha}`}
                  alt=""
                  width={64}
                  height={64}
                  loading="lazy"
                  className="size-16 shrink-0 rounded-xl bg-surface object-cover"
                />
              ) : (
                <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-surface text-muted">
                  <PhotoIcon aria-hidden="true" className="size-6" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.title}</span>
                <span className="tabular mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                  <span>
                    {p.photos.length === 0 ? t.list.noPhoto : t.list.photos(p.photos.length)}
                    {p.price !== null && ` · ${t.list.price(p.price)}`}
                  </span>
                  {p.showcase && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-px text-xs font-semibold text-ink">
                      <ShowcaseIcon aria-hidden="true" className="size-3.5" />
                      {t.list.showcase}
                    </span>
                  )}
                </span>
              </span>
              <ChevronIcon aria-hidden="true" className="size-5 shrink-0 text-muted" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
