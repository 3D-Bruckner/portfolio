import { headers } from "next/headers";
import { runtime } from "@/app/_lib/runtime";
import { buildStatus } from "@/backend";
import { BuildLineSlot, lineStatus } from "@/components/BuildLine";
import { copyFor, isLocale } from "@/components/copy";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { NavLinks } from "./NavLinks";

// The signed-in pages' frame: the app's name, the menu, the line about the website build (backend's buildStatus, GitHub's answer or
// its failure kept 20 s there, streamed in so no page waits for it) and the language switch. Each page asks for its person itself
// (requirePerson); the menu and the build line show only to someone signed in.
export default async function AppLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  const t = copyFor(lang);
  const rt = runtime();
  const person = await rt.person(await headers());
  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-safe pt-3">
          <span className="font-semibold">{t.app.name}</span>
          {isLocale(lang) && <LanguageSwitch lang={lang} />}
        </div>
        {person && (
          <>
            {/* Not awaited here: the line streams in behind a placeholder (components/BuildLine.tsx). */}
            <BuildLineSlot lang={lang} status={lineStatus(buildStatus(rt))} />
            <NavLinks />
          </>
        )}
      </header>
      <main className="mx-auto max-w-3xl px-safe py-6">{children}</main>
    </>
  );
}
