import { NextResponse, type NextRequest } from "next/server";
import { LANG_HEADER, languageOf } from "@/components/copy";

// The UI's language (conventions: code/language, Next's internationalization guide): every page lives under app/[lang], and the proxy
// rewrites a page's path to /<lang>/<path>, so no URL carries the language and every link and bookmark stays as it is. The language is
// the one picked in the switch (its cookie), else the browser's Accept-Language, else English; it is passed on as a request header too.
// Route handlers stay outside app/[lang] and are not rewritten: the API, Better Auth's endpoints, MCP, the photos, the health check and the
// OAuth metadata. They get the language header too (a photo upload's refusal speaks the page's language); a header the client sent under
// that name is replaced.
const NOT_A_PAGE = /^\/(?:api\/|_next\/|\.well-known\/|photos\/|(?:mcp|health|favicon\.ico|icon\.svg)$)/;

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const lang = languageOf(req.headers);
  const headers = new Headers(req.headers);
  headers.set(LANG_HEADER, lang);
  if (NOT_A_PAGE.test(pathname)) return NextResponse.next({ request: { headers } });
  return NextResponse.rewrite(new URL(`/${lang}${pathname === "/" ? "" : pathname}${search}`, req.url), { request: { headers } });
}

export const config = {
  matcher: "/((?!_next/|favicon\\.ico).*)",
};
