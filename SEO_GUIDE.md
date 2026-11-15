# SEO Guide

All SEO output is generated at build time from `src/config/config.json`
and post frontmatter. The single source of truth is
`src/layouts/Base.astro`, which every page renders through; post
pages add article metadata in `src/pages/blog/[single].astro`, URL
helpers live in `src/lib/utils/seo.ts`, and ALL social metadata
(titles, descriptions, images, alt text — OG, Twitter/X and
Pinterest) is resolved by the single centralized resolver in
`src/lib/utils/social.ts`. No layout, component or page re-implements
a fallback chain; see that file's header comment for the exact
priorities.

## What is emitted per page type

### Every page (via `Base.astro`)

| Tag | Value / rule |
| --- | --- |
| `<meta charset>` | `utf-8` |
| `<title>` | `seoTitle`, else `meta_title`, else `title`, else site title (plain-text, HTML stripped) |
| `<link rel="canonical">` | Always emitted. Defaults to the page's own URL (`base_url` + `base_path` + pathname, honouring `trailing_slash`); an explicit `canonical` prop overrides it (absolute URL or site-relative path) |
| `<link rel="prev">` / `<link rel="next">` | Blog listing pagination only (`/blog` → page 2, page N ↔ N±1; page 2's prev is `/blog`, never `/blog/page/1`) |
| `<meta name="description">` | `seoDescription`, else `description`, else `excerpt`, else site `metadata.meta_description` |
| `<meta name="author">` | Site `metadata.meta_author` |
| `og:title` | `ogTitle` (or legacy `og_title`), else `seoTitle` / `meta_title`, else `title`, else site title |
| `og:description` | `ogDescription` (or `og_description`), else `seoDescription`, else `description`, else `excerpt`, else site default |
| `og:type` | `"website"`, except `"article"` on blog posts |
| `og:url` | The canonical URL |
| `og:site_name` | Site title |
| `og:locale` | Site `locale` (default `"en_US"`) |
| `og:image` | `ogImage` (or `og_image`), else `image`, else site `metadata.meta_image` — resolved to an absolute URL. Absolute URLs are never prefixed with the site domain |
| `og:image:secure_url` | Same as `og:image` when the URL is https |
| `og:image:type` / `:width` / `:height` | Verified from the actual image file with sharp at build time (default OG image: 1200×630 `image/webp`). Remote images carry no dimensions — omitted, never invented |
| `og:image:alt` | Platform alt → OG alt → image alt → page title → site `metadata.meta_image_alt` |
| `twitter:card` | `summary_large_image` (an image always resolves — at minimum the configured default) |
| `twitter:title` / `twitter:description` | Independent fields (`twitterTitle` / `twitterDescription`), each falling back through OG → SEO → title/description |
| `twitter:image` / `twitter:image:alt` | Independent (`twitterImage` → `ogImage` → featured → site `metadata.meta_twitter_image`); alt follows the same chain as OG |
| `twitter:site` / `twitter:creator` | From `config.social` (`twitter_site` / `twitter_creator`); currently `@Dashing_ZB` (the linked X profile). Omitted when unconfigured — never invented |
| Pinterest | No standard Pinterest meta tags exist — Pinterest reads the OG tags above. The Pin button (`Share.astro`) uses the resolved Pinterest title / description / image (`pinterestTitle` → `ogTitle` → …; `pinterestImage` → `ogImage` → …). No dedicated vertical Pin image is configured, so Pins inherit the OG image |
| Favicon / touch icon / manifest | `config.site.favicon` (`rel="shortcut icon"`), `/apple-touch-icon.png` (180×180, generated from the favicon), `/manifest.webmanifest` |
| RSS / Atom / JSON discovery | `<link rel="alternate">` for `/rss.xml`, `/atom.xml`, `/feed.json` |
| `<html lang>` | Site `language` (default `"en"`) |
| Skip link | “Skip to content” link to `#main-content` (first focusable element) |
| `<meta name="robots">` | Only when a page sets `noindex: true`: `noindex,follow`. The page is also excluded from the sitemap, RSS, search index, and LLM docs |

### Blog posts only (via `src/pages/blog/[single].astro` + `Base.astro`)

| Tag | Value / rule |
| --- | --- |
| `og:type` | `"article"` |
| `article:published_time` | Post `datePublished` (ISO) |
| `article:modified_time` | `dateModified`, else `datePublished` (ISO) |
| `article:author` | One tag per author (`authors` array, else `author`) |
| `article:section` | First category |
| `article:tag` | One tag per tag |
| JSON-LD `Article` | Exactly one per post (see below) |

### JSON-LD

Every page emits exactly one JSON-LD block — a single `@graph`
containing the site-wide `WebSite` + `Organization` blocks (from
`config.site` / `config.publisher`) plus any page-specific blocks,
rendered by `src/layouts/components/JsonLd.astro` (which escapes `</`
inside the JSON so a `</script>` sequence in content can never break
out of the script element). Blog posts add a `BlogPosting` block, and
pages that render breadcrumbs add a `BreadcrumbList`; author pages
add a `Person` block. There is no `SearchAction`: search is a
client-side modal, not a search-results page, so a query URL would
be fabricated.

Blog post `BlogPosting` (built in `src/pages/blog/[single].astro`,
authors resolved via `src/lib/utils/authors.ts`):

```json
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "url": "<site base_url>", "name": "<site title>" },
    { "@type": "Organization", "name": "<publisher.name>", "logo": { "@type": "ImageObject", "url": "<absolute logo URL>" }, "url": "<publisher.url>" },
    {
      "@type": "BlogPosting",
      "headline": "<post title>",
      "description": "<post description>",
      "image": ["<absolute image URL>"],
      "url": "<canonical post URL>",
      "mainEntityOfPage": "<canonical post URL>",
      "dateCreated": "<ISO date>",
      "datePublished": "<ISO date>",
      "dateModified": "<ISO date>",
      "author": [{ "@type": "Person", "name": "<author>", "url": "<author page URL>" }],
      "publisher": { "@type": "<publisher.type>", "name": "<publisher.name>" }
    }
  ]
}
```

- `image` uses `og_image` if set, else `image`, resolved to an
  absolute URL; omitted when the post has no image.
- `author` lists every entry of `authors`, or the single `author`,
  as `Person` objects with the author-page URL when the author file
  exists; an unresolvable name renders as a bare name with no URL.
- `publisher` comes from `config.json` (`publisher.name`,
  `publisher.type`, `publisher.logo`, `publisher.url`).
- `url` / `mainEntityOfPage` are the canonical post URL (custom slug
  included — see [CONTENT_SCHEMA.md](CONTENT_SCHEMA.md)).


### Sitemap

Generated by the config-driven sitemap engine (`src/lib/seo/sitemap/`),
served by the single dynamic route `src/pages/[sitemap].xml.ts` —
no `@astrojs/sitemap` integration, no SSR, nothing read at request
time (image references are existence-checked against `public/` once,
at build time). The files are generated during `astro build` as static
files in `dist/`, with Rank Math-style names (type first, `sitemap`
second; the index uses an underscore):

- `dist/sitemap_index.xml` lists the generated files (6 in the
  current build): `page-sitemap.xml` (16 URLs), `post-sitemap.xml`
  (10), `category-sitemap.xml` (7), `post_tag-sitemap.xml` (20),
  `author-sitemap.xml` (3), `image-sitemap.xml` (10 posts with
  their featured images).
- `/404` is excluded, as are any URL segments `draft`, `drafts`,
  `preview`, or `private` (see `sitemap.exclude` /
  `sitemap.exclude_segments` in `config.json`).
- `noindex: true` pages are excluded, as are draft and future-dated
  posts and posts with an external canonical URL. Duplicate public
  URLs (two posts, same slug) fail the build instead of publishing a
  colliding sitemap.
- Entries carry `lastmod` from `dateModified ?? datePublished`
  (authors: `dateModified ?? dateCreated`) when a date exists —
  never the build date. Index entries carry the newest genuine
  `lastmod` inside that file. Category/tag archive entries carry no
  `lastmod` (taxonomy pages have no content dates of their own).
- Image embedding (Yoast / Rank Math style): each post URL in
  `post-sitemap.xml` carries `<image:image>` blocks (`<image:loc>`
  only, no title) for its featured image, OG image and the images
  referenced in its body — 4 per post in the current build (featured
  + OG + 2 diagrams). Each
  page URL in `page-sitemap.xml` carries one when the page has an
  image (homepage banner on `/`, about banner on `/about`). Only
  images that resolve to a real file under `public/` are emitted, so
  a stale reference can never ship. Category, tag and author
  sitemaps carry no images (their archive pages have none), and
  `image-sitemap.xml` is unchanged: one OG image per post.
- Chunking: at most `sitemap.max_urls_per_sitemap` URLs (default
  1000) and 50 MB uncompressed per file; when a type splits, chunks
  are named `post-sitemap1.xml`, `post-sitemap2.xml`, … (numbered
  from 1, no hyphen) and the bare `post-sitemap.xml` is not
  generated — every chunk is registered in the index. Nothing is
  ever silently truncated.
- Types with no content in this project (`videos`, `news`,
  `products`, `locales`, `locations`) are disabled by default and
  generate no file and no index entry. Enable one only when the
  content (and a collector) exists.

See [CONFIGURATION.md](CONFIGURATION.md) for every `sitemap` option,
and `tests/sitemap.test.js` for the covered behaviour.

Verify after a build:

```bash
ls dist/*sitemap*.xml                     # expect 7 files (index + 6 types)
python3 -c "import xml.etree.ElementTree as ET, glob; [ET.parse(f) for f in glob.glob('dist/*sitemap*.xml')]"
grep -c "<url>" dist/post-sitemap.xml     # expect 10
grep -c "<image:image>" dist/post-sitemap.xml  # expect 40 (4 per post)
grep -c "404" dist/page-sitemap.xml       # expect 0
```

### `robots.txt`

`src/pages/robots.txt.ts` is a dynamic endpoint that renders
`dist/robots.txt` at build time from `config.json`:

```text
User-agent: *
Allow: /

Sitemap: https://astroplate.jadoo.bond/sitemap_index.xml
```

The `Sitemap:` line is built with the same `absoluteUrl()` helper as
canonicals and OG URLs, so it follows `site.base_url` (and `base_path`)
automatically — change the domain in `config.json` and rebuild; there is
no hard-coded copy to keep in sync. (The sitemap index filename itself
comes from `sitemap.index_filename` in `config.json`, default
`/sitemap_index.xml`.)

### Feeds (RSS, Atom, JSON Feed)

The three feeds share one pipeline — `src/lib/utils/feed-entries.ts`
(`getFeedEntries`, capped at the 50 newest posts) — so a published or
edited post appears in all three on the next build, with no manual
feed updates. Each endpoint only formats the shared entries into its
own format:

- `src/pages/rss.xml.ts` serves `/rss.xml` (RSS 2.0 via `@astrojs/rss`).
- `src/pages/atom.xml.ts` serves `/atom.xml` (Atom 1.0, built by hand
  with escaped interpolation — `@astrojs/rss` only produces RSS 2.0).
- `src/pages/feed.json.ts` serves `/feed.json` (JSON Feed 1.1).
- All three are advertised in the page head (`src/layouts/Base.astro`)
  with `<link rel="alternate">` so readers discover them.

Shared rules (all three feeds):

- Title = site title; description = site `meta_description`;
  link = site `base_url`.
- Items: title, description (else `excerpt`), link `/blog/<slug>`
  (custom slug when set, else filename — the same canonical URL as the
  post page, no trailing slash), `pubDate` / `published` /
  `date_published`, categories / `tags`.
- Author: display names only — RSS `dc:creator`, Atom `<author><name>`,
  JSON Feed `authors` with the author-page URL. No emails anywhere:
  RSS `<author>` is never emitted (it is an email address).
- Full content: every item carries the post's rendered HTML
  (`content:encoded` / `<content type="html">` / `content_html`) —
  same remark/rehype pipeline as the page, sanitized, relative
  image/link URLs made absolute. Pure helpers live in
  `src/lib/utils/rss.ts` and are unit-tested in `tests/rss.test.js`.
- Featured image: the post's own `og_image` (else `image`), with the
  MIME type from the file extension and real pixel dimensions when the
  image is a local file (read with `sharp` at build time). RSS/Atom
  use `<media:content>` + `<media:thumbnail>`; JSON Feed uses the
  `image` field. Remote images and posts without their own image get
  no dimensions / no media tags — dimensions are never invented, and
  the site-default OG image is never passed off as a featured image.
- `noindex: true` posts are excluded, like drafts and future-dated
  posts.
- Sorted newest first; same-date posts by id (stable across builds);
  undated posts sort last.

Per-feed notes:

- RSS channel: Atom self-link (`<atom:link rel="self">`), feed
  `<language>` from `site.locale`, `<lastBuildDate>` from the newest
  post's change (stable across rebuilds; omitted when no post carries
  a date — never the build time), `<ttl>60</ttl>`,
  `<generator>Astro</generator>`, and an `<image>` with the site logo
  (no width/height — the logo is 150px wide and the RSS spec caps the
  width element at 144).
- Atom feed: `xml:lang` from `site.locale` (BCP 47, e.g. `en-US`),
  `<updated>` from the newest post's change, per-entry `<updated>`
  from the post's own change (`dateModified ?? datePublished`, feed
  date as fallback — `<updated>` is required), `<icon>` (favicon)
  and `<logo>` (site logo).
- JSON Feed: `language` in BCP 47 form, `icon` (logo) and `favicon`,
  `date_modified` per item when the post carries a change date. JSON
  Feed 1.1 has no top-level `description` field, so none is emitted.

## Setting per-post SEO

Frontmatter fields (full reference in [CONTENT_SCHEMA.md](CONTENT_SCHEMA.md)):

```markdown
---
title: "How to Build a Modern Application with Next.js and Tailwind CSS"
meta_title: "Build a Modern App with Next.js and Tailwind CSS"
seoTitle: "Build a Modern App with Next.js and Tailwind CSS"
ogTitle: "Build a Modern App with Next.js + Tailwind"
twitterTitle: "Build a Modern App with Next.js + Tailwind"
description: "A practical guide to building a modern web application with Next.js and Tailwind CSS."
seoDescription: "Build a modern web application with Next.js and Tailwind CSS — a practical guide."
image: "/images/image-placeholder.png"
ogImage: "/images/og-image.jpg"
twitterImage: "/images/twitter-image.jpg"
pinterestImage: "/images/pin-image.jpg"
dateCreated: 2022-04-04T05:00:00Z
datePublished: 2022-04-04T05:00:00Z
dateModified: 2022-04-10T05:00:00Z
author: "John Doe"
authors: ["John Doe", "Sam Wilson"]
categories: ["Application", "Data"]
tags: ["nextjs", "tailwind"]
canonical: "https://example.com/blog/my-post/"
noindex: false
---
```

All social fields are optional; empty strings, `null` and
`undefined` all count as missing. The exact fallback chains live in
`src/lib/utils/social.ts` — nothing below duplicates them:

Rules:

- **`seoTitle` / `meta_title`** set the browser `<title>`:
  `seoTitle` > `meta_title` > `title` > site title. `ogTitle` does
  **not** fall back into `<title>` — it is the social title only.
- **`seoDescription`** sets the meta description:
  `seoDescription` > `description` > `excerpt` > site default.
- **`ogTitle`** sets `og:title`: `ogTitle` > `seoTitle` >
  `title` > site title. (Legacy `og_title` still works as an alias.)
- **`ogDescription`** sets `og:description`: `ogDescription` >
  `seoDescription` > `description` > `excerpt` > site default.
- **`twitterTitle` / `twitterDescription` / `twitterImage`** are
  independent: each falls back through OG → SEO → title/description/
  featured image. If only `ogImage` is set, Twitter inherits it; a
  `twitterImage` overrides Twitter only, never OG or Pinterest.
- **`pinterestTitle` / `pinterestDescription` / `pinterestImage`**
  are independent the same way (`pinterestImage` → `ogImage` →
  featured → site default). Pinterest reads the OG tags for its card;
  the Pin button also uses these resolved values. Recommended Pin
  size is 1000×1500 (2:3); no dedicated Pin image is configured yet,
  so Pins currently inherit the 1200×630 OG image.
- **`description`** is the source for the meta description, RSS
  description, and JSON-LD description. Keep it under ~160 characters.
- **`image` vs `ogImage`**: `image` is the on-page hero image;
  `ogImage` is what social shares show and wins for OG/Twitter and
  JSON-LD. Set `ogImage` when the share image should differ from
  the hero (e.g. a 1200×630 card vs a tall hero). Either may be a
  local path or an absolute URL — see [IMAGE_STORAGE.md](IMAGE_STORAGE.md).
  Image dimensions/MIME are verified from the actual file at build
  time; remote images carry no width/height/type.
- **`canonical`** accepts an absolute URL (`https://…`) or a
  site-relative path (`/blog/x`), resolved against `base_url` at
  render time. Use it when the same content exists elsewhere (e.g.
  cross-posted) and the other URL should get the ranking credit.
- **`noindex: true`** emits
  `<meta name="robots" content="noindex,follow">` (link-following is
  preserved) and excludes the page from the sitemap, RSS, search
  index, and LLM docs. The page is still built and still linked from
  the site — `noindex` only asks search engines not to index it.
  `noindex` exists on blog posts and on the page-like collections
  (`pages`, `about`, `contact`).
- **`dateCreated` / `datePublished` / `dateModified`** are the only
  date fields (see [CONTENT_DATES.md](CONTENT_DATES.md)). `dateCreated`
  is set once and never changes; `datePublished` is set on first
  publication (drafts have none); `dateModified` is updated on
  meaningful edits and feeds `article:modified_time`, JSON-LD
  `dateModified`, sitemap `<lastmod>` and the feeds. All three are
  ISO 8601 UTC (`…Z`); display dates render in UTC so local and
  Vercel builds agree.

Site-wide fallbacks live in `config.json` → `metadata`
(`meta_author`, `meta_image`, `meta_twitter_image`,
`meta_image_alt`, `meta_description`), `social`
(`twitter_site` / `twitter_creator`) and `publisher`. See
[CONFIGURATION.md](CONFIGURATION.md).

## Drafts and future posts — exclusion rules

A post is excluded from the build, the blog listing, the sitemap,
and the RSS feed when any of these hold:

- `draft: true` in frontmatter;
- `datePublished` is in the future at build time;
- the filename starts with `-`.

Preview them only with build flags (never for production):

```bash
npx astro build --buildDrafts
npx astro build --buildFuture
```

Note the flags are read from `process.argv` by
`src/lib/contentParser.ts`; they are not config options.

## Verifying the built output

All checks run against `dist/` after `pnpm build` — no live server
needed. `dist/` currently contains 30 HTML pages.

```bash
# Full automated check: titles, descriptions, canonical, OG/Twitter,
# image dimensions vs the actual files, alt text, H1, links, JSON-LD,
# structured-data dates vs RSS + sitemap, sitemap coverage
pnpm seo:check
```

```bash
# Canonical + OG/Twitter + JSON-LD on a post (manual spot checks)
grep -o '<link rel="canonical" href="[^"]*"' dist/blog/post-1/index.html
grep -o '<meta property="og:[^>]*>' dist/blog/post-1/index.html
grep -o '<meta name="twitter:[^>]*>' dist/blog/post-1/index.html
grep -o 'application/ld+json' dist/blog/post-1/index.html | wc -l   # expect 1

# JSON-LD is exactly one @graph block per page, with one BlogPosting
grep -c '"@type":"BlogPosting"' dist/blog/post-1/index.html   # expect 1

# No duplicated domain in OG images (absolute URLs stay verbatim)
grep -o '<meta property="og:image" content="[^"]*"' dist/blog/post-r2-example/index.html
# expect: https://media.csofts.tech/images/r2-example-og.jpg (no site domain prepended)

# Sitemap: 56 page URLs across 6 files, no /404
grep -o "<loc>[^<]*</loc>" dist/post-sitemap.xml
grep -c "404" dist/page-sitemap.xml   # expect 0

# Robots + RSS
cat dist/robots.txt
grep -o "<item>" dist/rss.xml | wc -l   # expect 5
```

After deploying, re-run the same checks against the live URLs and
spot-check one post with the social debuggers / rich-results test of
your choice (Facebook Sharing Debugger, X Card Validator, Google
Rich Results Test, Schema.org Validator, Google Search Console).
Social platforms cache OG data — use their refresh tools after
changing images or titles. These external validators need a public
URL and are manual steps; nothing in this repo claims rich-result
eligibility is guaranteed.

## Known SEO gaps (honest list)

- `featured` is accepted but has no featured-post UI — setting it
  changes nothing visible.
- No dedicated Pinterest vertical image (1000×1500, 2:3) is
  configured — Pins inherit the 1200×630 OG image.
- Three author files describe the same person
  (`muhammad-zaheer.md`, `muhammad-zaheer-ahmad.md`,
  `zaheer-ahmad.md`) with the identical title, so the validator
  reports duplicate titles for the three author pages. Consolidating
  them is a content decision, still open.
- No `SearchAction` JSON-LD: search is a client-side modal, not a
  search-results page.
- No multilingual / hreflang support — the site is single-language
  (`site.language` / `site.locale` only set `lang` and `og:locale`).
  No hreflang is emitted, deliberately: there are no alternate
  language versions to link to.
- No LocalBusiness schema — the site is a blog/theme, not a local
  business; no address, phone or coordinates exist to publish.
- Security headers are configured in the repo (see
  [SECURITY.md](SECURITY.md)), but they are served by the host, not
  by the theme — verify them against the live deployment, and note
  the Vercel deployment needs them added in the dashboard (no
  `vercel.json` in the repo).
- No Lighthouse / PageSpeed measurement has been run on this build,
  so no Core Web Vitals or performance-score claims are made.
