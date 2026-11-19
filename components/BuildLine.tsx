import { Suspense, use } from "react";
import type { BuildStatus } from "@/backend";
import { copyFor } from "@/components/copy";
import { formatWhen } from "@/components/format";
import { BuildIcon, ExternalIcon } from "@/components/icons";
import { ui } from "@/components/ui";

// The header's line about the website build. The page never waits for it: the status (backend's buildStatus, which may ask GitHub) comes
// as a promise and streams in behind a quiet placeholder, so a slow or failing GitHub can't hold up a page or a server action's refresh.
const LINE = "mx-auto flex min-h-6 max-w-3xl flex-wrap items-center gap-x-2 px-4 pt-1 text-sm text-muted";

/**
 * The status as the line takes it: a status that couldn't be read is undefined, never a rejection, so the promise the layout hands on
 * without awaiting it can't become an unhandled rejection or fail the page.
 */
export function lineStatus(status: Promise<BuildStatus>): Promise<BuildStatus | undefined> {
  return status.catch(() => undefined);
}

export function BuildLineSlot({ lang, status }: { lang: string; status: Promise<BuildStatus | undefined> }) {
  return (
    <Suspense
      fallback={
        <p className={LINE}>
          <BuildIcon aria-hidden="true" className={ui.iconSize} />
          <span>{copyFor(lang).build.checking}</span>
        </p>
      }
    >
      <BuildLine lang={lang} status={status} />
    </Suspense>
  );
}

function BuildLine({ lang, status: pending }: { lang: string; status: Promise<BuildStatus | undefined> }) {
  const t = copyFor(lang).build;
  const status = use(pending);
  let text: string;
  if (!status) text = t.unknown;
  else if (status.pending) text = t.pending;
  else if (status.lastError) text = t.failed;
  else if (status.run) {
    const { run } = status;
    const state = run.status !== "completed" ? run.status : run.conclusion === "success" || run.conclusion === "failure" ? run.conclusion : "other";
    text = t.run(t.states[state as keyof typeof t.states] ?? t.states.other, formatWhen(lang, run.startedAt));
  } else text = t.upToDate;
  return (
    <p className={LINE}>
      <BuildIcon aria-hidden="true" className={ui.iconSize} />
      <span>{text}</span>
      {status?.run && !status.pending && (
        <a href={status.run.url} className="inline-flex items-center gap-1 underline">
          {t.details}
          <ExternalIcon aria-hidden="true" className="size-3.5" />
        </a>
      )}
    </p>
  );
}
