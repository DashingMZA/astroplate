# Image Storage

## Where images live

| Kind | Location | Example |
| --- | --- | --- |
| Local images | `public/images/` | `/images/logo.png`, `/images/image-placeholder.png` |
| Remote images | Any public URL (R2, S3, CDN, …) | `https://media.csofts.tech/images/r2-example.jpg` |
| Favicons / logos / OG defaults | `public/images/` (paths in `config.json`) | `favicon.png`, `logo.png`, `og-image.png` |

`public/` is served as-is at the site root: `public/images/foo.png`
is reachable at `/images/foo.png`. Local images are also the only
ones that go through Astro's image optimization (see below).

## The verbatim rule (remote images)

`src/layouts/components/ImageMod.astro` is the only image component
used across the site (hero, cards, avatars, logo, about page, CTA,
testimonials). Its rule:

- If `src` starts with `http://`, `https://`, `//`, or `data:`, it
  is rendered **verbatim as a plain `<img>`** — no transforms, no
  domain prepended, no lookup in `public/images/`.
- Otherwise it is treated as a local image and resolved through a
  glob over `/public/images/**/*.{jpeg,jpg,png,gif,svg,webp,avif}`.

This matters because an absolute URL must never become
`/publichttps://…` (which renders nothing). The rule is covered by
the shipped demo post `src/content/blog/post-r2-example.md`, whose
`image` and `og_image` are absolute R2 URLs — keep that post
published so builds keep verifying remote-image handling end to end.

The same verbatim rule applies to SEO images: `src/lib/utils/seo.ts`
(`absoluteUrl` / `resolveImage`) returns absolute URLs unchanged
and only prefixes `base_url` onto relative paths. OG/Twitter images
therefore never get the site domain prepended to an absolute URL.

## Local images (Astro Image)

Local images go through Astro's `<Image>` component (Sharp service,
configured in `astro.config.mjs`):

- Supported extensions in the glob: `jpeg`, `jpg`, `png`, `gif`,
  `svg`, `webp`, `avif` — including `webp`/`avif` sources, so
  pre-optimized uploads work as well as legacy formats.
- Call sites pass `format="webp"` where a modern format is wanted
  (e.g. the post hero in `PostSingle.astro`).
- Call sites may pass a path with or without a leading `/images/`
  prefix (and with or without a leading slash); `ImageMod` tries
  `/public<path>`, `/public/images/<name>`, and `/public/<name>` in
  order.
- If a local image is not found, `ImageMod` logs a red
  `Image not found - <src>` error at build time and renders nothing
  for that image. Remote images never hit this branch.

## `image` vs `og_image`

| Field | Used for | Fallback |
| --- | --- | --- |
| `image` (frontmatter) | On-page hero / card image | Site `metadata.meta_image` (for SEO only) |
| `og_image` (frontmatter) | OG/Twitter share image + JSON-LD image | `image` |
| `metadata.meta_image` (`config.json`) | Default OG/Twitter image for pages without one | — |

Use `og_image` when the share image should differ from the hero —
typically a 1200×630 card. If you only set `image`, social shares
use the hero image. See [SEO_GUIDE.md](SEO_GUIDE.md).

## Formats and sizes

- **OG / share images:** 1200×630 px. `Base.astro` declares
  `og:image:width 1200` / `og:image:height 630`, but only for local
  images — dimensions are never invented for a remote image.
- **Post hero:** rendered at 1200×500 (`PostSingle.astro`).
- **Logo:** configured in `config.json` (`logo_width` / `logo_height`,
  currently 150×30). Supply both `logo.png` and `logo-darkmode.png`.
- **Avatars:** square images; author avatars live in
  `public/images/` (e.g. `avatar.png`).
- **Formats:** prefer `webp` (or `avif`) for photos; `png` for logos
  and graphics needing transparency; `svg` for icons. `ImageMod`
  accepts all of them for local files.

## Lazy vs eager loading

Loading behaviour is set per call site, not globally:

| Usage | Loading | Fetch priority |
| --- | --- | --- |
| Logo (`Logo.astro`) | `eager` | `high` |
| Homepage hero (`src/pages/index.astro`) | `eager` | — |
| Post hero (`PostSingle.astro`) | no `loading` prop passed (component default applies) | — |
| Blog cards (`BlogCard.astro`) | `lazy` | — |
| Author avatars (`AuthorCard.astro`) | `lazy` | — |

Rule of thumb: the first image a visitor sees (logo, hero) is
eager; everything below the fold is lazy. If you add a new
above-the-fold image, set `loading="eager"` and
`fetchpriority="high"` on it; if you add a new listing/card image,
use `loading="lazy"`.

## Width, height, and CLS

`ImageMod` requires `width` and `height` props, and every call site
passes them. Always supply both for any new `ImageMod` usage —
they reserve the image's space before it loads and prevent
cumulative layout shift (CLS). Remote `<img>` output also carries
the same `width`/`height` attributes.

## Filenames and alt text

- Use lowercase, hyphenated filenames: `r2-example.jpg`, not
  `R2 Example.JPG`. URLs are case-sensitive on most hosts.
- Keep names stable once published — renaming a file breaks every
  post that references it.
- `alt` is a required prop on `ImageMod`. Write real alt text
  describing the image; use the post title for hero images
  (as `PostSingle.astro` does). Decorative images should still get
  an empty or meaningful `alt` through the component — never omit
  the prop.
- Do not put query strings or fragments on local image paths in
  frontmatter; `ImageMod` strips `?`/`#` when resolving local
  files, but the stored value should be clean.

## Dead code: `bgImageMod.ts`

`src/lib/utils/bgImageMod.ts` exists in the tree but has **zero
imports** — nothing uses it. It is unused dead code. Do not use it
for new work; use `ImageMod.astro` instead. (It is documented here
so nobody “discovers” it and wires it back in by mistake.)

## Future: Sitepins media upload (not implemented)

This section describes a possible future integration. **None of it
is implemented; do not treat it as a working feature.**

- `.sitepins/config.json` already declares
  `"media": "public/images"` — a CMS that honours this key would
  upload into `public/images/`, which is exactly where `ImageMod`
  looks for local images.
- `.sitepins/schema/blog.json` and `authors.json` already type the
  `image` / `og_image` fields as `media`, so a CMS media picker
  would fill them with paths under `public/images/` (or absolute
  URLs for remote storage).
- If a future media upload is added, the contract it must satisfy
  is: local uploads land in `public/images/` with the naming rules
  above; remote uploads return a full absolute `https://` URL that
  `ImageMod` and the SEO helpers render verbatim; and every upload
  records width/height so call sites can keep passing both props.

Until such an integration ships, images are added by committing
files to `public/images/` (local) or pasting a full URL into
frontmatter (remote).
