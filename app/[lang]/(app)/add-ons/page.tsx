import type { Metadata } from "next";
import { requirePerson } from "@/app/_lib/signin";
import { runtime } from "@/app/_lib/runtime";
import { listAddOns } from "@/backend";
import { copyFor } from "@/components/copy";
import { ui } from "@/components/ui";
import { AddOns } from "./AddOns";

export async function generateMetadata({ params }: PageProps<"/[lang]/add-ons">): Promise<Metadata> {
  return { title: copyFor((await params).lang).addOns.title };
}

// The extra parts a print can include or offer: made once here, picked on each print, deleted once no print uses them.
export default async function AddOnsPage({ params }: PageProps<"/[lang]/add-ons">) {
  await requirePerson("/add-ons");
  const t = copyFor((await params).lang).addOns;
  return (
    <>
      <h1 className={ui.h1}>{t.title}</h1>
      <p className="mt-2 text-muted">{t.intro}</p>
      <AddOns addOns={listAddOns(runtime())} />
    </>
  );
}
