// RSS 2.0 feed with full article content and featured-image metadata.
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
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import config from "@/config/config.json";
import rss, { type RSSFeedItem } from "@astrojs/rss";
import { getCollection, render } from "astro:content";
import type { APIRoute } from "astro";
import { displayAuthorNames, resolveAuthors } from "@/lib/utils/authors";
import {
  dcCreatorTags,
  escapeXml,
  feedLastBuildDate,
  localImageDimensions,
  mediaTags,
  sanitizeFeedHtml,
  sortFeedPosts,
  toRssLanguage,
} from "@/lib/utils/rss";
import { absoluteUrl, canonicalFor, resolveOgImage } from "@/lib/utils/seo";
import { postUrl } from "@/lib/utils/slug";

const FEED_PATH = "/rss.xml";
const FEED_TTL_MINUTES = 60;
// A feed is a rolling window, not an archive: cap it so the file stays
// small as the blog grows.
const FEED_LIMIT = 50;

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

  // Newest first, undated posts last, same-date posts by id (stable
  // across builds); capped at FEED_LIMIT.
  const sorted = sortFeedPosts(posts).slice(0, FEED_LIMIT);

  // One container renders every post's markdown to the exact HTML the
  // page serves (same remark/rehype pipeline, incl. syntax highlighting).
  const container = await AstroContainer.create();

  const items: RSSFeedItem[] = [];
  for (const post of sorted) {
    const { Content } = await render(post);
    const content = sanitizeFeedHtml(await container.renderToString(Content));
    const dcCreators = dcCreatorTags(
      resolveAuthors(displayAuthorNames(post), authors),
    );
    const { url: imageUrl, isPageImage } = resolveOgImage(post.data);
    const dimensions = isPageImage
      ? await localImageDimensions(imageUrl)
      : null;
    const customData = [dcCreators, mediaTags(post.data, dimensions)]
      .filter(Boolean)
      .join("\n");
    items.push({
      title: post.data.title,
      description: post.data.description ?? post.data.excerpt ?? "",
      link: canonicalFor(postUrl(post)),
      pubDate: post.data.date ? new Date(post.data.date) : undefined,
      ...(content ? { content } : {}),
      ...(customData ? { customData } : {}),
      categories: post.data.categories,
    });
  }

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
    customData: [
      `<language>${toRssLanguage(config.site.locale, config.site.language)}</language>`,
      `<lastBuildDate>${feedLastBuildDate(sorted, now)}</lastBuildDate>`,
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
