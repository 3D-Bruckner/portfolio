import type { Metadata } from "next";
import { requirePerson } from "@/app/_lib/signin";
import { runtime } from "@/app/_lib/runtime";
import { listCategories } from "@/backend";
import { copyFor } from "@/components/copy";
import { ui } from "@/components/ui";
import { Categories } from "./Categories";

export async function generateMetadata({ params }: PageProps<"/[lang]/categories">): Promise<Metadata> {
  return { title: copyFor((await params).lang).categories.title };
}

// The categories a print picks from: created here on purpose (so "Geschenkidee" can't appear next to "Geschenkideen"), renamed (their
// address on the site stays), deleted once no print uses them.
export default async function CategoriesPage({ params }: PageProps<"/[lang]/categories">) {
  await requirePerson("/categories");
  const t = copyFor((await params).lang).categories;
  return (
    <>
      <h1 className={ui.h1}>{t.title}</h1>
      <p className="mt-2 text-muted">{t.intro}</p>
      <Categories categories={listCategories(runtime())} />
    </>
  );
}
