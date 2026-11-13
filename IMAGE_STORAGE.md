# Image Storage

## Where images live

| Kind | Location | Example |
| --- | --- | --- |
| Local images | `public/images/` | `/images/logo.png`, `/images/image-placeholder.png` |
| Remote images | Any public URL (R2, S3, CDN, …) | `https://media.csofts.tech/images/r2-example.jpg` |
| Favicons / logos / OG defaults | `public/images/` (paths in `config.json`) | `favicon.png`, `logo.png`, `og-image.jpg` |

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
  `Image not found - <src>` error at build time and renders the
  bundled placeholder (`/images/image-placeholder.png`) at the
  requested dimensions, with the `alt` text — the layout does not
  collapse and no broken image is shown. Remote images never hit
  this branch; a dead remote URL instead falls back to the same
  placeholder at runtime (see “Missing-image fallback” below).

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

- **OG / share images:** 1200×630 px. No `og:image:width` /
  `og:image:height` is emitted — dimensions are not known at render
  time and the old hardcoded 1200×630 was wrong for most images.
  The default OG image is `/images/og-image.jpg` (1200×630 JPEG,
  quality 80, 45,694 B), resized from the old 3600×2400 PNG
  (460,475 B) with no visible quality loss.
- **Post hero:** rendered at 1200×500 (`PostSingle.astro`).
- **Logo:** configured in `config.json` (`logo_width` / `logo_height`,
  currently 150×30). Supply both `logo.png` and `logo-darkmode.png`.
- **Avatars:** square images; author avatars live in
  `public/images/` (e.g. `avatar.png`).
- **Formats:** prefer `webp` (or `avif`) for photos; `png` for logos
  and graphics needing transparency; `svg` for icons. `ImageMod`
  accepts all of them for local files.

## Responsive images (`srcset` / `sizes`)

Local images get responsive variants from Astro `<Image>` via the
`widths` + `sizes` props on `ImageMod`:

| Usage | `sizes` | `widths` |
| --- | --- | --- |
| Homepage hero (`src/pages/index.astro`) | `(max-width: 768px) 100vw, 1200px` | `640, 1024, 1200` |
| Post hero (`PostSingle.astro`) | `(max-width: 768px) 100vw, 1200px` | `640, 1024, 1200` |
| Feature images (`src/pages/index.astro`) | `(max-width: 768px) 100vw, 520px` | `520, 780` |
| Blog cards (`BlogCard.astro`) | `(max-width: 768px) 100vw, 445px` | `445, 890` |
| CTA image (`CallToAction.astro`) | `(max-width: 768px) 100vw, 392px` | `392, 784` |

Remote (R2/CDN) images have no local variants, so `widths` is
ignored for them — their absolute URL is preserved verbatim and only
the `sizes` attribute is emitted. The logo is a fixed-size image and
needs no variants.

## Lazy vs eager loading

`ImageMod` defaults to `loading="lazy"`; only callers that
explicitly pass `loading="eager"` load eagerly:

| Usage | Loading | Fetch priority |
| --- | --- | --- |
| Logo (`Logo.astro`) | `eager` | `high` |
| Homepage hero (`src/pages/index.astro`) | `eager` | `high` |
| Post hero (`PostSingle.astro`) | `eager` | `high` |
| Blog cards (`BlogCard.astro`) | `lazy` | — |
| Feature / CTA images | `lazy` (default) | — |
| Author avatars (`AuthorCard.astro`) | `lazy` (default) | — |

Rule of thumb: the first image a visitor sees (logo, hero) is
eager; everything below the fold is lazy. If you add a new
above-the-fold image, set `loading="eager"` and
`fetchpriority="high"` on it; anything else can rely on the lazy
default.

## Missing-image fallback

Two paths, both landing on `/images/image-placeholder.png`
(a bundled 4,881 B PNG):

- **Local image not found at build time:** `ImageMod` logs the red
  `Image not found` error and renders the placeholder at the
  requested width/height, with the `alt` text.
- **Remote image fails at runtime** (dead R2/CDN URL): the `<img>`
  carries `data-image-fallback="/images/image-placeholder.png"`,
  and a single delegated capture-phase `error` listener (in
  `ImageMod.astro`, guarded against double-binding across
  view-transition swaps) swaps the `src` to the placeholder. No
  inline `onerror` handler is used, so nothing about the fallback
  needs a CSP exception.

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

## Dead code: `bgImageMod.ts` (removed)

`src/lib/utils/bgImageMod.ts` was dead code (zero imports) that
still contained the old buggy `/public${src}` prefix pattern, so it
was **deleted** — it no longer exists in the tree. Do not recreate
it; use `ImageMod.astro` instead.

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
