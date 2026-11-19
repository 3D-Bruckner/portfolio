import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pino and better-sqlite3 stay plain Node requires, so the standalone build traces them into node_modules.
  serverExternalPackages: ["pino", "better-sqlite3"],
  // The root layout is in app/[lang] (conventions: code/language), so an address no route matches gets app/global-not-found.tsx.
  experimental: { globalNotFound: true },
  // No page is ever framed: a page of another site must not overlay a "Save", "Delete" or "Allow" click.
  headers: async () => [{ source: "/(.*)", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] }],
};

export default nextConfig;
