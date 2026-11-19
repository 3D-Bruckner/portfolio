import { copyFor, isLocale } from "@/components/copy";
import { LanguageSwitch } from "@/components/LanguageSwitch";

// The pages someone not signed in sees (sign-in, consent): the app's name and the language switch.
export default async function PublicLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  const t = copyFor(lang);
  return (
    <>
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-semibold">{t.app.name}</span>
        {isLocale(lang) && <LanguageSwitch lang={lang} />}
      </header>
      <main className="px-4 py-6">{children}</main>
    </>
  );
}
