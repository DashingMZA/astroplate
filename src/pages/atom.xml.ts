// Atom 1.0 feed (RFC 4287). Same entries, order and content as rss.xml;
// authors are display names only (no emails). Entries come from the
// shared pipeline (`src/lib/utils/feed-entries.ts`, one render pass for
// all three feeds). The XML is built by hand — @astrojs/rss only
// produces RSS 2.0 — so every interpolated value is escaped.
import config from "@/config/config.json";
import type { APIRoute } from "astro";
import { getFeedEntries } from "@/lib/utils/feed-entries";
import { escapeXml, toBcp47 } from "@/lib/utils/rss";
import { absoluteUrl } from "@/lib/utils/seo";

const FEED_PATH = "/atom.xml";

export const GET: APIRoute = async () => {
  // Home URL without a trailing slash, matching the RSS channel link
  // (trailing_slash is false for this site).
  const homeUrl = absoluteUrl("/").replace(/\/+$/, "");
  const feedUrl = absoluteUrl(FEED_PATH);
  const language = toBcp47(config.site.locale, config.site.language);
  const { entries, updated } = await getFeedEntries();

  const entriesXml = entries.map((e) =>
    [
      "<entry>",
      `<title>${escapeXml(e.title)}</title>`,
      `<link rel="alternate" type="text/html" href="${escapeXml(e.url)}" />`,
      `<id>${escapeXml(e.url)}</id>`,
      e.published ? `<published>${e.published.toISOString()}</published>` : "",
      // <updated> is required per entry; an undated post falls back to
      // the feed's updated date.
      `<updated>${(e.modified ?? updated).toISOString()}</updated>`,
      ...e.authors.map(
        (a) => `<author><name>${escapeXml(a.name)}</name></author>`,
      ),
      e.summary ? `<summary>${escapeXml(e.summary)}</summary>` : "",
      e.contentHtml
        ? `<content type="html">${escapeXml(e.contentHtml)}</content>`
        : "",
      ...e.categories.map((c) => `<category term="${escapeXml(c)}" />`),
      e.mediaXml,
      "</entry>",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  const xml = [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" xml:lang="${escapeXml(language)}">`,
    `<title>${escapeXml(config.site.title)}</title>`,
    `<subtitle>${escapeXml(config.metadata.meta_description)}</subtitle>`,
    `<link rel="alternate" type="text/html" href="${escapeXml(homeUrl)}" />`,
    `<link rel="self" type="application/atom+xml" href="${escapeXml(feedUrl)}" />`,
    `<id>${escapeXml(feedUrl)}</id>`,
    `<updated>${updated.toISOString()}</updated>`,
    `<generator>Astro</generator>`,
    config.site.favicon
      ? `<icon>${escapeXml(absoluteUrl(config.site.favicon))}</icon>`
      : "",
    config.site.logo
      ? `<logo>${escapeXml(absoluteUrl(config.site.logo))}</logo>`
      : "",
    // Feed-level author: valid fallback for entries without their own.
    `<author><name>${escapeXml(config.site.title)}</name></author>`,
    ...entriesXml,
    `</feed>`,
  ]
    .filter(Boolean)
    .join("\n");

  return new Response(xml, {
    headers: { "Content-Type": "application/atom+xml; charset=utf-8" },
  });
};
