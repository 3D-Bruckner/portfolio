import type { Metadata } from "next";
import { requirePerson } from "@/app/_lib/signin";
import { runtime } from "@/app/_lib/runtime";
import { siteOrder } from "@/backend";
import { copyFor } from "@/components/copy";
import { ui } from "@/components/ui";
import { OrderList } from "./OrderList";

export async function generateMetadata({ params }: PageProps<"/[lang]/order">): Promise<Metadata> {
  return { title: copyFor((await params).lang).order.title };
}

// The site's order: the showcases (pinned, in their own order, also the start page's selection), then the rest of the portfolio.
export default async function OrderPage({ params }: PageProps<"/[lang]/order">) {
  await requirePerson("/order");
  const t = copyFor((await params).lang).order;
  const prints = siteOrder(runtime()).map((p) => {
    const cover = p.photos.find((ph) => ph.id === p.coverPhotoId) ?? p.photos[0];
    return { id: p.id, title: p.title, showcase: p.showcase, cover: cover ? `/photos/${cover.id}?size=thumb&v=${cover.sha256}` : null };
  });
  return (
    <>
      <h1 className={ui.h1}>{t.title}</h1>
      <p className="mt-2 text-muted">{t.intro}</p>
      <OrderList kind="showcases" prints={prints.filter((p) => p.showcase)} />
      <OrderList kind="portfolio" prints={prints.filter((p) => !p.showcase)} />
    </>
  );
}
