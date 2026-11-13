# Changelog

All notable changes to this project are documented here. The format
is based on Keep a Changelog. This copy does not use version numbers
for the upgrade below — it is tracked as **Unreleased** until a
release is cut.

## Unreleased

### Wave C — accessibility, contact form, images, security headers, performance, docs

- **Accessibility (P0):** mobile nav toggle is a real `<button>` with
  dynamic `aria-expanded` / `aria-label` ("Open menu" / "Close menu"),
  `aria-controls` to the menu, Escape closes and returns focus to the
  toggle, and submenu toggles are keyboard-reachable buttons
  (`focus-within`, never hover-only — no more `lg:invisible` trapping
  links out of the tab order). Search modal is a `role="dialog"`
  (`aria-modal`, accessible label, focus trap, focus returns to the
  trigger, real clear button, arrow-key handling only while open).
  Accordion and Tabs implement the full ARIA patterns (accordion:
  `aria-expanded`/`aria-controls` + `role="region"`; tabs: `tablist`/
  `tab`/`tabpanel` with arrow-key/Home/End navigation). Global
  `:focus-visible` outline, no more focus suppression on search/form
  inputs, and a `prefers-reduced-motion` media query that disables
  smooth scrolling/transitions/animations (including the testimonial
  autoplay).
- **Contact form:** configurable endpoint via `contact_form.action`
  in `config.json` (legacy fallback `params.contact_form_action`);
  unconfigured = visibly disabled form with setup instructions and a
  build warning, never a fake success; configured = validated
  submission with accessible labels, `autocomplete`, `aria-describedby`
  errors, and real success/error feedback. Provider setup documented
  in `CONFIGURATION.md` (Formspree / Getform / Netlify Forms).
- **Images:** `ImageMod` defaults to `loading="lazy"` with responsive
  `srcset`/`sizes` for local images (hero, post hero, features,
  cards, CTA); hero/logo stay `eager` + `fetchpriority="high"`;
  descriptive hero alt text (was the generic `"banner"`); missing
  local images render a bundled placeholder instead of nothing, and
  dead remote images fall back to the same placeholder at runtime.
  Default OG image is now a 1200×630 JPEG (45,694 B), down from the
  460,475 B 3600×2400 PNG — same image, no quality loss.
- **Security headers:** CSP + `nosniff` + Referrer/Permissions-Policy
  configured identically for Cloudflare (`public/_headers`, HSTS),
  Netlify (`netlify.toml`, HSTS), and nginx (`config/nginx/nginx.conf`,
  no HSTS — HTTP-only container). See `SECURITY.md` for the CSP domain
  inventory and the documented `unsafe-inline` trade-off. Vercel is
  not covered (no `vercel.json` in the repo; add headers in the
  dashboard).
- **Performance:** the announcement banner is now a dependency-free
  Astro component (no React island, no JS chunk on every page);
  Disqus ships no JavaScript while disabled; dead code removed
  (`bgImageMod.ts`, `useTheme.ts`); duplicated search-item types
  consolidated to one definition (`src/layouts/helpers/searchTypes.ts`).
- **Lint / types:** `pnpm run lint` exits 0 (was 40 errors);
  `contentParser` / `taxonomyParser` converted from `.astro` to `.ts`
  modules (all 18 importers updated); `astro check` 0 errors.
- **Docs:** README, INSTALLATION, CONFIGURATION, CONTENT_SCHEMA,
  SEO_GUIDE, IMAGE_STORAGE, DEPLOYMENT, SECURITY, and ACCESSIBILITY
  rewritten to match the actual implementation after Waves A+B+C.
- **Tests:** new `node:test` suites for contact-form config resolution,
  header-config validity, and image URL handling.
- **Known:** `motion` is installed but not wired into the search modal
  — `motion/react` would grow the search chunk from ~18 KB to ~162 KB
  for a 150 ms fade, and `motion/react-mini` has no `AnimatePresence`;
  the modal animates with a CSS transition instead. The Disqus chunk
  is still emitted by the build but is referenced by no page while
  Disqus is disabled.


Upgrade of the Astroplate template: Astro 7.4.11 (from 7.1.4),
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

- Astro 7.1.4 → 7.4.11; React 19.3.1; Tailwind CSS 4.3.5.
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

- Security headers (CSP, `nosniff`, Referrer/Permissions-Policy,
  HSTS where HTTPS is guaranteed) are configured for Cloudflare,
  Netlify, and nginx — see `SECURITY.md`. Vercel is not covered (no
  `vercel.json`); add headers in the dashboard and verify with
  `curl -I`.
- CSP uses `'unsafe-inline'` for scripts/styles — a documented
  trade-off (Astro inline scripts on every page; static hosts cannot
  inject nonces). See `SECURITY.md` for the full reasoning.
- The CSP allow-lists only domains actually used (`media.csofts.tech`
  R2, YouTube-nocookie / i.ytimg, w3schools demo video, Formspree /
  Getform for the contact form). GTM/Disqus domains are deliberately
  absent while both are disabled.
- No API keys or secrets are in the repo; the contact form has no
  backend of its own and no endpoint is ever invented.

### Known limitations

- `featured` frontmatter is accepted but unconsumed — no featured-post
  UI exists.
- No `SearchAction` JSON-LD — search is a client-side modal, not a
  search-results page.
- No Lighthouse / Core Web Vitals measurement has been run — no
  performance-score claims are made.
- CodeQL verification is pending the next push.
- Docker is untested live (image builds; the container has not been
  run end-to-end against a live domain).
- GitHub Pages workflow is manual-only (`workflow_dispatch`); the
  Pages deployment itself is unverified live, and Pages cannot serve
  custom security headers.
- No multilingual / hreflang support — single-language site.
