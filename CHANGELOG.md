# Changelog

All notable changes to this project are documented here. The format
is based on Keep a Changelog. This copy does not use version numbers
for the upgrade below — it is tracked as **Unreleased** until a
release is cut.

## Unreleased

Upgrade of the Astroplate template: Astro 7.4.10 (from 7.1.4),
React 19.3.1, Tailwind CSS 4.3.5, `@astrojs/rss` 4.0.19 (new),
TypeScript strict mode. `pnpm check` reports 0 errors and the
production build emits 30 pages.

### Added

- RSS feed at `/rss.xml` (`src/pages/rss.xml.ts`, `@astrojs/rss`),
  with the 5 demo posts; drafts, `-`-prefixed files, and
  future-dated posts excluded, newest first.
- JSON-LD `Article` structured data on blog posts — exactly one
  block per post, built in `src/pages/blog/[single].astro` and
  rendered via `src/layouts/components/JsonLd.astro` (with `</`
  escaping so content can never break out of the script element).
- Article Open Graph tags on posts: `article:published_time`,
  `article:modified_time`, `article:author` (one per author),
  `article:section` (first category), `article:tag` (one per tag);
  `og:type` is `article` on posts, `website` elsewhere.
- Blog content fields: `excerpt`, `slug`, `updated`, `lastmod`,
  `og_image`, `og_title`, `og_description`, `authors` (multi-author
  array), `featured`, `canonical`, `noindex`, `draft`. Author
  schema gained `email` (previously present in author files but
  silently dropped by validation).
- `.sitepins/schema/*.json` mirrors the Zod schema 1:1 — blog gained
  11 new entries, pages gained an `image` entry, authors `email`
  was already present.
- Absolute canonical URLs on every page, with `og:url` equal to the
  canonical; OG/Twitter images never prepend the site domain to
  absolute URLs (`src/lib/utils/seo.ts`: `absoluteUrl`,
  `canonicalFor`, `resolveImage`, `isAbsoluteUrl`).
- Sitemap index + `sitemap-0.xml` (29 URLs) with `/404` and
  `draft`/`drafts`/`preview`/`private` segments excluded;
  `robots.txt` with a `Sitemap:` line.
- Skip link (“Skip to content”, `#main-content`) in `Base.astro`.
- Remote-image support in `ImageMod.astro`: absolute `http(s)://`,
  protocol-relative `//`, and `data:` URLs render verbatim as plain
  `<img>`; local images under `public/images/` go through Astro
  Image, including `webp`/`avif` sources. Demo post
  `post-r2-example.md` proves the remote path end to end.
- Publisher configuration (`publisher.name`, `type`, `logo`, `url`)
  in `config.json`, consumed by JSON-LD.
- `site.language` (`"en"`) and `site.locale` (`"en_US"`) in
  `config.json`, driving `<html lang>` and `og:locale`.
- LLM docs configuration (`llms` block in `config.json`:
  `generate_llms_txt`, `generate_llms_full_txt`,
  `generate_individual_md`, `include`, `exclude`).
- Documentation set: `README.md`, `INSTALLATION.md`,
  `CONFIGURATION.md`, `CONTENT_SCHEMA.md`, `SEO_GUIDE.md`,
  `IMAGE_STORAGE.md`, `DEPLOYMENT.md`, and this changelog.
  The old lowercase `readme.md` was removed (superseded by
  `README.md`).

### Changed

- Astro 7.1.4 → 7.4.10; React 19.3.1; Tailwind CSS 4.3.5.
- TypeScript strict mode (`astro/tsconfigs/strict`, `"strict": true`).
- `ImageMod.astro` rewritten around the verbatim-remote rule and
  the `public/images/` glob (see [IMAGE_STORAGE.md](IMAGE_STORAGE.md)).
- `Base.astro` rewritten: canonical always emitted, OG/Twitter
  image resolution via `seo.ts`, article meta support, JSON-LD
  via prop, skip link, RSS autodiscovery link.
- Blog post routing data (`[single].astro`) now resolves the
  display author list, the SEO image (`og_image ?? image`), and
  the modified date (`updated ?? lastmod ?? date`) in one place.
- Search input is regex-escaped (`escapeRegExp` in `seo.ts`, used
  by `SearchModal`/`SearchResult`), so characters like `(`, `[`,
  `*`, `+` no longer throw or change match semantics.
- Pagination marks the current page with `aria-current="page"`.
- Disqus and Google Tag Manager remain supported but are disabled
  by default (`disqus.enable: false`,
  `google_tag_manager.enable: false`).

### Fixed

- OG/Twitter images no longer get the site domain prepended to
  absolute (R2/CDN) URLs.
- Author `email` frontmatter no longer silently dropped by
  validation.
- Search no longer crashes on regex special characters in the
  query.
- Pagination current page is now exposed to assistive technology
  (`aria-current`).
- Local images in `webp`/`avif` are now found by the image glob
  (previously only legacy formats were matched).

### Security notes

- JSON-LD output escapes `</` sequences (`JsonLd.astro`), so post
  content cannot break out of the structured-data script element.
- Search input is escaped before being compiled into a RegExp
  (see above).
- No security headers are configured on any host
  (Cloudflare Workers, Netlify, Docker/nginx). This is a known
  gap, not a shipped feature — see “Known limitations”.
- The contact form posts to `"#"` (no backend). Do not collect
  real submissions until a real endpoint is configured.

### Known limitations

Honest list of what is not done or not verified in this upgrade:

- **Custom `slug` is stored but routing still uses the filename.**
  Setting `slug` in frontmatter does not change a post's URL;
  the URL stays `/blog/<filename>/`.
- **`og_description` is accepted by the schema but not yet
  consumed** as a distinct social description. The social
  description always comes from `description`.
- **Nav `aria-expanded` is static.** The mobile menu is a
  checkbox hack; the `aria-expanded="false"` attribute on the
  menu label is never flipped by JavaScript, so it does not
  reflect the menu's open/closed state.
- **No security headers** configured on any host.
- **No Lighthouse / PageSpeed measurement was run**, so no Core
  Web Vitals or performance-score claims are made. (Do not carry
  forward the old readme's PageSpeed 100% claim — it predates
  this upgrade and was not re-measured.)
- **The `markdown.remarkPlugins` deprecation notice still prints
  during build.** The config already uses `unified()`; the notice
  comes from MDX defaults, not from this repo's config.
- **Contact form action is `"#"`** — a dead end until a real
  form endpoint is configured.
- **GitHub Pages workflow is unverified**: it contains a literal
  `$default-branch` placeholder in the branch trigger and pins
  Node 20, while the project targets Node 24+.
- **Multilingual / hreflang is NOT implemented.** The site is
  single-language; the old multilingual demo claim does not
  apply to this copy.
- **`bgImageMod.ts` is dead code** (zero imports). It is
  documented as unused in [IMAGE_STORAGE.md](IMAGE_STORAGE.md);
  do not wire it back in.
- **Deploy targets were not deployed or tested live** from this
  copy (Cloudflare Workers, Netlify, Docker). The Docker image
  also pins a `node:22.20.0-alpine` base, differing from the
  Node 24+ local requirement.
- **No deployment is live from this upgrade** until someone runs
  the deploy steps in [DEPLOYMENT.md](DEPLOYMENT.md) and passes
  the post-deploy smoke checks.
