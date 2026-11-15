// The sitemap endpoint — ONE dynamic route serves every sitemap file.
//
// `getStaticPaths()` returns exactly the filenames the engine built from
// `src/config/config.json`, so Astro generates them as static files in
// `dist/` during `astro build`. No SSR, no server functions, no runtime
// filesystem access: the collectors read the content collections through
// Astro's data layer. Disabled types produce no path (and therefore no
// file); a disabled master switch produces no paths at all.
//
// The file map is built once per build process and cached in module scope:
// `getStaticPaths()` runs first and each `GET` would otherwise re-run
// every collector for every file.
import type { APIRoute } from "astro";
import { buildSitemapFilesAsync } from "@/lib/seo/sitemap/index";

let cached: Promise<Map<string, string>> | undefined;

function getSitemapFiles(): Promise<Map<string, string>> {
  return (cached ??= buildSitemapFilesAsync());
}

export async function getStaticPaths() {
  const files = await getSitemapFiles();
  return [...files.keys()].map((filename) => ({
    params: { sitemap: filename.replace(/\.xml$/, "") },
  }));
}

export const GET: APIRoute = async ({ params }) => {
  const files = await getSitemapFiles();
  const xml = files.get(`${params.sitemap}.xml`);
  if (!xml) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
