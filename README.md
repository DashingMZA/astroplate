# Astroplate

Astroplate is a free, open-source blog starter template built with Astro,
Tailwind CSS, and TypeScript. It ships with a homepage, blog, authors, tags,
categories, search, dark mode, and SEO-ready output — and it is configured
entirely through JSON files, so a new site can be set up without touching
code. See [CONFIGURATION.md](CONFIGURATION.md) for the full walkthrough.

> Origin: this template is based on the Astroplate starter by
> [Zeon Studio](https://zeon.studio/) (MIT licensed). This copy is configured
> for `astroplate.csofts.tech` as its demo/default domain.

## Stack

| Piece | Version |
| --- | --- |
| Astro | 7.4.10 |
| React | 19.3.1 |
| Tailwind CSS | 4.3.5 |
| TypeScript | strict mode (`astro/tsconfigs/strict`) |
| RSS | `@astrojs/rss` 4.0.19 |
| Package manager | pnpm 11.17.0 |
| Node.js | 24+ |

## Features

- Multi-author blog with author pages, tags, and categories
- Markdown / MDX content with syntax highlighting and table of contents
- Full-text search (client-side, built from content at build time)
- Dark mode with a theme switcher (system default)
- Pagination, similar-post suggestions, reading time
- SEO: absolute canonical URLs, Open Graph / Twitter cards, JSON-LD
  structured data, sitemap, `robots.txt`, and an RSS feed
- LLM-ready docs generation: `llms.txt`, `llms-full.txt`, and per-page `.md`
- Google Tag Manager and Disqus support (both disabled by default)
- Responsive layout, skip link, and semantic HTML
- Deployable as pure static output (`dist/`) to Cloudflare Workers,
  Netlify, Docker/nginx, or any static host

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

Local images live in `public/images/` and are optimized by Astro Image.
Absolute `http(s)://`, protocol-relative `//`, and `data:` URLs are
rendered verbatim as plain `<img>` — never rewritten or prefixed — so
images hosted on R2/S3/a CDN work by pasting the full URL.
Details: [IMAGE_STORAGE.md](IMAGE_STORAGE.md).

## Deployment

The build output is fully static (`dist/`). Targets already present in
the repo: Cloudflare Workers (`wrangler.jsonc`), Netlify
(`netlify.toml`), and Docker/nginx (`Dockerfile`). No secrets are needed
for the static build. Steps and post-deploy smoke checks:
[DEPLOYMENT.md](DEPLOYMENT.md).

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Theme generator (watch) + search-index generator + Astro dev server |
| `pnpm build` | Theme generator + search-index generator + Astro build + LLM docs generator |
| `pnpm preview` | Serve `dist/` locally |
| `pnpm check` | `astro check` — type checking, 0 errors expected |
| `pnpm format` | Prettier over `./src` |
| `pnpm generate-json` | Regenerate the `.json/` search index only |
| `pnpm generate-llms` | Regenerate LLM docs from `dist/` only |
| `pnpm remove-darkmode` | Remove dark-mode support, then format |
| `pnpm deploy:cf-workers` | Build, then `wrangler deploy` |
| `pnpm preview:cf-workers` | Build, then `wrangler dev` |

## Known limitations

Honest list of what this template does not (yet) do — see
[CHANGELOG.md](CHANGELOG.md) under “Known limitations”. In short: a custom
`slug` in frontmatter is stored but routing still uses the filename;
`og_description` is accepted but not yet used as a distinct social
description; the mobile nav `aria-expanded` is static; no security
headers are configured on any host; no Lighthouse/Core Web Vitals
measurement has been run; the contact form posts to `"#"` (no backend);
and there is no multilingual/hreflang support.

## License

MIT — see [LICENSE](LICENSE). Demo images are for demonstration only and
carry their own licenses.
