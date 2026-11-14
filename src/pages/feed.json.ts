// JSON Feed 1.1 (https://www.jsonfeed.org/version/1.1/). Same entries,
// order and content as rss.xml; authors are display names only (no
// emails). Entries come from the shared pipeline
// (`src/lib/utils/feed-entries.ts`, one render pass for all three feeds).
import config from "@/config/config.json";
import type { APIRoute } from "astro";
import { getFeedEntries } from "@/lib/utils/feed-entries";
import { toBcp47 } from "@/lib/utils/rss";
import { absoluteUrl } from "@/lib/utils/seo";

const FEED_PATH = "/feed.json";

export const GET: APIRoute = async () => {
  const { entries } = await getFeedEntries();

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: config.site.title,
    home_page_url: absoluteUrl("/"),
    feed_url: absoluteUrl(FEED_PATH),
    language: toBcp47(config.site.locale, config.site.language),
    ...(config.site.logo ? { icon: absoluteUrl(config.site.logo) } : {}),
    ...(config.site.favicon
      ? { favicon: absoluteUrl(config.site.favicon) }
      : {}),
    items: entries.map((e) => ({
      id: e.url,
      url: e.url,
      title: e.title,
      // JSON Feed requires content_html or content_text on every item.
      ...(e.contentHtml
        ? { content_html: e.contentHtml }
        : { content_text: e.summary || e.title }),
      ...(e.summary ? { summary: e.summary } : {}),
      ...(e.image ? { image: e.image } : {}),
      ...(e.published ? { date_published: e.published.toISOString() } : {}),
      ...(e.modified ? { date_modified: e.modified.toISOString() } : {}),
      ...(e.authors.length
        ? {
            authors: e.authors.map((a) => ({
              name: a.name,
              ...(a.url ? { url: a.url } : {}),
            })),
          }
        : {}),
      ...(e.categories.length ? { tags: e.categories } : {}),
    })),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: { "Content-Type": "application/feed+json; charset=utf-8" },
  });
};
