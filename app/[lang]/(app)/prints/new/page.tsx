import type { Metadata } from "next";
import Link from "next/link";
import { requirePerson } from "@/app/_lib/signin";
import { runtime } from "@/app/_lib/runtime";
import { filamentCosts, listAddOns, listCategories } from "@/backend";
import { copyFor } from "@/components/copy";
import { BackIcon } from "@/components/icons";
import { ui } from "@/components/ui";
import { fieldSpecs } from "../printform";
import { PrintForm } from "../PrintForm";

export async function generateMetadata({ params }: PageProps<"/[lang]/prints/new">): Promise<Metadata> {
  return { title: copyFor((await params).lang).print.newTitle };
}

// A new print: its text first; saving makes the draft and opens its page, where the photos are added.
export default async function NewPrintPage({ params }: PageProps<"/[lang]/prints/new">) {
  await requirePerson("/prints/new");
  const t = copyFor((await params).lang);
  return (
    <>
      <Link href="/" className="inline-flex min-h-11 items-center gap-1 text-sm underline">
        <BackIcon aria-hidden="true" className={ui.iconSize} />
        {t.common.back}
      </Link>
      <h1 className={`${ui.h1} mt-2`}>{t.print.newTitle}</h1>
      <PrintForm
        ai={runtime().askClaude !== null}
        printId={null}
        specs={fieldSpecs()}
        categories={listCategories(runtime())}
        addOns={listAddOns(runtime())}
        filamentCosts={await filamentCosts(runtime())}
        values={null}
        slugFixed={false}
      />
    </>
  );
}
