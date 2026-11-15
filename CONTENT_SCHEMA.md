# Content Schema

Content lives in Markdown/MDX files under `src/content/`. Schemas are
defined in `src/content.config.ts` (Zod, via Astro content collections)
and validated at build time: a file with a wrong field type fails the
build instead of silently publishing bad data.

Collections:

| Collection | Folder | File pattern |
| --- | --- | --- |
| `blog` | `src/content/blog/` | `**/*.{md,mdx}` |
| `authors` | `src/content/authors/` | `**/*.{md,mdx}` |
| `pages` | `src/content/pages/` | `**/*.{md,mdx}` |
| `about` | `src/content/about/` | `**/*.{md,mdx}` |
| `contact` | `src/content/contact/` | `**/*.{md,mdx}` |
| `homepage` | `src/content/homepage/` | `-*.{md,mdx}` (leading `-`) |
| `ctaSection` | `src/content/sections/` | `call-to-action.{md,mdx}` |
| `testimonialSection` | `src/content/sections/` | `testimonial.{md,mdx}` |

Files whose names start with `-` (for example `homepage/-index.md`)
are section/index data, not routable pages: `getSinglePage` excludes
any entry whose id starts with `-`.

## Blog posts (`blog`)

### Fields

| Field | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- |
| `title` | string | yes | — | Post title; also the `<h1>` and fallback `<title>` |
| `seoTitle` | string | no | `title` | `<title>` tag. Priority: `seoTitle` > `title` > site title |
| `seoDescription` | string | no | `description` | `<meta name="description">`. Priority: `seoDescription` > `description` > `excerpt` > site default |
| `ogTitle` | string | no | — | Social-share title. Priority: `ogTitle` > `seoTitle` > `title` for `og:title` |
| `ogDescription` | string | no | `description` | Social-share description. Priority: `ogDescription` > `seoDescription` > `description` > `excerpt` > site default |
| `ogImage` | string | no | `image` | Social-share image. Wins over `image` for OG/Twitter/Pinterest; also used in JSON-LD |
| `ogImageAlt` | string | no | page title | Alt text for the OG image |
| `twitterTitle` | string | no | `ogTitle` | X title. Priority: `twitterTitle` > `ogTitle` > `seoTitle` > `title` |
| `twitterDescription` | string | no | `ogDescription` | X description. Priority: `twitterDescription` > `ogDescription` > `seoDescription` > `description` |
| `twitterImage` | string | no | `ogImage` | X image. Priority: `twitterImage` > `ogImage` > `image` > site default Twitter image |
| `twitterImageAlt` | string | no | `ogImageAlt` | Alt text for the X image |
| `pinterestTitle` | string | no | `ogTitle` | Pin title. Priority: `pinterestTitle` > `ogTitle` > `seoTitle` > `title` |
| `pinterestDescription` | string | no | `ogDescription` | Pin description. Priority: `pinterestDescription` > `ogDescription` > `seoDescription` > `description` |
| `pinterestImage` | string | no | `ogImage` | Pin image (1000×1500, 2:3 recommended). Priority: `pinterestImage` > `ogImage` > `image` > site default OG image |
| `pinterestImageAlt` | string | no | `ogImageAlt` | Alt text for the Pin image |
| `description` | string | no | site `meta_description` | `<meta name="description">`, OG/Twitter description, RSS item description, JSON-LD description |
| `excerpt` | string | no | `description`/body | Short summary for cards and search; falls back to description/body at render |
| `dateCreated` | date | yes* | — | Creation date, set once, never changes. Accepts a Date or ISO string (`z.coerce.date()`). See [CONTENT_DATES.md](CONTENT_DATES.md) |
| `datePublished` | date | yes* | — | First publication date, set once, never changes. Drafts have none. Future dates are excluded from the build (see below) |
| `dateModified` | date | yes* | — | Latest meaningful modification; drives `article:modified_time`, JSON-LD `dateModified`, sitemap `<lastmod>` and the feeds |
| `image` | string | no | site `meta_image` | Hero image. Local path (`/images/….png`) or absolute URL (see [IMAGE_STORAGE.md](IMAGE_STORAGE.md)) |
| `authors` | string[] | no | — | Author list. Single-author posts list one name; multi-author posts list several. Drives the byline, OG `article:author` tags, and JSON-LD authors |
| `categories` | string[] | no | `["others"]` | Taxonomy; first category becomes OG `article:section` |
| `tags` | string[] | no | `["others"]` | Taxonomy; emitted as OG `article:tag` entries |
| `CustomSlug` | string | no | filename id | **Custom URL slug — it drives routing.** See “Custom slugs” below |
| `featured` | boolean | no | — | Accepted but **not consumed**: no featured-post section, filter, or ordering exists in this version |
| `canonical` | string | no | page's own URL | Absolute `https://…` URL or site-relative path (`/blog/x`); anything else fails validation. Overrides the generated canonical URL |
| `robotsindex` | boolean | no | config default | `false` (or a noindex config default for the type) emits `<meta name="robots" content="noindex, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">` and excludes the post from the sitemap, RSS, search index, and LLM docs |
| `draft` | boolean | no | — | `true` excludes the post from the build (see below) |

Validation notes:

- `canonical` accepts an absolute `https://…` URL or a site-relative
  path (`"/blog/my-post"`); relative values are resolved against
  `base_url` at render time. Anything else fails validation.
- `dateCreated`, `datePublished`, and `dateModified` accept ISO
  strings (`2022-04-04T05:00:00Z`) or YAML dates; both coerce to
  `Date`. *They are optional in the Zod schema (listing files share
  the same schemas and must stay dateless) and required for published
  content — enforced by `pnpm dates:check`, which runs in `prebuild`
  and fails the build on missing/invalid/inconsistent dates. See
  [CONTENT_DATES.md](CONTENT_DATES.md).
- `categories` and `tags` default to `["others"]` when omitted.
- `author` defaults to `"Admin"` when omitted. There is no `admin.md`
  author file, so a post that relies on the default links to no author
  page — the name renders as plain text instead of a link (see Authors).

### Custom slugs — how routing works

`CustomSlug` overrides the filename-derived id for a post's public URL.
One shared helper (`src/lib/utils/slug.ts`: `postUrl`, `postSlug`)
keeps the route, cards, share links, RSS, canonical/JSON-LD URLs, and
the search index on the same URL, so a custom slug never produces a
mismatched link.

- `CustomSlug: "my-guide"` on `src/content/blog/post-1.md` publishes the
  post at `/blog/my-guide` (not `/blog/post-1`).
- Slugs are normalised (lowercased, spaces/punctuation become
  hyphens) and **Unicode letters are preserved, not stripped**:
  `CustomSlug: "café-guide"` stays `café-guide`; `CustomSlug: "my guide!"` becomes
  `my-guide`.
- Nested slugs work: `CustomSlug: "guides/my-guide"` publishes at
  `/blog/guides/my-guide`. The same normalisation applies per segment.
- **Collisions fail the build**: two posts with the same public slug
  (after normalisation), or a custom slug colliding with another
  post's filename slug, throw a duplicate-slug error from the sitemap
  collectors (`src/lib/seo/sitemap/collectors.ts`) and the post route
  — fix the frontmatter rather than shipping two pages at one URL.
- Pages (`pages` collection) and authors support `CustomSlug` the same way
  via `pageUrl` / `authorUrl` in the same helper.
- The filename URL does **not** redirect to the custom slug — it
  simply is not built. Old filename links 404 after a slug change,
  so update inbound links when you rename.

### Drafts and future posts

`src/lib/contentParser.ts` (`getSinglePage`) excludes, by default:

- any entry with `draft: true`;
- any entry whose `datePublished` is in the future;
- any entry whose id starts with `-`.

Escape hatches (build flags, for previewing only — not for production):

```bash
npx astro build --buildDrafts   # include drafts
npx astro build --buildFuture   # include future-dated posts
```

The RSS feed (`src/pages/rss.xml.ts`) applies the same rules
independently: drafts, `-`-prefixed ids, and future-dated posts are
excluded, newest first, undated posts last.

### Minimal post

File: `src/content/blog/my-first-post.md`

```markdown
---
title: "My First Post"
draft: false
---

Hello, world.
```

`author` becomes `"Admin"`, `categories`/`tags` become `["others"]`,
description falls back to the site default, and the image falls back
to the site default OG image.

### Full post (all new SEO fields)

```markdown
---
title: "How to Build a Modern Application with Next.js and Tailwind CSS"
seoTitle: "Build a Modern App with Next.js and Tailwind CSS"
ogTitle: "Build a Modern App with Next.js + Tailwind"
ogDescription: "A hands-on Next.js + Tailwind guide, from setup to a polished interface."
description: "A practical guide to building a modern web application with Next.js and Tailwind CSS."
excerpt: "From project setup to a polished, responsive interface."
dateCreated: 2022-04-04T05:00:00Z
datePublished: 2022-04-04T05:00:00Z
dateModified: 2022-04-10T05:00:00Z
slug: "build-modern-app-nextjs-tailwind"
image: "/images/image-placeholder.png"
ogImage: "/images/og-image.jpg"
authors: ["John Doe"]
categories: ["Application", "Data"]
tags: ["nextjs", "tailwind"]
featured: true
canonical: "https://example.com/blog/my-post/"
robotsindex: true
draft: false
---

Post body…
```

Notes on this example: `dateModified` drives the modified
date; `ogImage` is what social shares show; `ogTitle` /
`ogDescription` override the plain title/description for social
shares only; `CustomSlug` publishes this post at
`/blog/build-modern-app-nextjs-tailwind`; `canonical` may be absolute
or site-relative; `featured: true` is accepted but has no visible
effect (no featured UI exists).

### Multi-author post

```markdown
---
title: "A Post by Two Authors"
description: "Written together."
dateCreated: 2022-04-04T05:00:00Z
datePublished: 2022-04-04T05:00:00Z
dateModified: 2022-04-04T05:00:00Z
authors: ["John Doe", "Sam Wilson"]
categories: ["Technology"]
tags: ["technology"]
draft: false
---

Post body…
```

`authors` drives the byline, the OG
`article:author` tags, and the JSON-LD author list. Single-author
posts list one name. Author names are resolved to an
author file by entry id first (`john-doe`), with a legacy
display-name slug match as fallback; a name that matches no file
renders as plain text, never as a link to a 404 author page.

### Draft post

```markdown
---
title: "Work in Progress"
description: "Not ready yet."
dateCreated: 2022-04-04T05:00:00Z
authors: ["John Doe"]
draft: true
---

Draft body…
```

A draft is excluded from the build, the sitemap, the RSS feed, and
the blog listing. It only appears with `--buildDrafts`.

### Remote / R2-image post

```markdown
---
title: "Serving Blog Images from R2: A Remote Image Example"
seoTitle: "Serving Blog Images from R2: A Remote Image Example"
description: "A demo post showing how Astroplate handles blog images hosted remotely on R2, with a separate social share image for Open Graph."
dateCreated: 2022-04-05T05:00:00Z
datePublished: 2022-04-05T05:00:00Z
dateModified: 2022-04-05T05:00:00Z
image: "https://media.csofts.tech/images/r2-example.jpg"
ogImage: "https://media.csofts.tech/images/r2-example-og.jpg"
categories: ["Technology"]
authors: ["John Doe"]
tags: ["technology"]
draft: false
---

Post body…
```

This is the shipped demo post `src/content/blog/post-r2-example.md`.
Both `image` and `ogImage` are absolute `https://` URLs; they are
rendered verbatim (see [IMAGE_STORAGE.md](IMAGE_STORAGE.md)). No
local copy is needed.

## Authors (`authors`)

Shared base fields (`title`, `description`, `seoTitle`,
`dateCreated`, `datePublished`, `dateModified`, `image`, `draft`) plus:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `email` | string | no | Author email; also present in the Sitepins authors schema |
| `social` | array of `{name, icon, link}` | no | Social links; `icon` is a `react-icons` name (e.g. `FaGithub`) |

Example (`src/content/authors/john-doe.md`):

```markdown
---
title: John Doe
email: johndoe@email.com
image: "/images/avatar.png"
description: this is meta description
social:
  - name: github
    icon: FaGithub
    link: https://github.com
  - name: twitter
    icon: FaTwitter
    link: https://twitter.com
  - name: linkedin
    icon: FaLinkedin
    link: https://linkedin.com
---

Author bio…
```

The author page URL is derived from the filename
(`/authors/john-doe`). The `title` is the display name used for
matching `author` / `authors` in posts.

## Pages, about, contact (`pages`, `about`, `contact`)

All three share the common fields only:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | string | yes | Page title |
| `description` | string | yes | Meta description |
| `seoTitle` | string | no | `<title>` override |
| `date` | date | no | Optional |
| `image` | string | no | Page/OG image |
| `draft` | boolean | yes (in schema) | `true` excludes the page from the build |

Example:

```markdown
---
title: "Privacy Policy"
description: "How we handle your data."
draft: false
---

Policy text…
```

## Homepage and sections

### `homepage` (`src/content/homepage/-index.md`)

```yaml
banner:
  title: string        # required
  content: string      # required
  image: string        # required
  button:
    enable: boolean
    label: string
    link: string
features:              # array
  - title: string
    image: string
    content: string
    bulletpoints: [string]
    button:
      enable: boolean
      label: string
      link: string
```

### `ctaSection` (`src/content/sections/call-to-action.md`)

```yaml
enable: boolean
title: string
description: string
image: string
button:
  enable: boolean
  label: string
  link: string
```

### `testimonialSection` (`src/content/sections/testimonial.md`)

```yaml
enable: boolean
title: string
description: string
testimonials:
  - name: string
    avatar: string
    designation: string
    content: string
```

## Sitepins schema mirror (`.sitepins/`)

`.sitepins/config.json` points the CMS at the content and media:

```json
{
  "content": "src/content",
  "media": "public/images",
  "public": "public",
  "configs": ["src/config"]
}
```

`.sitepins/schema/*.json` mirrors the Zod schema 1:1 so the CMS
form fields match what the build validates:

| Schema file | Mirrors | Notes |
| --- | --- | --- |
| `.sitepins/schema/blog.json` | `blog` collection | 19 fields, including the new `excerpt`, `CustomSlug`, `dateCreated`, `datePublished`, `dateModified`, `ogImage`, `ogTitle`, `ogDescription`, `authors`, `featured`, `canonical`, `robotsindex`. `authors` is a dropdown referencing `src/content/authors/*.md` by `title` |
| `.sitepins/schema/pages.json` | `pages` collection | `title` (required), `seoTitle`, `description`, `image`, `draft` |
| `.sitepins/schema/authors.json` | `authors` collection | `title` (required), `CustomSlug`, `email`, `image`, `description`, `canonical`, `robotsindex`, `social` (array of `name`/`icon`/`link`), `draft` |

### Mapping table (Zod field → Sitepins field)

| Zod field (`content.config.ts`) | Sitepins type | Notes |
| --- | --- | --- |
| `title` | string (required) | Same in all three schemas |
| `seoTitle` | string | |
| `description` | string | |
| `excerpt` | string | Blog only |
| `CustomSlug` | string (“Custom Slug”) | Blog only; drives routing — see “Custom slugs” above |
| `dateCreated` / `datePublished` / `dateModified` | Date | Blog only |
| `image` / `ogImage` | media | `ogImage` labelled “Social Share Image (OG Image)” |
| `ogTitle` / `ogDescription` | string | Blog only; consumed as the OG/Twitter title/description overrides |
| `authors` | Array of string, dropdown from authors folder | Blog only |
| `categories` / `tags` | Array of string | Default `["others"]` in Zod |
| `featured` / `robotsindex` / `draft` | boolean | `featured` is accepted but has no UI; a noindex resolved `robotsindex` (`false`, or a noindex config default) excludes the post from sitemap/RSS/search/llms |
| `canonical` | string (“Canonical URL”) | Absolute URL or site-relative path |
| `email` | string | Authors only |
| `social` | Array of object (`name`, `icon`, `link`) | Authors only |

Rule of thumb: if you add a field to `src/content.config.ts`,
add the matching entry to the corresponding
`.sitepins/schema/*.json`, and vice versa. If the two drift apart,
the CMS will either offer a field the build drops, or the build
will reject a field the CMS never offers.
