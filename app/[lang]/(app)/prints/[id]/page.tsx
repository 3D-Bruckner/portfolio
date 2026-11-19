import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerson } from "@/app/_lib/signin";
import { runtime } from "@/app/_lib/runtime";
import { getPrint, listCategories } from "@/backend";
import { copyFor } from "@/components/copy";
import { BackIcon } from "@/components/icons";
import { ui } from "@/components/ui";
import { FORM_ORDER } from "../fieldorder";
import { PhotoGrid } from "../PhotoGrid";
import { PhotoUploader } from "../PhotoUploader";
import { fieldSpecs } from "../printform";
import { PrintForm, type FormValues } from "../PrintForm";
import { DeletePrint, PublishBar } from "../PublishBar";
import { Readiness } from "../Readiness";

export async function generateMetadata({ params }: PageProps<"/[lang]/prints/[id]">): Promise<Metadata> {
  const { lang, id } = await params;
  const print = getPrint(runtime(), id);
  return { title: print.ok ? print.value.title : copyFor(lang).notFound.title };
}

// A print: whether it is on the site (and what publishing still needs), its photos (added, ordered, the cover, each one's cutout) and
// its text. At /prints/<id>, the address MCP results link to.
export default async function PrintPage({ params }: PageProps<"/[lang]/prints/[id]">) {
  const { lang, id } = await params;
  await requirePerson(`/prints/${id}`);
  const t = copyFor(lang);
  const rt = runtime();
  const found = getPrint(rt, id);
  if (!found.ok) notFound();
  const p = found.value;
  const missing = [
    ...(p.title.trim() === "" ? [t.print.missingParts.title] : []),
    ...(p.description.trim() === "" ? [t.print.missingParts.description] : []),
    ...(p.photos.length === 0 ? [t.print.missingParts.photo] : []),
  ];
  return (
    <>
      <Link href={`/?tab=${p.status === "published" ? "published" : "drafts"}`} className="-ml-1 inline-flex min-h-11 items-center gap-1 font-semibold">
        <BackIcon aria-hidden="true" className={ui.iconSize} />
        {t.common.back}
      </Link>
      <h1 className={`${ui.h1} break-words`}>{p.title}</h1>
      <PublishBar printId={p.id} status={p.status} missing={missing} />
      <Readiness print={p} lang={lang} />

      <section aria-labelledby="photos-heading" className={`${ui.card} mt-6`}>
        <h2 id="photos-heading" className={ui.h2}>
          {t.photoGrid.label}
        </h2>
        <PhotoUploader printId={p.id} />
        <PhotoGrid
          printId={p.id}
          published={p.status === "published"}
          coverId={p.coverPhotoId ?? p.photos[0]?.id ?? null}
          photos={p.photos.map((ph) => ({ id: ph.id, sha256: ph.sha256, original: ph.original, crop: ph.crop }))}
        />
      </section>

      <section aria-labelledby="details-heading" className="mt-8">
        <h2 id="details-heading" className={ui.h2}>
          {t.print.details}
        </h2>
        <PrintForm
          printId={p.id}
          specs={fieldSpecs()}
          categories={listCategories(rt)}
          values={Object.fromEntries(FORM_ORDER.map((n) => [n, p[n]])) as FormValues}
          slugFixed={p.firstPublishedAt !== null}
        />
      </section>

      <DeletePrint printId={p.id} title={p.title} published={p.status === "published"} />
    </>
  );
}
