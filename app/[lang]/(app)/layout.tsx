import { headers } from "next/headers";
import { runtime } from "@/app/_lib/runtime";
import { buildStatus } from "@/backend";
import { copyFor, isLocale } from "@/components/copy";
import { formatWhen } from "@/components/format";
import { BuildIcon, ExternalIcon } from "@/components/icons";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { ui } from "@/components/ui";
import { NavLinks } from "./NavLinks";

// The signed-in pages' frame: the app's name, the menu, the line about the website build (backend's buildStatus, GitHub's answer kept
// 20 s there) and the language switch. Each page asks for its person itself (requirePerson); the menu and the build line show only to
// someone signed in.
export default async function AppLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  const t = copyFor(lang);
  const rt = runtime();
  const person = await rt.person(await headers());
  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pt-3">
          <span className="font-semibold">{t.app.name}</span>
          {isLocale(lang) && <LanguageSwitch lang={lang} />}
        </div>
        {person && (
          <>
            <BuildLine lang={lang} />
            <NavLinks />
          </>
        )}
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </>
  );
}

async function BuildLine({ lang }: { lang: string }) {
  const t = copyFor(lang).build;
  const status = await buildStatus(runtime());
  let text: string;
  if (status.pending) text = t.pending;
  else if (status.lastError) text = t.failed;
  else if (status.run) {
    const s =
      status.run.status === "completed"
        ? status.run.conclusion === "success"
          ? "success"
          : status.run.conclusion === "failure"
            ? "failure"
            : "other"
        : status.run.status;
    text = t.run(t.states[s as keyof typeof t.states] ?? t.states.other, formatWhen(lang, status.run.startedAt));
  } else text = t.upToDate;
  return (
    <p className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-2 px-4 pt-1 text-sm text-muted">
      <BuildIcon aria-hidden="true" className={ui.iconSize} />
      <span>{text}</span>
      {status.run && !status.pending && (
        <a href={status.run.url} className="inline-flex items-center gap-1 underline">
          {t.details}
          <ExternalIcon aria-hidden="true" className="size-3.5" />
        </a>
      )}
    </p>
  );
}
