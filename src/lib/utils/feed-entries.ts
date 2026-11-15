// Shared feed entries for rss.xml, atom.xml and feed.json. Posts are
// filtered, sorted, rendered and sanitized ONCE here (same rules as the
// RSS feed), so the three feeds share one render pass per build instead
// of each doing its own. Nothing here formats output — each endpoint
// shapes these entries into its own format. Feeds are therefore
// automatic: publish or edit a post and the next build serves it in
// all three feeds, with no manual feed updates.
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { getCollection, render } from "astro:content";
import config from "@/config/config.json";
import { displayAuthorNames, resolveAuthors } from "@/lib/utils/authors";
import {
  latestChangeDate,
  localImageDimensions,
  mediaTags,
  sanitizeFeedHtml,
  sortFeedPosts,
} from "@/lib/utils/rss";
import { absoluteUrl, canonicalFor, resolveOgImage } from "@/lib/utils/seo";
import {
  lastChangeDate,
  publicationDate,
  resolveContentDates,
} from "@/lib/utils/dates";
import { postUrl } from "@/lib/utils/slug";

// A feed is a rolling window, not an archive: cap it so the files stay
// small as the blog grows. The cap lives in config.json (`feeds.limit`,
// default 20) so it can be changed without touching code — 20 items keeps
// even full-content feeds under a megabyte; readers fetch the rest from
// the site. All three endpoints use getFeedEntries, so this is the
// single cap.
const configuredLimit = Number(config.feeds?.limit ?? 20);
export const FEED_LIMIT =
  Number.isInteger(configuredLimit) && configuredLimit > 0
    ? configuredLimit
    : 20;

export interface FeedAuthor {
  name: string;
  /** Absolute author-page URL, when the author resolves to the collection. */
  url?: string;
}

export interface FeedEntry {
  url: string;
  title: string;
  summary: string;
  contentHtml: string;
  /** First publication date, when the post has one. */
  published?: Date;
  /** Last change (`dateModified` else `datePublished`); undefined when the post carries no date at all. */
  modified?: Date;
  authors: FeedAuthor[];
  categories: string[];
  /** Absolute featured-image URL — only when the post has its own image. */
  image?: string;
  /** Ready-made <media:content>/<media:thumbnail> tags (RSS + Atom). */
  mediaXml: string;
}

export interface FeedData {
  entries: FeedEntry[];
  /** Newest change across the entries; undefined when no entry has a date (callers omit the timestamp, never the build time). */
  updated?: Date;
}

async function load(): Promise<FeedData> {
  const now = new Date();

  const [posts, authors] = await Promise.all([
    getCollection("blog", ({ data, id }) => {
      // Future-dated content stays out until its publication date
      // (creation only as a fallback) is reached.
      const pub = publicationDate(resolveContentDates(data));
      return (
        !data.draft &&
        !data.noindex &&
        !id.startsWith("-") &&
        (!pub || pub <= now)
      );
    }),
    getCollection("authors"),
  ]);

  const sorted = sortFeedPosts(posts).slice(0, FEED_LIMIT);
  const updated = latestChangeDate(sorted);

  // One container renders every post's markdown to the exact HTML the
  // page serves (same remark/rehype pipeline, incl. syntax highlighting).
  const container = await AstroContainer.create();

  const entries: FeedEntry[] = [];
  for (const post of sorted) {
    const { Content } = await render(post);
    const contentHtml = sanitizeFeedHtml(
      await container.renderToString(Content),
    );

    const { url: imageUrl, isPageImage } = resolveOgImage(post.data);
    const dimensions = isPageImage
      ? await localImageDimensions(imageUrl)
      : null;
    const dates = resolveContentDates(post.data);

    entries.push({
      url: canonicalFor(postUrl(post)),
      title: post.data.title,
      summary: post.data.description ?? post.data.excerpt ?? "",
      contentHtml,
      published: dates.datePublished,
      modified: lastChangeDate(dates),
      // Display names only — author emails are never exposed in feeds.
      authors: resolveAuthors(displayAuthorNames(post), authors).map((a) => ({
        name: a.name,
        ...(a.url ? { url: absoluteUrl(a.url) } : {}),
      })),
      categories: post.data.categories ?? [],
      // The site-default OG image is not a post's featured image, so it
      // is never emitted here — only the post's own image.
      image: isPageImage ? absoluteUrl(imageUrl) : undefined,
      mediaXml: mediaTags(post.data, dimensions),
    });
  }

  return { entries, updated };
}

let cache: Promise<FeedData> | undefined;

// Cached within one production build (rss.xml + atom.xml + feed.json
// share it); in dev it is recomputed so content edits show up immediately.
export function getFeedEntries(): Promise<FeedData> {
  if (!import.meta.env.PROD) return load();
  return (cache ??= load());
}
