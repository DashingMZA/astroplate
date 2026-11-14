// Dynamic robots.txt — generated from `config.site.base_url` / `base_path`
// (same source as canonicals, OG URLs and the RSS feed), so the file works
// for any site: change `site.base_url` in `src/config/config.json` and the
// `Sitemap:` line follows on the next build. No hard-coded domain lives here.
// The sitemap is Astro 7's `/sitemap-index.xml` (not `/sitemap.xml`).
import type { APIRoute } from "astro";
import { absoluteUrl } from "@/lib/utils/seo";

export const GET: APIRoute = () => {
  const txt = `User-agent: *
Allow: /

Sitemap: ${absoluteUrl("/sitemap-index.xml")}
`;
  return new Response(txt, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
