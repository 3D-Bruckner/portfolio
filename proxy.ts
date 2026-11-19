import { NextResponse, type NextRequest } from "next/server";
import { LANG_COOKIE, LANG_HEADER, negotiate } from "@/components/copy";

// The UI's language (conventions: code/language, Next's internationalization guide): every page lives under app/[lang], and the proxy
// rewrites a page's path to /<lang>/<path>, so no URL carries the language and every link and bookmark stays as it is. The language is
// the one picked in the switch (its cookie), else the browser's Accept-Language, else English; it is passed on as a request header too.
// Route handlers stay outside app/[lang] and are left alone: the API, Better Auth's endpoints, MCP, the photos, the health check and the
// OAuth metadata.
const NOT_A_PAGE = /^\/(?:api\/|_next\/|\.well-known\/|photos\/|(?:mcp|health|favicon\.ico|icon\.svg)$)/;

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (NOT_A_PAGE.test(pathname)) return NextResponse.next();
  const lang = negotiate(req.cookies.get(LANG_COOKIE)?.value, req.headers.get("accept-language"));
  const headers = new Headers(req.headers);
  headers.set(LANG_HEADER, lang);
  return NextResponse.rewrite(new URL(`/${lang}${pathname === "/" ? "" : pathname}${search}`, req.url), { request: { headers } });
}

export const config = {
  matcher: "/((?!_next/|favicon\\.ico).*)",
};
