"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCopy } from "@/components/CopyProvider";
import { CategoriesIcon, OrderIcon, PrintsIcon, SettingsIcon } from "@/components/icons";

// The menu: the current part is marked by aria-current, in bold and underlined, not by colour alone.
const PARTS = [
  { href: "/", key: "prints", Icon: PrintsIcon, matches: (p: string) => p === "/" || p.startsWith("/prints") },
  { href: "/order", key: "order", Icon: OrderIcon, matches: (p: string) => p.startsWith("/order") },
  { href: "/categories", key: "categories", Icon: CategoriesIcon, matches: (p: string) => p.startsWith("/categories") },
  { href: "/settings", key: "settings", Icon: SettingsIcon, matches: (p: string) => p.startsWith("/settings") },
] as const;

export function NavLinks() {
  const t = useCopy().nav;
  // The browser's path; should a rewritten one with its language come through, the language is dropped.
  const path = usePathname().replace(/^\/(?:en|de)(?=\/|$)/, "") || "/";
  return (
    <nav aria-label={t.label} className="mx-auto mt-1 max-w-3xl px-2">
      <ul className="grid grid-cols-4">
        {PARTS.map(({ href, key, Icon, matches }) => {
          const current = matches(path);
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-12 flex-col items-center justify-center gap-0.5 border-b-2 px-1 pb-1 text-xs whitespace-nowrap sm:flex-row sm:gap-1.5 sm:text-sm ${current ? "border-accent font-semibold text-ink underline underline-offset-4" : "border-transparent text-muted hover:text-ink"}`}
              >
                <Icon aria-hidden="true" className="size-5 sm:size-4" />
                {t[key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
