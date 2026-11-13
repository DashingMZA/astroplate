# SEO Guide

All SEO output is generated at build time from `src/config/config.json`
and post frontmatter. The single source of truth is
`src/layouts/Base.astro`, which every page renders through; post
pages add article metadata in `src/pages/blog/[single].astro`, and
URL helpers live in `src/lib/utils/seo.ts`.

## What is emitted per page type

### Every page (via `Base.astro`)

| Tag | Value / rule |
| --- | --- |
| `<title>` | `meta_title`, else `title`, else site title (plain-text, HTML stripped) |
| `<link rel="canonical">` | Always emitted. Defaults to the page's own URL (`base_url` + `base_path` + pathname, honouring `trailing_slash`); an explicit `canonical` prop overrides it (absolute URL or site-relative path) |
| `<meta name="description">` | Post/page `description`, else `excerpt`, else site `metadata.meta_description` |
| `<meta name="author">` | Site `metadata.meta_author` |
| `og:title` | `og_title`, else `meta_title`, else `title`, else site title |
| `og:description` | `og_description`, else `description`, else `excerpt`, else site default |
| `og:type` | `"website"`, except `"article"` on blog posts |
| `og:url` | The canonical URL |
| `og:site_name` | Site title |
| `og:locale` | Site `locale` (default `"en_US"`) |
| `og:image` / `twitter:image` | Post `og_image`, else post `image`, else site `metadata.meta_image` — resolved to an absolute URL. Absolute URLs are never prefixed with the site domain |
| `og:image:width` / `og:image:height` | **Not emitted.** Dimensions are not known at render time and the old hardcoded 1200×630 was wrong for most images; no dimensions is better than invented ones |
| `og:image:alt` / `twitter:image:alt` | Page-specific image: `og_image_alt` / `image_alt` / page title; site-default image: `metadata.meta_image_alt` |
| `twitter:card` | `summary_large_image` when an image exists, else `summary` |
| `twitter:title` / `twitter:description` | Same as `og:title` / `og:description` above |
| `twitter:site` / `twitter:creator` | From `config.social` (`twitter_site` / `twitter_creator`); omitted when unconfigured — never invented |
| RSS autodiscovery | `<link rel="alternate" type="application/rss+xml" href="<base_url>/rss.xml">` |
| `<html lang>` | Site `language` (default `"en"`) |
| Skip link | “Skip to content” link to `#main-content` (first focusable element) |
| `<meta name="robots">` | Only when a page sets `noindex: true`: `noindex,follow`. The page is also excluded from the sitemap, RSS, search index, and LLM docs |

### Blog posts only (via `src/pages/blog/[single].astro` + `Base.astro`)

| Tag | Value / rule |
| --- | --- |
| `og:type` | `"article"` |
| `article:published_time` | Post `date` (ISO) |
| `article:modified_time` | `updated`, else `lastmod`, else `date` (ISO) |
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

Generated by `@astrojs/sitemap` (`astro.config.mjs`):

- `dist/sitemap-index.xml` → `dist/sitemap-0.xml` (29 URLs in the
  current build).
- `/404` is excluded, as are any URL segments `draft`, `drafts`,
  `preview`, or `private`.
- `noindex: true` pages are excluded: the sitemap filter reads a
  frontmatter manifest built at config load
  (`scripts/seoManifest.js`), since the sitemap filter itself only
  sees URLs. Duplicate public URLs (two posts, same slug) fail the
  build instead of publishing a colliding sitemap.
- Entries carry `lastmod` from `updated ?? lastmod ?? date` when a
  date exists.
- Draft and future-dated posts never reach the sitemap because they
  are excluded from the build itself (see below).

### `robots.txt`

`public/robots.txt` is copied to `dist/robots.txt` verbatim:

```text
User-agent: *
Allow: /

Sitemap: https://astroplate.jadoo.bond/sitemap-index.xml
```

The `Sitemap:` line uses `base_url` — update `site.base_url` in
`config.json` and keep this file in sync if the domain changes.
(They are two separate places; nothing generates one from the other.)

### RSS

`src/pages/rss.xml.ts` serves `/rss.xml` (5 demo posts in the current
build):

- Title = site title; description = site `meta_description`;
  link = site `base_url`.
- Items: title, description, link `/blog/<slug>` (custom slug when
  set, else filename — the same canonical URL as the post page, no
  trailing slash), `pubDate`, author, categories.
- `noindex: true` posts are excluded, like drafts and future-dated
  posts.
- Sorted newest first; undated posts sort last.

## Setting per-post SEO

Frontmatter fields (full reference in [CONTENT_SCHEMA.md](CONTENT_SCHEMA.md)):

```markdown
---
title: "How to Build a Modern Application with Next.js and Tailwind CSS"
meta_title: "Build a Modern App with Next.js and Tailwind CSS"
og_title: "Build a Modern App with Next.js + Tailwind"
description: "A practical guide to building a modern web application with Next.js and Tailwind CSS."
image: "/images/image-placeholder.png"
og_image: "/images/og-image.jpg"
date: 2022-04-04T05:00:00Z
updated: 2022-04-10T05:00:00Z
author: "John Doe"
authors: ["John Doe", "Sam Wilson"]
categories: ["Application", "Data"]
tags: ["nextjs", "tailwind"]
canonical: "https://example.com/blog/my-post/"
noindex: false
---
```

Rules:

- **`meta_title`** sets the browser `<title>`. Without it, `title`
  is used. `og_title` does **not** fall back into `<title>` — it is
  the social title only (see below).
- **`og_title`** sets `og:title` / `twitter:title`. Priority:
  `og_title` > `meta_title` > `title` > site title.
- **`description`** is the source for the meta description, RSS
  description, and JSON-LD description. Keep it under ~160 characters.
- **`og_description`** sets `og:description` /
  `twitter:description`. Priority: `og_description` > `description` >
  `excerpt` > site default. Use it when the social description should
  differ from the on-page description.
- **`image` vs `og_image`**: `image` is the on-page hero image;
  `og_image` is what social shares show and wins for OG/Twitter and
  JSON-LD. Set `og_image` when the share image should differ from
  the hero (e.g. a 1200×630 card vs a tall hero). Either may be a
  local path or an absolute URL — see [IMAGE_STORAGE.md](IMAGE_STORAGE.md).
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
- **`updated` / `lastmod`** set the modified date for
  `article:modified_time` and JSON-LD `dateModified`. `updated`
  wins when both are set.

Site-wide fallbacks live in `config.json` → `metadata`
(`meta_author`, `meta_image`, `meta_image_alt`,
`meta_description`) and `publisher`. See
[CONFIGURATION.md](CONFIGURATION.md).

## Drafts and future posts — exclusion rules

A post is excluded from the build, the blog listing, the sitemap,
and the RSS feed when any of these hold:

- `draft: true` in frontmatter;
- `date` is in the future at build time;
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
# Canonical + OG/Twitter + JSON-LD on a post
grep -o '<link rel="canonical" href="[^"]*"' dist/blog/post-1/index.html
grep -o '<meta property="og:[^>]*>' dist/blog/post-1/index.html
grep -o '<meta name="twitter:[^>]*>' dist/blog/post-1/index.html
grep -o 'application/ld+json' dist/blog/post-1/index.html | wc -l   # expect 1

# JSON-LD is exactly one @graph block per page, with one BlogPosting
grep -c '"@type":"BlogPosting"' dist/blog/post-1/index.html   # expect 1

# No duplicated domain in OG images (absolute URLs stay verbatim)
grep -o '<meta property="og:image" content="[^"]*"' dist/blog/post-r2-example/index.html
# expect: https://media.csofts.tech/images/r2-example-og.jpg (no site domain prepended)

# Sitemap: 29 URLs, no /404
grep -o "<loc>[^<]*</loc>" dist/sitemap-0.xml
grep -c "404" dist/sitemap-0.xml   # expect 0

# Robots + RSS
cat dist/robots.txt
grep -o "<item>" dist/rss.xml | wc -l   # expect 5
```

After deploying, re-run the same checks against the live URLs and
spot-check one post with the social debuggers / rich-results test of
your choice (Facebook Sharing Debugger, X Card Validator, Google
Rich Results Test). Social platforms cache OG data — use their
refresh tools after changing images or titles.

## Known SEO gaps (honest list)

- `featured` is accepted but has no featured-post UI — setting it
  changes nothing visible.
- No `SearchAction` JSON-LD: search is a client-side modal, not a
  search-results page.
- No multilingual / hreflang support — the site is single-language
  (`site.language` / `site.locale` only set `lang` and `og:locale`).
- Security headers are configured in the repo (see
  [SECURITY.md](SECURITY.md)), but they are served by the host, not
  by the theme — verify them against the live deployment, and note
  the Vercel deployment needs them added in the dashboard (no
  `vercel.json` in the repo).
- No Lighthouse / PageSpeed measurement has been run on this build,
  so no Core Web Vitals or performance-score claims are made.
