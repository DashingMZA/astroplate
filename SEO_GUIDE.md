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
| `<title>` | `seoTitle`, else `title`, else site title (plain-text, HTML stripped) |
| `<link rel="canonical">` | Always emitted. Defaults to the page's own URL (`base_url` + `base_path` + pathname, honouring `trailing_slash`); an explicit `canonical` prop overrides it (absolute URL or site-relative path) |
| `<link rel="prev">` / `<link rel="next">` | Blog listing pagination only (`/blog` → page 2, page N ↔ N±1; page 2's prev is `/blog`, never `/blog/page/1`) |
| `<meta name="description">` | `seoDescription`, else `description`, else `excerpt`, else site `metadata.meta_description` |
| `<meta name="author">` | Site `metadata.meta_author` |
| `og:title` | `ogTitle`, else `seoTitle`, else `title`, else site title |
| `og:description` | `ogDescription`, else `seoDescription`, else `description`, else `excerpt`, else site default |
| `og:type` | `"website"`, except `"article"` on blog posts |
| `og:url` | The canonical URL |
| `og:site_name` | Site title |
| `og:locale` | Site `locale` (default `"en_US"`) |
| `og:image` | `ogImage`, else `image`, else site `metadata.meta_image` — resolved to an absolute URL. Absolute URLs are never prefixed with the site domain |
| `og:image:secure_url` | Same as `og:image` when the URL is https |
| `og:image:type` / `:width` / `:height` | Verified from the actual image file with sharp at build time (default OG image: 1200×630 `image/webp`). Remote images carry no dimensions — omitted, never invented |
| `og:image:alt` | Platform alt → OG alt → page title → site `metadata.meta_image_alt` |
| `twitter:card` | `summary_large_image` (an image always resolves — at minimum the configured default) |
| `twitter:title` / `twitter:description` | Independent fields (`twitterTitle` / `twitterDescription`), each falling back through OG → SEO → title/description |
| `twitter:image` / `twitter:image:alt` | Independent (`twitterImage` → `ogImage` → featured → site `metadata.meta_twitter_image`); alt follows the same chain as OG |
| `twitter:site` / `twitter:creator` | From `config.social` (`twitter_site` / `twitter_creator`); currently `@Dashing_ZB` (the linked X profile). Omitted when unconfigured — never invented |
| Pinterest | No standard Pinterest meta tags exist — Pinterest reads the OG tags above. The Pin button (`Share.astro`, blog posts only) uses the resolved Pinterest description / image (`pinterestDescription` → `ogDescription` → …; `pinterestImage` → `ogImage` → …). No dedicated vertical Pin image is configured, so Pins inherit the OG image |
| Favicon / touch icon / manifest | `config.site.favicon` (`rel="shortcut icon"`), `config.site.apple_touch_icon` (180×180, generated from the favicon), `config.site.web_manifest` |
| RSS / Atom / JSON discovery | `<link rel="alternate">` for `/rss.xml`, `/atom.xml`, `/feed.json` |
| `<html lang>` | Site `language` (default `"en"`) |
| Skip link | “Skip to content” link to `#main-content` (first focusable element) |
| `<meta name="robots">` | Always emitted. Index variant by default (`index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1`); noindex variant when the page opts out (`robotsindex: false` frontmatter or the config default for its type, see `robots.index` in `config.json`). A noindex page (resolved `robotsindex`: frontmatter, else the config default for its type) is also excluded from the sitemap, RSS, search index, and LLM docs |

### Blog posts only (via `src/pages/blog/[single].astro` + `Base.astro`)

| Tag | Value / rule |
| --- | --- |
| `og:type` | `"article"` |
| `article:published_time` | Post `datePublished` (ISO) |
| `article:modified_time` | `dateModified`, else `datePublished` (ISO) |
| `article:author` | One tag per author (`authors` list) |
| `article:section` | First category |
| `article:tag` | One tag per tag |
| JSON-LD `Article` | Exactly one per post (see below) |

### Trailing slash

Canonical URLs are slashless: `trailing_slash: false` in
`config.json` makes Astro generate slashless canonicals, links,
sitemap URLs and feed links, and the build emits no internal link
with a trailing slash (except the site root `/` itself — see
`tests/trailing-slash.test.js`). A trailing-slash request must not
serve the same page: every host 301-redirects it to the slashless
URL. This is a static build with no server middleware, so the rule
lives in the host configs:

| Host | Where the rule lives |
| --- | --- |
| Vercel (production) | `vercel.json` `redirects`: `/:path+/` → `/:path+`, `permanent: true` (301) |
| Cloudflare Workers Static Assets | `wrangler.jsonc` `assets.html_handling: "drop-trailing-slash"` (platform-native) **and** `public/_redirects`: `/*/ /:splat 301` (upgrades it to a permanent 301) |
| Netlify | Reads the same `public/_redirects` file — no second copy in `netlify.toml` |
| nginx (Docker) | `config/nginx/nginx.conf`: `rewrite ^/(.*)/$ /$1 permanent;` |

The root `/` never redirects (every pattern needs at least one
segment before the trailing slash). Query strings are preserved by
the host. Flipping `trailing_slash` to `true` is a different URL
shape, not a toggle for this rule — every rule above would have to
be inverted with it.

### JSON-LD

Every page emits exactly one JSON-LD block — a single `@graph`
containing the site-wide `WebSite` + `Organization` blocks (from
`config.site` / `config.publisher`) plus any page-specific blocks,
rendered by `src/layouts/components/JsonLd.astro` (which escapes `</`
inside the JSON so a `</script>` sequence in content can never break
out of the script element). The `@context` lives once at the graph
level; each block below carries exactly the fields of the site's
schema specs — same format, only the values are the page's own.
There is no `SearchAction`: search is a client-side modal, not a
search-results page, so a query URL would be fabricated.

- **WebPage** — every general page: home, about, contact, regular
  pages. `@id` is the page URL + `#webpage`; `isPartOf` points at
  `#website`, `about` and `publisher` at `#organization`,
  `breadcrumb` at the page URL + `#breadcrumb`. `primaryImageOfPage`
  is the page image when it has one (home/about banner, a regular
  page's `image`); `datePublished` / `dateModified` are the page's
  dates, omitted when the page has none (the homepage carries no
  dates). No `dateCreated`: the spec carries only the two dates.
  Built by `buildWebPageJsonLd` (`src/lib/utils/jsonld.ts`).
- **BreadcrumbList** — every page has its own trail. `@id` is the
  page URL + `#breadcrumb`. Home → page for general pages;
  Home → Blog → Category → Post for blog posts (the category crumb
  is the first category; Home → Blog → Post when the post has no
  real category); Home → Authors → Name for author pages;
  Home → Categories/Tags/Authors → Name for the listing pages.
  Built by `buildBreadcrumbJsonLd`.
- **BlogPosting** — one per post (built in
  `src/pages/blog/[single].astro`, authors resolved via
  `src/lib/utils/authors.ts`):

```json
{
  "@type": "BlogPosting",
  "@id": "<canonical post URL>#article",
  "url": "<canonical post URL>",
  "mainEntityOfPage": { "@type": "WebPage", "@id": "<canonical post URL>#webpage" },
  "headline": "<post title>",
  "description": "<post description>",
  "image": ["<featured image>", "<OG image>", "<body image>", "…"],
  "datePublished": "<ISO date>",
  "dateModified": "<ISO date>",
  "author": { "@type": "Person", "@id": "<author page URL>#person", "name": "<author>", "url": "<author page URL>" },
  "publisher": { "@id": "<site base_url>/#organization" },
  "isPartOf": { "@id": "<site base_url>/#blog" },
  "inLanguage": "<config.site.language>",
  "articleSection": "<first category>",
  "keywords": ["<tag>", "…"],
  "wordCount": 2716
}
```

- `image` is the post's images in order — featured `image`, `ogImage`,
  then the images referenced in the body (the same set the sitemap
  emits, via `postImageUrls`); omitted when the post has no image.
- `author` is a single `Person` object for one author, an array for
  several. The `@id` is the author-page URL + `#person` — the same
  `@id` the author page's own `Person` block carries, so the
  reference resolves. An unresolvable name renders as a bare name
  with no URL and no `@id`. Author URLs use the site's canonical
  form (no trailing slash).
- `publisher` is only the `#organization` reference — the full
  Organization block already lives in the same `@graph`.
- `isPartOf` points at `#blog`; a minimal `Blog` node (`@id`
  `<site base_url>/#blog`, `url` `/blog`, `name` from the blog
  `-index` title) is emitted on the blog index and post pages so the
  reference resolves. Built by `buildBlogJsonLd`.
- `articleSection` is the first category; `keywords` are the post's
  tags. The `others` default category / tag is filler and is never a
  section or a keyword — both are omitted when no real value exists.
- `wordCount` counts the post body's readable words
  (`countWords` in `src/lib/utils/readingTime.ts`): fenced/inline
  code and image markup are stripped, link text is kept.
- `url` / `mainEntityOfPage` are the canonical post URL (custom slug
  included — see [CONTENT_SCHEMA.md](CONTENT_SCHEMA.md)). No
  `dateCreated`: the spec carries only `datePublished` /
  `dateModified`.

### Domain verification

Domain-verification meta tags for Pinterest, Facebook, Google, Bing,
Yandex, Baidu, Naver and Ahrefs live in `config.json`
(`verification`: one code per provider, empty when unconfigured)
and render **only on the home page** (`verification` prop on
`Base`, passed by `src/pages/index.astro` only). A provider with no
code emits no tag — never a placeholder. The mapping
(`verificationMetaTags` in `src/lib/utils/verification.ts`) is:

| Provider | Meta name |
| --- | --- |
| Pinterest | `p:domain_verify` |
| Facebook | `facebook-domain-verification` |
| Google | `google-site-verification` |
| Bing | `msvalidate.01` |
| Yandex | `yandex-verification` |
| Baidu | `baidu-site-verification` |
| Naver | `naver-site-verification` |
| Ahrefs | `ahrefs-site-verification` |

To verify the domain with a provider, paste its code into the matching
`verification` field in `config.json` and rebuild — the tag appears in
the homepage `<head>` only.


### Sitemap

Generated by the config-driven sitemap engine (`src/lib/seo/sitemap/`),
served by the single dynamic route `src/pages/[sitemap].xml.ts` —
no `@astrojs/sitemap` integration, no SSR, nothing read at request
time (image references are existence-checked against `public/` once,
at build time). The files are generated during `astro build` as static
files in `dist/`, with Rank Math-style names (type first, `sitemap`
second; the index uses an underscore):

- `dist/sitemap_index.xml` lists the generated files (3 in the
  current build): `page-sitemap.xml` (7 URLs), `post-sitemap.xml`
  (10), `image-sitemap.xml` (10 posts with their featured images).
  Author, category and tag sitemaps are NOT generated while those
  types are noindex by config default (see below) — an enabled type
  with no entries produces no file and no index entry.
- `/404` is excluded, as are any URL segments `draft`, `drafts`,
  `preview`, or `private` (see `sitemap.exclude` /
  `sitemap.exclude_segments` in `config.json`).
- Exclusion follows the RESOLVED robotsindex (frontmatter value,
  else the config default for the page type): a noindex URL never
  appears in a sitemap. Authors, tags, categories and blog archives
  are noindex by config default, so `/authors`, `/blog`,
  `/blog/page/N`, `/categories`, `/tags` and every author/category/
  tag page stay out unless the config default (or an explicit
  frontmatter `robotsindex: true`) flips the type to index. Draft
  and future-dated posts and posts with an external canonical URL
  are excluded too. Duplicate public URLs (two posts, same slug)
  fail the build instead of publishing a colliding sitemap.
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
  a stale reference can never ship. `image-sitemap.xml` is
  unchanged: one OG image per post.
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
ls dist/*sitemap*.xml                     # expect 4 files (index + 3 types)
python3 -c "import xml.etree.ElementTree as ET, glob; [ET.parse(f) for f in glob.glob('dist/*sitemap*.xml')]"
grep -c "<url>" dist/page-sitemap.xml     # expect 7
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
- Featured image: the post's own `ogImage` (else `image`), with the
  MIME type from the file extension and real pixel dimensions when the
  image is a local file (read with `sharp` at build time). RSS/Atom
  use `<media:content>` + `<media:thumbnail>`; JSON Feed uses the
  `image` field. Remote images and posts without their own image get
  no dimensions / no media tags — dimensions are never invented, and
  the site-default OG image is never passed off as a featured image.
- `robotsindex: false` posts are excluded, like drafts and future-dated
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
authors: ["John Doe", "Sam Wilson"]
categories: ["Application", "Data"]
tags: ["nextjs", "tailwind"]
canonical: "https://example.com/blog/my-post/"
robotsindex: true
---
```

All social fields are optional; empty strings, `null` and
`undefined` all count as missing. The exact fallback chains live in
`src/lib/utils/social.ts` — nothing below duplicates them:

Rules:

- **`seoTitle`** sets the browser `<title>`:
  `seoTitle` > `title` > site title. `ogTitle` does
  **not** fall back into `<title>` — it is the social title only.
- **`seoDescription`** sets the meta description:
  `seoDescription` > `description` > `excerpt` > site default.
- **`ogTitle`** sets `og:title`: `ogTitle` > `seoTitle` >
  `title` > site title.
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
- **`robotsindex`** controls the robots meta: `true` (or unset / `null`,
  when the config default for the page type is index) emits
  `<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">`;
  `false` emits the `noindex, follow, …` variant (same max-snippet /
  max-image-preview / max-video-preview) and excludes the page from the
  sitemap, RSS, search index, and LLM docs. The page is still built and
  still linked from the site — `robotsindex: false` only asks search
  engines not to index it. `robotsindex` exists on blog posts and on the
  page-like collections (`pages`, `about`, `contact`) and on authors.
  The per-type defaults live in `config.json` under `robots.index`
  (pages + blog posts index; authors, tags, categories, and blog
  archives noindex); a frontmatter value always wins over the default.
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
