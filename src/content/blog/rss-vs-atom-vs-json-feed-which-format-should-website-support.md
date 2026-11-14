---
title: "RSS vs Atom vs JSON Feed: Which Format Should Your Website Support?"
meta_title: "RSS vs Atom vs JSON Feed: Which to Support?"
description: "Compare RSS 2.0, Atom and JSON Feed: required fields, dates, content rules and reader support, and decide which feed formats your website should publish."
date: 2026-11-07T05:00:00Z
image: "/images/blog/rss-vs-atom-vs-json-feed-which-format-should-website-support-feature.jpg"
og_image: "/images/blog/rss-vs-atom-vs-json-feed-which-format-should-website-support-og.jpg"
og_title: "RSS vs Atom vs JSON Feed: Which Format to Support?"
og_description: "RSS, Atom and JSON Feed compared field by field, with a real three-format example and a practical decision guide for your site."
categories: ["SEO"]
author: "Muhammad Zaheer Ahmad"
tags: ["rss", "atom", "json-feed"]
draft: false
---

A web feed is a machine-readable list of your newest content that readers and apps can check on their own schedule. You publish a post once, and every subscriber finds out about it without visiting your homepage or handing over an email address. That simple idea has produced three competing formats: RSS 2.0, Atom, and JSON Feed. They all do the same job, and choosing badly means some of your audience never sees your work.

This article compares the three formats using the actual specifications: the [RSS 2.0 specification](https://www.rssboard.org/rss-specification) from the RSS Advisory Board, [RFC 4287](https://hjp.at/doc/rfc/rfc4287.html), which standardised Atom, and the [JSON Feed 1.1 specification](https://www.jsonfeed.org/version/1.1/).

## What a web feed actually does

A feed is a document your site serves at a stable URL, usually `/rss.xml`, `/atom.xml` or `/feed.json`. It lists your recent items — blog posts, podcast episodes, release notes — newest first, each with a title, a link, a publication date and a stable identifier. A feed reader polls that URL and shows the reader only what is new.

That polling model is the whole point. Unlike a social timeline, no algorithm decides what subscribers see, and unlike email, nobody hands over an address to subscribe. The reader pulls; you never push. A feed is also a public document, so it should never contain drafts or personal data such as author email addresses.

Feeds are also discovered from the page head:

```html
<link
  rel="alternate"
  type="application/rss+xml"
  title="Astroplate Blog (RSS)"
  href="/rss.xml"
/>
<link
  rel="alternate"
  type="application/atom+xml"
  title="Astroplate Blog (Atom)"
  href="/atom.xml"
/>
<link
  rel="alternate"
  type="application/feed+json"
  title="Astroplate Blog (JSON Feed)"
  href="/feed.json"
/>
```

One shared idea matters before the formats diverge: the identifier. Every format gives each item a permanent ID — `guid` in RSS, `id` in Atom and JSON Feed — and readers use it to decide whether an item is new. Change an ID and readers will show the post again as new; reuse one and they may never show the new post. Pick an ID that never changes, usually the post's permanent URL.

## RSS 2.0: the format everybody already supports

RSS stands for Really Simple Syndication. RSS 2.0 is an XML document with a root `<rss version="2.0">` element containing a single `<channel>`, which holds one `<item>` per post. The current specification is version 2.0.11, published by the RSS Advisory Board on 30 March 2009 and frozen for practical purposes: later revisions clarify the text rather than adding features.

The rules are deliberately loose. A channel needs exactly three things — `title`, `link` and `description` — and an item needs only one of `title` or `description`. In practice, a useful item carries a title, a link, a publication date and a permanent `guid`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Astroplate Blog</title>
    <link>https://astroplate.jadoo.bond/blog</link>
    <description>Notes on building fast websites with Astro.</description>
    <lastBuildDate>Tue, 05 Apr 2022 05:00:00 GMT</lastBuildDate>
    <item>
      <title>How to Improve Core Web Vitals in Astro Websites</title>
      <link>https://astroplate.jadoo.bond/blog/improve-core-web-vitals-astro-websites</link>
      <guid isPermaLink="true">https://astroplate.jadoo.bond/blog/improve-core-web-vitals-astro-websites</guid>
      <pubDate>Tue, 05 Apr 2022 05:00:00 GMT</pubDate>
      <description>A short summary of the post.</description>
    </item>
  </channel>
</rss>
```

Three details deserve attention. First, dates use the RFC 822 format — `Tue, 05 Apr 2022 05:00:00 GMT` — fussier than the ISO-style dates the other formats use; a malformed date is a common reason a feed fails validation. Second, `guid` with `isPermaLink="true"` says the identifier is also the post's URL, the recommended practice. Third, RSS grows through namespaces, not new versions: extra capability lives in a declared namespace, never in a changed core.

The most important namespace is `content:encoded`. RSS's plain `description` is a summary; `content:encoded` carries the full rendered HTML of the post, so readers can show the whole article. Most blogs should publish the full post, with relative links and image URLs converted to absolute ones, because a reader has no base URL to resolve them against.

RSS also has the widest support. Every feed reader reads it, and every podcast directory is built on it: the `<enclosure>` element, which attaches an audio or video file with its URL, byte length and MIME type, made podcast distribution possible. Its weaknesses are the price of that age: two valid feeds can behave differently, dates are awkward, HTML content has no declared type, and there is no standard way to say "this item was updated". The `author` element holds an email address — a privacy trap — so a careful publisher leaves author emails out of RSS entirely.

## Atom: the stricter, IETF-standardised XML format

Atom was created to fix RSS's ambiguities. It is an XML format standardised by the IETF as [RFC 4287](https://hjp.at/doc/rfc/rfc4287.html) in December 2005, which means it has the precision of a protocol specification rather than the informality of a community document. Where RSS says "at least one of title or description", Atom says exactly what is required, and a document that omits it is invalid.

Every Atom feed needs an `id`, a `title` and an `updated` timestamp, plus an author at the feed level unless every entry carries its own. Every entry needs the same three, plus content, a link to the content, or a summary. That `updated` field is a real improvement over RSS: it records the most recent modification, while the optional `published` field records when the entry first appeared — so a reader can tell an edited post from a new one.

```xml
<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Astroplate Blog</title>
  <link href="https://astroplate.jadoo.bond/blog" />
  <link rel="self" href="https://astroplate.jadoo.bond/atom.xml" />
  <updated>2022-04-05T05:00:00Z</updated>
  <id>https://astroplate.jadoo.bond/blog</id>
  <author><name>John Doe</name></author>
  <entry>
    <title>How to Improve Core Web Vitals in Astro Websites</title>
    <link href="https://astroplate.jadoo.bond/blog/improve-core-web-vitals-astro-websites" />
    <id>https://astroplate.jadoo.bond/blog/improve-core-web-vitals-astro-websites</id>
    <updated>2022-04-05T05:00:00Z</updated>
    <summary>A short summary of the post.</summary>
    <content type="html">&lt;p&gt;The full post, escaped.&lt;/p&gt;</content>
  </entry>
</feed>
```

Four Atom habits are worth copying even if you never publish Atom. Links say what they are: the `rel` attribute distinguishes the `alternate` link to the page, the `self` link to the feed, and `enclosure` links to attached media. Dates use RFC 3339 — `2022-04-05T05:00:00Z` — one fixed format with no ambiguity about time zones. Content declares its type, so a reader never has to guess whether a blob of text is markup or prose. And the author is a person construct with a `name` and an optional `email`, so you can credit someone without publishing their address.

The cost is verbosity and a smaller ecosystem: fewer tools generate Atom, and almost nothing depends on Atom alone — podcasting, for example, is an RSS world. Atom is the best-specified format and the least necessary on its own, which is why it makes sense as the second format in a set, not the only one.

## JSON Feed: the developer-friendly format

JSON Feed is the newest and most pragmatic of the three. Created by Brent Simmons and Manton Reece, it first appeared in May 2017; version 1.1 followed in August 2020, adding an `authors` array and a `language` field. The idea is simple: syndication is a list that changes over time, and the people who build readers are fluent in JSON, so why make them parse XML?

A JSON Feed is a single JSON object. The required top-level fields are `version` — always the string `https://jsonfeed.org/version/1.1` for version 1.1 — `title`, and `items`. Each item needs an `id` that is unique within the feed and never reused, plus at least one of `content_html` or `content_text`. In practice an item also carries a `url`, a `title` and a `date_published`:

```json
{
  "version": "https://jsonfeed.org/version/1.1",
  "title": "Astroplate Blog",
  "home_page_url": "https://astroplate.jadoo.bond/blog",
  "feed_url": "https://astroplate.jadoo.bond/feed.json",
  "language": "en-US",
  "items": [
    {
      "id": "https://astroplate.jadoo.bond/blog/improve-core-web-vitals-astro-websites",
      "url": "https://astroplate.jadoo.bond/blog/improve-core-web-vitals-astro-websites",
      "title": "How to Improve Core Web Vitals in Astro Websites",
      "content_html": "<p>The full post, as HTML.</p>",
      "date_published": "2022-04-05T05:00:00Z",
      "authors": [
        {
          "name": "John Doe",
          "url": "https://astroplate.jadoo.bond/authors/john-doe"
        }
      ],
      "tags": ["astro", "core-web-vitals", "performance"]
    }
  ]
}
```

The advantages are all about the developer experience. There is no XML escaping to get wrong, no namespace to declare, and any language can parse the feed with its built-in JSON parser. Content type is explicit: `content_html` is HTML and `content_text` is plain text. Dates are RFC 3339, as in Atom. Authors are objects with `name`, `url` and `avatar` — no email field at all. Extensions are plain JSON: any property starting with an underscore is custom. Attachments, the equivalent of RSS enclosures, are objects with a `url` and a `mime_type`.

The trade-off is reach. JSON Feed is supported by respected readers — NetNewsWire, Feedly, NewsBlur and Reeder — but it is not the default format anywhere. No podcast directory runs on it, and a reader written before 2017 will not know it exists. The specification is also short and leaves more to convention: `title`, for example, is optional, because microblog posts often have no title.

## The three formats, side by side

The table below states what each specification actually requires, not what a typical feed happens to include.

| Feature         | RSS 2.0                         | Atom (RFC 4287)                        | JSON Feed 1.1                       |
| --------------- | ------------------------------- | -------------------------------------- | ----------------------------------- |
| Syntax          | XML                             | XML                                    | JSON                                |
| Current version | 2.0.11 (2009, frozen)           | RFC 4287 (2005)                        | 1.1 (2020)                          |
| Item identifier | `guid` (optional, recommended)  | `id` (required)                        | `id` (required)                     |
| Item title      | Optional (title or description) | Required                               | Optional                            |
| Full content    | `content:encoded` (namespace)   | `content` with declared `type`         | `content_html` / `content_text`     |
| Published date  | `pubDate`, RFC 822              | `published`, RFC 3339                  | `date_published`, RFC 3339          |
| Updated date    | Not standardised                | `updated` (required), RFC 3339         | `date_modified`, RFC 3339           |
| Author          | `author` (email address)        | `author` person (name, optional email) | `authors` array (name, url, avatar) |
| Media / podcast | `<enclosure>`                   | `<link rel="enclosure">`               | `attachments` array                 |
| Extension model | XML namespaces                  | XML namespaces                         | `_`-prefixed properties             |
| Served as       | `application/rss+xml`           | `application/atom+xml`                 | `application/feed+json`             |

![Comparison of RSS 2.0, Atom and JSON Feed across syntax, identifiers, dates, content and authors](/images/blog/rss-vs-atom-vs-json-feed-which-format-should-website-support-diagram-1.png)

RSS is the loosest and most widely supported. Atom is the strictest and most precise. JSON Feed is the simplest to produce and consume, and the least widely supported. No format wins on every row, which is why the practical answer is usually more than one format.

## Which format should your website support?

Start with your audience. If your content is a podcast, RSS is not optional: podcast directories are built around RSS enclosures, and neither Atom nor JSON Feed will get your show listed. If developers consume your content programmatically — a status page, a changelog — JSON Feed is the kindest format, because they can parse it without an XML library. If your content is frequently corrected, Atom's required `updated` field expresses that in a way RSS cannot.

For most blogs, the sensible default is RSS first, then add the other two. RSS alone covers the most readers and tools. Add Atom for strict validation, explicit update timestamps and typed links. Add JSON Feed when your audience includes developers. Publishing all three is little extra work if they are generated from one shared set of entries, and a lot of duplicated work if each is hand-maintained separately.

That decides the implementation. Never maintain three separate feed templates that each query your content independently. Build one list of feed entries — title, URL, dates, rendered HTML, authors, image — and render it three ways. A new post then appears in all three feeds automatically, a correction updates all three at once, and the shared pipeline enforces the rules that matter in every format: stable IDs, absolute URLs, sanitised HTML, and no author emails.

![One shared feed pipeline rendering the same entries as RSS, Atom and JSON Feed](/images/blog/rss-vs-atom-vs-json-feed-which-format-should-website-support-diagram-2.png)

## A real example: one pipeline, three feeds

This site is a working example. Its three feeds — [/rss.xml](/rss.xml), [/atom.xml](/atom.xml) and [/feed.json](/feed.json) — are built from one shared pipeline, so the same post appears in each format with the same title, URL, dates and content. The RSS feed carries the full post in `content:encoded`, with media tags for the featured image, and the author is credited by display name only — no author email appears in any feed. The Atom feed adds the explicit `updated` timestamp; the JSON Feed carries the same content in `content_html`. Drafts, unlisted posts and future-dated posts are excluded from all three feeds, the sitemap and the search index alike.

Open [/rss.xml](/rss.xml), [/atom.xml](/atom.xml) and [/feed.json](/feed.json) to compare the same post in all three shapes. The same discipline applies to the surrounding [technical SEO work](/blog/technical-seo-astro-websites-sitemaps-canonicals-structured-data): feeds, sitemaps and canonical URLs all describe the same content, so they should all come from the same source of truth.

## Publishing checklist: getting feeds right

**Keep identifiers stable.** Use the post's permanent URL as the ID and never change it, even if the title or slug changes. A changed ID is a duplicate post in every subscriber's reader.

**Use absolute URLs everywhere.** Links and image URLs inside feed content must be absolute, including the scheme and domain. A reader has no page URL to resolve a relative link against, so `/images/photo.jpg` in a feed is a broken image.

**Get the dates right.** RSS dates must be RFC 822 with a time zone; Atom and JSON Feed dates must be RFC 3339. Let a date library format the timestamp, and make sure your feed-level `lastBuildDate` or `updated` changes when content changes.

**Sanitise the HTML.** Full-content feeds embed rendered HTML, so strip scripts and event handlers, while keeping the markup that makes the post readable: paragraphs, headings, code blocks, links and images.

**Do not expose author emails.** RSS's `author` element is defined as an email address, which is why the careful choice is to omit it or credit authors by display name. Atom and JSON Feed let you credit a name and a URL without an address.

**Cap the feed and sort newest first.** A feed is a window onto recent content, not an archive dump. Fifty items is a common cap — the JSON Feed specification notes that a feed under 100 KB is ideal and that a 1 MB feed burdens readers.

**Validate before you publish.** Run each feed through a validator — the [W3C Feed Validation Service](https://validator.w3.org/feed/) for RSS and Atom, and the [JSON Feed validator](https://validator.jsonfeed.org) for JSON Feed — and check again after any template change, because one small edit can break all three formats at once. Advertise the feeds with the `<link rel="alternate">` elements from the start of this article, using the correct MIME type for each format.

If your posts live in [Astro content collections](/blog/astro-content-collections-complete-guide-managing-blog-content), the collection already gives you the title, date, slug and rendered body each feed needs — the feed templates are then thin renderers over data you already have, which keeps three formats in sync.

## Frequently asked questions

### Do I need RSS, Atom and JSON Feed, or is one enough?

One is enough to be read, and RSS is the one to pick if you only publish one — it has the widest reader and tool support. Publish all three when they are rendered from one shared entry list, because each reaches a slightly different audience: RSS reaches every reader and podcast client, Atom reaches standards-minded readers, and JSON Feed reaches developers.

### Is RSS dead?

No. RSS usage is smaller than at the peak of the blog era, but the format is frozen rather than abandoned, every major feed reader still supports it, and podcasting runs on RSS enclosures. A technology that is stable, specified and universally supported is not dead; it is finished.

### Can I publish a JSON Feed without publishing RSS?

Yes. A valid feed needs only a version, a title and items with IDs and content. The question is reach, not validity: some older readers and automation tools only understand RSS, so a JSON-only site will be invisible to them. If your audience is developers using modern readers, JSON-only is reasonable.

### Why do Atom and JSON Feed use RFC 3339 dates while RSS uses RFC 822?

History. RSS inherited its date format from email, where RFC 822 was already standard. Atom and JSON Feed came later, when the ISO 8601 profile RFC 3339 had become the standard timestamp format for web protocols. RFC 3339 is unambiguous — `2022-04-05T05:00:00Z` can only mean one thing — while RFC 822 dates depend on weekday and month abbreviations that are easy to get subtly wrong.

### Should my feed contain the full post or just a summary?

Publish the full post unless you have a specific reason not to — it is what `content:encoded`, Atom `content` and JSON Feed `content_html` exist for. Use a summary only when the content is paywalled, when the post depends on interactive elements that cannot survive in a reader, or when you want the feed to drive traffic back to your site. Whichever you choose, apply it consistently and sanitise the HTML first.
