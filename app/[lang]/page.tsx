import { copyFor } from "@/components/copy";

// The start page: the prints, once there are any (a later task).
export default async function Home({ params }: PageProps<"/[lang]">) {
  const t = copyFor((await params).lang).home;
  return (
    <>
      <h1 className="text-xl font-semibold">{t.title}</h1>
      <p className="mt-2 text-neutral-600">{t.empty}</p>
    </>
  );
}
