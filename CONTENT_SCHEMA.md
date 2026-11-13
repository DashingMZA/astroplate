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
| `meta_title` | string | no | `title` | `<title>` tag. Falls back to `title`, then site title |
| `og_title` | string | no | — | Social-share title. Priority: `og_title` > `meta_title` > `title` for `og:title` / `twitter:title` |
| `description` | string | no | site `meta_description` | `<meta name="description">`, OG/Twitter description, RSS item description, JSON-LD description |
| `excerpt` | string | no | `description`/body | Short summary for cards and search; falls back to description/body at render |
| `date` | date | no | — | Publication date. Accepts a Date or ISO string (`z.coerce.date()`). Future dates are excluded from the build (see below) |
| `updated` | date | no | — | Last-updated date; drives `article:modified_time` and JSON-LD `dateModified` |
| `lastmod` | date | no | — | Sitemap alias for the same value; used only if `updated` is unset |
| `image` | string | no | site `meta_image` | Hero image. Local path (`/images/….png`) or absolute URL (see [IMAGE_STORAGE.md](IMAGE_STORAGE.md)) |
| `og_image` | string | no | `image` | Social-share image. Wins over `image` for OG/Twitter; also used in JSON-LD |
| `og_description` | string | no | `description` | Social-share description. Priority: `og_description` > `description` > `excerpt` > site default for `og:description` / `twitter:description` |
| `author` | string | no | `"Admin"` | Single-author name; fallback when `authors` is absent. Resolved to an author file by id first, display-name slug second (see Authors) |
| `authors` | string[] | no | — | Multi-author list. When non-empty it replaces `author` for display, OG `article:author` tags, and JSON-LD authors |
| `categories` | string[] | no | `["others"]` | Taxonomy; first category becomes OG `article:section` |
| `tags` | string[] | no | `["others"]` | Taxonomy; emitted as OG `article:tag` entries |
| `slug` | string | no | filename id | **Custom URL slug — it drives routing.** See “Custom slugs” below |
| `featured` | boolean | no | — | Accepted but **not consumed**: no featured-post section, filter, or ordering exists in this version |
| `canonical` | string | no | page's own URL | Absolute `https://…` URL or site-relative path (`/blog/x`); anything else fails validation. Overrides the generated canonical URL |
| `noindex` | boolean | no | `false` | `true` emits `<meta name="robots" content="noindex,follow">` and excludes the post from the sitemap, RSS, search index, and LLM docs |
| `draft` | boolean | no | — | `true` excludes the post from the build (see below) |

Validation notes:

- `canonical` accepts an absolute `https://…` URL or a site-relative
  path (`"/blog/my-post"`); relative values are resolved against
  `base_url` at render time. Anything else fails validation.
- `date`, `updated`, and `lastmod` accept ISO strings
  (`2022-04-04T05:00:00Z`) or YAML dates; both coerce to `Date`.
- `categories` and `tags` default to `["others"]` when omitted.
- `author` defaults to `"Admin"` when omitted. There is no `admin.md`
  author file, so a post that relies on the default links to no author
  page — the name renders as plain text instead of a link (see Authors).

### Custom slugs — how routing works

`slug` overrides the filename-derived id for a post's public URL.
One shared helper (`src/lib/utils/slug.ts`: `postUrl`, `postSlug`)
keeps the route, cards, share links, RSS, canonical/JSON-LD URLs, and
the search index on the same URL, so a custom slug never produces a
mismatched link.

- `slug: "my-guide"` on `src/content/blog/post-1.md` publishes the
  post at `/blog/my-guide` (not `/blog/post-1`).
- Slugs are normalised (lowercased, spaces/punctuation become
  hyphens) and **Unicode letters are preserved, not stripped**:
  `slug: "café-guide"` stays `café-guide`; `slug: "my guide!"` becomes
  `my-guide`.
- Nested slugs work: `slug: "guides/my-guide"` publishes at
  `/blog/guides/my-guide`. The same normalisation applies per segment.
- **Collisions fail the build**: two posts with the same public slug
  (after normalisation), or a custom slug colliding with another
  post's filename slug, throw a duplicate-slug error from
  `scripts/seoManifest.js` at config load — fix the frontmatter
  rather than shipping two pages at one URL.
- Pages (`pages` collection) and authors support `slug` the same way
  via `pageUrl` / `authorUrl` in the same helper.
- The filename URL does **not** redirect to the custom slug — it
  simply is not built. Old filename links 404 after a slug change,
  so update inbound links when you rename.

### Drafts and future posts

`src/lib/contentParser.ts` (`getSinglePage`) excludes, by default:

- any entry with `draft: true`;
- any entry whose `date` is in the future;
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
meta_title: "Build a Modern App with Next.js and Tailwind CSS"
og_title: "Build a Modern App with Next.js + Tailwind"
og_description: "A hands-on Next.js + Tailwind guide, from setup to a polished interface."
description: "A practical guide to building a modern web application with Next.js and Tailwind CSS."
excerpt: "From project setup to a polished, responsive interface."
date: 2022-04-04T05:00:00Z
updated: 2022-04-10T05:00:00Z
slug: "build-modern-app-nextjs-tailwind"
image: "/images/image-placeholder.png"
og_image: "/images/og-image.jpg"
author: "John Doe"
categories: ["Application", "Data"]
tags: ["nextjs", "tailwind"]
featured: true
canonical: "https://example.com/blog/my-post/"
noindex: false
draft: false
---

Post body…
```

Notes on this example: `updated` (not `lastmod`) drives the modified
date; `og_image` is what social shares show; `og_title` /
`og_description` override the plain title/description for social
shares only; `slug` publishes this post at
`/blog/build-modern-app-nextjs-tailwind`; `canonical` may be absolute
or site-relative; `featured: true` is accepted but has no visible
effect (no featured UI exists).

### Multi-author post

```markdown
---
title: "A Post by Two Authors"
description: "Written together."
date: 2022-04-04T05:00:00Z
author: "John Doe"
authors: ["John Doe", "Sam Wilson"]
categories: ["Technology"]
tags: ["technology"]
draft: false
---

Post body…
```

`authors` wins over `author` for the byline, the OG
`article:author` tags, and the JSON-LD author list. Keep `author`
set as the single-author fallback. Author names are resolved to an
author file by entry id first (`john-doe`), with a legacy
display-name slug match as fallback; a name that matches no file
renders as plain text, never as a link to a 404 author page.

### Draft post

```markdown
---
title: "Work in Progress"
description: "Not ready yet."
date: 2022-04-04T05:00:00Z
author: "John Doe"
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
meta_title: "Serving Blog Images from R2: A Remote Image Example"
description: "A demo post showing how Astroplate handles blog images hosted remotely on R2, with a separate social share image for Open Graph."
date: 2022-04-05T05:00:00Z
image: "https://media.csofts.tech/images/r2-example.jpg"
og_image: "https://media.csofts.tech/images/r2-example-og.jpg"
categories: ["Technology"]
author: "John Doe"
tags: ["technology"]
draft: false
---

Post body…
```

This is the shipped demo post `src/content/blog/post-r2-example.md`.
Both `image` and `og_image` are absolute `https://` URLs; they are
rendered verbatim (see [IMAGE_STORAGE.md](IMAGE_STORAGE.md)). No
local copy is needed.

## Authors (`authors`)

Shared base fields (`title`, `description`, `meta_title`, `date`,
`image`, `draft`) plus:

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
| `meta_title` | string | no | `<title>` override |
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
| `.sitepins/schema/blog.json` | `blog` collection | 20 fields, including the new `excerpt`, `slug`, `updated`, `lastmod`, `og_image`, `og_title`, `og_description`, `authors`, `featured`, `canonical`, `noindex`. `author` and `authors` are dropdowns referencing `src/content/authors/*.md` by `title` |
| `.sitepins/schema/pages.json` | `pages` collection | `title` (required), `meta_title`, `description`, `image`, `draft` |
| `.sitepins/schema/authors.json` | `authors` collection | `title` (required), `email`, `image`, `description`, `social` (array of `name`/`icon`/`link`), `draft` |

### Mapping table (Zod field → Sitepins field)

| Zod field (`content.config.ts`) | Sitepins type | Notes |
| --- | --- | --- |
| `title` | string (required) | Same in all three schemas |
| `meta_title` | string | |
| `description` | string | |
| `excerpt` | string | Blog only |
| `slug` | string (“Custom Slug”) | Blog only; drives routing — see “Custom slugs” above |
| `date` / `updated` / `lastmod` | Date | Blog only |
| `image` / `og_image` | media | `og_image` labelled “Social Share Image (OG Image)” |
| `og_title` / `og_description` | string | Blog only; consumed as the OG/Twitter title/description overrides |
| `author` | string, dropdown from authors folder | Default `"Admin"` |
| `authors` | Array of string, dropdown from authors folder | Blog only |
| `categories` / `tags` | Array of string | Default `["others"]` in Zod |
| `featured` / `noindex` / `draft` | boolean | `featured` is accepted but has no UI; `noindex` excludes the post from sitemap/RSS/search/llms |
| `canonical` | string (“Canonical URL”) | Absolute URL or site-relative path |
| `email` | string | Authors only |
| `social` | Array of object (`name`, `icon`, `link`) | Authors only |

Rule of thumb: if you add a field to `src/content.config.ts`,
add the matching entry to the corresponding
`.sitepins/schema/*.json`, and vice versa. If the two drift apart,
the CMS will either offer a field the build drops, or the build
will reject a field the CMS never offers.
