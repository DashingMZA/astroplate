# Astroplate

Astroplate is a free, open-source blog starter template built with Astro,
Tailwind CSS, and TypeScript. It ships with a homepage, blog, authors, tags,
categories, search, dark mode, and SEO-ready output — and it is configured
entirely through JSON files, so a new site can be set up without touching
code. See [CONFIGURATION.md](CONFIGURATION.md) for the full walkthrough.

> Origin: this template is based on the Astroplate starter by
> [Zeon Studio](https://zeon.studio/) (MIT licensed). This copy is configured
> for `astroplate.jadoo.bond` as its demo/default domain.

## Stack

| Piece | Version |
| --- | --- |
| Astro | 7.4.11 |
| React | 19.3.1 |
| Tailwind CSS | 4.3.5 |
| TypeScript | ^6.0.3 (pinned — `@astrojs/check` 0.9.12 does not support TS 7) |
| RSS | `@astrojs/rss` 4.0.19 |
| Package manager | pnpm 12.19.0 |
| Node.js | 24+ |

## Features

- Multi-author blog with author pages, tags, and categories
- Markdown / MDX content with syntax highlighting, table of contents,
  KaTeX math, and Mermaid diagrams
- Custom URL slugs per post/page (including Unicode and nested slugs),
  with duplicate-slug detection at build time
- Full-text search (client-side, built from content at build time)
  in an accessible modal dialog with keyboard navigation
- Dark mode with a theme switcher (system default)
- Pagination, similar-post suggestions, reading time
- SEO: absolute canonical URLs, Open Graph / Twitter cards with
  `og_title`/`og_description` priority chains, single `@graph`
  JSON-LD (WebSite + Organization + BlogPosting/BreadcrumbList/
  Person), sitemap with `lastmod`, `robots.txt`, and an RSS feed;
  `noindex` pages are excluded from the sitemap, RSS, search index,
  and LLM docs
- Security headers (CSP + `nosniff` + Referrer/Permissions-Policy +
  HSTS on HTTPS targets) for Cloudflare, Netlify, and nginx — see
  [SECURITY.md](SECURITY.md)
- LLM-ready docs generation: `llms.txt`, `llms-full.txt`, and per-page `.md`
- Google Tag Manager and Disqus support (both disabled by default;
  Disqus ships no JavaScript at all while disabled)
- Contact form with a configurable provider endpoint and an honest
  disabled state when none is configured — see
  [CONFIGURATION.md](CONFIGURATION.md)
- Responsive layout, skip link, visible keyboard focus,
  `prefers-reduced-motion` support, and semantic HTML — see
  [ACCESSIBILITY.md](ACCESSIBILITY.md)
- Responsive images (`srcset`/`sizes`, lazy by default, eager hero)
  with a missing-image fallback — see [IMAGE_STORAGE.md](IMAGE_STORAGE.md)
- Deployable as pure static output (`dist/`) to Cloudflare Workers,
  Netlify, Docker/nginx, or any static host; live on Vercel at
  https://astroplate.jadoo.bond

## Quick start

```bash
pnpm install --frozen-lockfile
pnpm dev      # local dev server
pnpm build    # production build into dist/
pnpm preview  # serve the production build locally
pnpm check    # astro check (type checking)
```

Full instructions, prerequisites, and troubleshooting:
[INSTALLATION.md](INSTALLATION.md).

## Project structure

```text
src/
  config/            # config.json, theme.json, menu.json, social.json
  content/           # blog posts, authors, pages, homepage, sections (Markdown/MDX)
  content.config.ts  # content-collection schemas (Zod)
  layouts/           # Base, PostSingle, components, partials, shortcodes
  lib/               # content parsing, taxonomy, SEO URL helpers
  pages/             # routes: index, blog, authors, tags, categories, rss.xml.ts, 404
  styles/            # Tailwind entry + generated theme CSS
scripts/             # themeGenerator, jsonGenerator (search index), llmsGenerator
public/images/       # local images served as-is
.sitepins/           # Sitepins CMS config + content schemas (mirror of content.config.ts)
```

Generated / build outputs (not source):

```text
dist/                # static production output (30 pages)
.json/               # generated search index (posts.json, search.json)
src/styles/generated-theme.css   # generated from src/config/theme.json
```

## Configuration

Everything site-specific lives in JSON — no code changes needed to
rebrand the site:

| File | Controls |
| --- | --- |
| `src/config/config.json` | Site title, domain, logo, publisher, settings, announcement, GTM, Disqus, metadata, LLM docs |
| `src/config/theme.json` | Colors (light/dark) and fonts |
| `src/config/menu.json` | Main and footer navigation |
| `src/config/social.json` | Social links in the header/footer |

Worked example for launching a new, independent website:
[CONFIGURATION.md](CONFIGURATION.md).

## Content

Content is Markdown/MDX under `src/content/`:

- `src/content/blog/` — blog posts (one file per post; the filename is the URL slug)
- `src/content/authors/` — author profiles
- `src/content/pages/` — standalone pages (about, contact, privacy policy, …)
- `src/content/homepage/` and `src/content/sections/` — homepage and CTA/testimonial sections

Field reference, validation rules, and examples (minimal post, full post,
multi-author post, draft, remote/R2-image post):
[CONTENT_SCHEMA.md](CONTENT_SCHEMA.md).

## SEO

What each page type emits (canonical, Open Graph, Twitter, JSON-LD,
sitemap, robots, RSS), how to set per-post SEO fields, and how to verify
the built output: [SEO_GUIDE.md](SEO_GUIDE.md).

## Images

Local images live in `public/images/` and are optimized by Astro Image
with responsive variants (`srcset`/`sizes`, lazy by default, eager
hero/logo). Absolute `http(s)://`, protocol-relative `//`, and `data:`
URLs are rendered verbatim as plain `<img>` — never rewritten or
prefixed — so images hosted on R2/S3/a CDN work by pasting the full
URL. Missing images fall back to a bundled placeholder instead of
rendering nothing or a broken-image icon.
Details: [IMAGE_STORAGE.md](IMAGE_STORAGE.md).

## Deployment

The build output is fully static (`dist/`). Targets already present in
the repo: Cloudflare Workers (`wrangler.jsonc`), Netlify
(`netlify.toml`), and Docker/nginx (`Dockerfile`). The live
production site is on Vercel at https://astroplate.jadoo.bond
(dashboard-managed deployment — there is no `vercel.json` in the
repo). No secrets are needed for the static build. Steps and
post-deploy smoke checks: [DEPLOYMENT.md](DEPLOYMENT.md).

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Theme generator (watch) + search-index generator + Astro dev server |
| `pnpm build` | Theme generator + search-index generator + Astro build + LLM docs generator |
| `pnpm preview` | Serve `dist/` locally |
| `pnpm check` | `astro check` — type checking, 0 errors expected |
| `pnpm lint` | ESLint over the repo — 0 errors expected |
| `pnpm test` | `node:test` suite in `tests/` — all tests expected to pass |
| `pnpm format` | Prettier over `./src` |
| `pnpm generate-json` | Regenerate the `.json/` search index only |
| `pnpm generate-llms` | Regenerate LLM docs from `dist/` only |
| `pnpm remove-darkmode` | Remove dark-mode support, then format |
| `pnpm deploy:cf-workers` | Build, then `wrangler deploy` |
| `pnpm preview:cf-workers` | Build, then `wrangler dev` |

## Known limitations

Honest list of what this template does not (yet) do — see
[CHANGELOG.md](CHANGELOG.md) under “Known limitations”. In short:
the `featured` frontmatter field is accepted but no featured-post UI
exists; there is no `SearchAction` JSON-LD (search is a client-side
modal, not a results page); `motion` was evaluated for the search modal and removed —
`motion/react` would add ~144 KB to the search chunk for a 150 ms fade
(the modal animates with a CSS transition instead, and
`motion/react-mini` has no `AnimatePresence`);
no Lighthouse/Core Web Vitals measurement has been run; CodeQL
verification is pending the next push; Docker is untested live;
and there is no multilingual/hreflang support.

## License

MIT — see [LICENSE](LICENSE). Demo images are for demonstration only and
carry their own licenses.
