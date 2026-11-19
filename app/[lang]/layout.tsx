import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyProvider } from "@/components/CopyProvider";
import { copyFor, isLocale } from "@/components/copy";
import "../globals.css";

// The root layout. Its language is the page's, from proxy.ts's rewrite; no URL carries it (conventions: code/language).
export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const t = copyFor((await params).lang).app;
  return { title: { default: t.name, template: `%s · ${t.name}` }, description: t.description, robots: { index: false, follow: false } };
}

// Every page is rendered per request and private: none is prerendered, so none goes out with a shared cache's s-maxage (the language
// comes from the request, and every page will be a signed-in person's).
export const dynamic = "force-dynamic";

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  // The header and <main> are the route groups' own: (app) for the signed-in pages, (public) for sign-in and consent.
  return (
    <html lang={lang}>
      <body className="min-h-screen bg-paper text-ink antialiased">
        <CopyProvider lang={lang}>{children}</CopyProvider>
      </body>
    </html>
  );
}
