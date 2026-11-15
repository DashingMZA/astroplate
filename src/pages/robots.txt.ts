// Dynamic robots.txt — generated from `config.site.base_url` / `base_path`
// (same source as canonicals, OG URLs and the RSS feed), so the file works
// for any site: change `site.base_url` in `src/config/config.json` and the
// `Sitemap:` line follows on the next build. No hard-coded domain lives here.
// The sitemap index filename comes from `config.sitemap.index_filename`
// (default `/sitemap-index.xml`).
import type { APIRoute } from "astro";
import { getSitemapSettings } from "@/lib/seo/sitemap/config";
import { absoluteUrl } from "@/lib/utils/seo";

export const GET: APIRoute = () => {
  const txt = `User-agent: *
Allow: /

Sitemap: ${absoluteUrl(`/${getSitemapSettings().index_filename}`)}
`;
  return new Response(txt, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
