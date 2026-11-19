import { copyFor, isLocale } from "@/components/copy";
import { LanguageSwitch } from "@/components/LanguageSwitch";

// The pages someone not signed in sees (sign-in, consent): the app's name and the language switch.
export default async function PublicLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  const t = copyFor(lang);
  return (
    <>
      <header className="border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-semibold">{t.app.name}</span>
          {isLocale(lang) && <LanguageSwitch lang={lang} />}
        </div>
      </header>
      <main className="px-4 py-6">{children}</main>
    </>
  );
}
