// RSS 2.0 feed with full article content and featured-image metadata.
//
// Channel: Atom self-link, Dublin Core + Media RSS namespaces, feed
// language from `config.site.locale`, `lastBuildDate` (build time) and
// `ttl` refresh hint. Items: canonical links, `pubDate`, categories,
// `dc:creator` (+ `<author>` only when a resolved author email exists),
// `content:encoded` with the post's rendered HTML (sanitized, absolute
// URLs), and `media:content` / `media:thumbnail` for the post's own
// featured image. Draft / noindex / future-dated posts are excluded,
// exactly as the sitemap and search index exclude them.
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import config from "@/config/config.json";
import rss, { type RSSFeedItem } from "@astrojs/rss";
import { getCollection, render } from "astro:content";
import type { APIRoute } from "astro";
import { displayAuthorNames, resolveAuthors } from "@/lib/utils/authors";
import {
  authorElements,
  escapeXml,
  mediaTags,
  sanitizeFeedHtml,
  toRssLanguage,
} from "@/lib/utils/rss";
import { absoluteUrl, canonicalFor } from "@/lib/utils/seo";
import { postUrl } from "@/lib/utils/slug";

const FEED_PATH = "/rss.xml";
const FEED_TTL_MINUTES = 60;

export const GET: APIRoute = async (context) => {
  const now = new Date();
  const site = context.site?.toString() ?? config.site.base_url;
  const feedUrl = absoluteUrl(FEED_PATH);

  const [posts, authors] = await Promise.all([
    getCollection(
      "blog",
      ({ data, id }) =>
        !data.draft &&
        !data.noindex &&
        !id.startsWith("-") &&
        (!data.date || new Date(data.date) <= now),
    ),
    getCollection("authors"),
  ]);

  // Newest first; undated posts sort last. Copy before sorting so the
  // collection result is not mutated.
  const sorted = [...posts].sort((a, b) => {
    const aTime = a.data.date ? new Date(a.data.date).valueOf() : 0;
    const bTime = b.data.date ? new Date(b.data.date).valueOf() : 0;
    return bTime - aTime;
  });

  // One container renders every post's markdown to the exact HTML the
  // page serves (same remark/rehype pipeline, incl. syntax highlighting).
  const container = await AstroContainer.create();

  const items: RSSFeedItem[] = [];
  for (const post of sorted) {
    const { Content } = await render(post);
    const content = sanitizeFeedHtml(await container.renderToString(Content));
    const { author, dcCreators } = authorElements(
      resolveAuthors(displayAuthorNames(post), authors),
    );
    const customData = [dcCreators, mediaTags(post.data)]
      .filter(Boolean)
      .join("\n");
    items.push({
      title: post.data.title,
      description: post.data.description ?? post.data.excerpt ?? "",
      link: canonicalFor(postUrl(post)),
      pubDate: post.data.date ? new Date(post.data.date) : undefined,
      // RSS 2.0's <author> is intended for an email address. For a
      // display-name author, Dublin Core's dc:creator is used instead
      // (see authorElements in src/lib/utils/rss.ts).
      ...(author ? { author } : {}),
      ...(content ? { content } : {}),
      ...(customData ? { customData } : {}),
      categories: post.data.categories,
    });
  }

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
    customData: [
      `<language>${toRssLanguage(config.site.locale, config.site.language)}</language>`,
      `<lastBuildDate>${now.toUTCString()}</lastBuildDate>`,
      `<generator>Astro</generator>`,
      `<docs>https://www.rssboard.org/rss-specification</docs>`,
      `<ttl>${FEED_TTL_MINUTES}</ttl>`,
      `<atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    ].join("\n"),
  });
};
