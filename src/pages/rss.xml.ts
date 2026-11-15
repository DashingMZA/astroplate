// RSS 2.0 feed with full article content and featured-image metadata.
// Entries come from the shared pipeline (`src/lib/utils/feed-entries.ts`,
// one render pass for all three feeds).
//
// Channel: Atom self-link, Dublin Core + Media RSS namespaces, feed
// language from `config.site.locale`, `lastBuildDate` from the newest
// post's change (stable across rebuilds) and `ttl` refresh hint. Items:
// canonical links, `pubDate`, categories, `dc:creator` for authors
// (`<author>` is deliberately not emitted — it is an email address and
// would expose author emails to scrapers), `content:encoded` with the
// post's rendered HTML (sanitized, absolute URLs), and `media:content` /
// `media:thumbnail` for the post's own featured image (with real pixel
// dimensions when the image is a local file). Draft / noindex /
// future-dated posts are excluded, exactly as the sitemap and search
// index exclude them.
import config from "@/config/config.json";
import rss, { type RSSFeedItem } from "@astrojs/rss";
import type { APIRoute } from "astro";
import { getFeedEntries } from "@/lib/utils/feed-entries";
import { dcCreatorTags, escapeXml, toRssLanguage } from "@/lib/utils/rss";
import { absoluteUrl } from "@/lib/utils/seo";

const FEED_PATH = "/rss.xml";
const FEED_TTL_MINUTES = 60;

export const GET: APIRoute = async (context) => {
  const site = context.site?.toString() ?? config.site.base_url;
  const feedUrl = absoluteUrl(FEED_PATH);
  const { entries, updated } = await getFeedEntries();

  const items: RSSFeedItem[] = entries.map((entry) => {
    const customData = [
      dcCreatorTags(entry.authors.map((a) => a.name)),
      entry.mediaXml,
    ]
      .filter(Boolean)
      .join("\n");
    return {
      title: entry.title,
      description: entry.summary,
      link: entry.url,
      pubDate: entry.published,
      ...(entry.contentHtml ? { content: entry.contentHtml } : {}),
      ...(customData ? { customData } : {}),
      categories: entry.categories,
    };
  });

  // Channel image: the site logo (no width/height — the logo is 150px
  // wide and the RSS spec caps the width element at 144, so the
  // dimensions are left for readers to take from the file itself).
  const channelImage = config.site.logo
    ? `<image><url>${escapeXml(absoluteUrl(config.site.logo))}</url><title>${escapeXml(config.site.title)}</title><link>${escapeXml(site.replace(/\/+$/, ""))}</link></image>`
    : "";

  return rss({
    title: config.site.title,
    description: config.metadata.meta_description,
    site,
    trailingSlash: Boolean(config.site.trailing_slash),

    xmlns: {
      atom: "http://www.w3.org/2005/Atom",
      dc: "http://purl.org/dc/elements/1.1/",
      media: "http://search.yahoo.com/mrss/",
    },

    items,

    // Channel-level RSS metadata. The Atom self-link makes feed discovery
    // and validation unambiguous; ttl gives feed readers a refresh hint.
    // `lastBuildDate` is omitted when no entry carries a date — it is
    // never the build time.
    customData: [
      `<language>${toRssLanguage(config.site.locale, config.site.language)}</language>`,
      ...(updated
        ? [`<lastBuildDate>${updated.toUTCString()}</lastBuildDate>`]
        : []),
      `<generator>Astro</generator>`,
      `<docs>https://www.rssboard.org/rss-specification</docs>`,
      `<ttl>${FEED_TTL_MINUTES}</ttl>`,
      `<atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
      channelImage,
    ]
      .filter(Boolean)
      .join("\n"),
  });
};
