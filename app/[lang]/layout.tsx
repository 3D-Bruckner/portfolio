import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyProvider } from "@/components/CopyProvider";
import { copyFor, isLocale, LOCALES } from "@/components/copy";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import "../globals.css";

// The root layout. Its language is the page's, from proxy.ts's rewrite; no URL carries it (conventions: code/language).
export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const t = copyFor((await params).lang).app;
  return { title: { default: t.name, template: `%s · ${t.name}` }, description: t.description, robots: { index: false, follow: false } };
}

// The languages the UI speaks; the proxy only ever rewrites to one of them.
export const generateStaticParams = () => LOCALES.map((lang) => ({ lang }));

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = copyFor(lang);
  return (
    <html lang={lang}>
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        <CopyProvider lang={lang}>
          <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
            <span className="font-semibold">{t.app.name}</span>
            <LanguageSwitch lang={lang} />
          </header>
          <main className="px-4 py-6">{children}</main>
        </CopyProvider>
      </body>
    </html>
  );
}
