# Contributing to Astroplate

Thanks for helping improve Astroplate — an Astro 7 publishing theme used by
many independent content sites. Please read this guide before opening a pull
request.

## Ground rules

- **One theme, many sites.** Never hardcode one site's branding, domain,
  content, or authors. Everything site-specific belongs in `src/config/`
  (`config.json`, `theme.json`, `menu.json`, `social.json`) or in content
  frontmatter. See `CONFIGURATION.md`.
- **Do not touch other projects.** No changes to Sitepins / Sketivo, PowerAI
  Astro, or Geeky Astro — this repo only.
- **No deploys.** Do not deploy to production, and do not add workflows that
  deploy on push. The Pages deploy workflow runs on pushes to `main` and via
  `workflow_dispatch`; PRs are checked by `ci.yml` and never deploy.
- **Follow the Code of Conduct** (`CODE_OF_CONDUCT.md`).

## Setup

Requirements:

- **Node.js 24+** (`node --version`)
- **pnpm 11** (`pnpm --version`) — the repo pins `pnpm@11.17.0` in
  `package.json` (`packageManager`); use Corepack (`corepack enable`) or
  install pnpm 11 directly. Do not use npm or yarn for installs.

```bash
git clone https://github.com/DashingMZA/astroplate.git
cd astroplate
pnpm install --frozen-lockfile
pnpm run dev        # local dev server (http://localhost:4321)
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm run dev` | Dev server with theme + JSON generators |
| `pnpm run build` | Full production build (`dist/`) |
| `pnpm run check` | `astro check` — typecheck, must be 0 errors |
| `npx prettier --check ./src` | Format check (CI runs this) |
| `pnpm format` | Format `src/` with Prettier |

All four checks must pass before a PR is ready: install, `check`, format
check, and `build`.

## Branch and PR flow

1. Fork the repo and create a branch from `main`:
   `git checkout -b fix/short-description` (or `feature/...`, `docs/...`).
2. Make focused changes — one concern per PR.
3. Fill in the pull request template: summary, type of change, testing done
   (the four commands above), and screenshots for any UI change.
4. Keep commits logical and reviewable; write clear commit messages.
5. CI (`.github/workflows/ci.yml`) runs on pull requests only. A green CI
   run is required before merge.

## Content and config conventions

- **Posts** live in `src/content/blog/` as Markdown with validated
  frontmatter — see `CONTENT_SCHEMA.md` for every field (`slug`, `excerpt`,
  `authors[]`, `categories`, `tags`, `featured`, `canonical`, `noindex`,
  `og_image`, ...). Drafts stay out of the build, sitemap, and RSS.
- **Authors** live in `src/content/authors/`; posts reference them by
  display name in `authors[]`.
- **Images:** local images go in `public/images/`; remote images (e.g.
  Cloudflare R2 / S3) are absolute URLs and must be rendered verbatim —
  never prepend the site domain. See `IMAGE_STORAGE.md`.
- **SEO:** every page needs a unique title/description and an absolute
  canonical; posts use `og:type=article` with one Article JSON-LD block.
  See `SEO_GUIDE.md`. Do not invent metadata — generate it from validated
  site and article data.
- **Styling:** Tailwind CSS 4 (see `src/styles/`). Keep the design
  professional and readable; avoid unnecessary animations and oversized UI.

## Docs

If your change affects behavior, config, or the content schema, update the
matching doc: `README.md`, `INSTALLATION.md`, `CONFIGURATION.md`,
`CONTENT_SCHEMA.md`, `SEO_GUIDE.md`, `IMAGE_STORAGE.md`, `DEPLOYMENT.md`,
or `CHANGELOG.md`.

## What not to do

- Don't commit `node_modules/`, `dist/`, or `.astro/` (all gitignored).
- Don't change `Dockerfile`'s Node version or workflow Node versions
  without noting it — the project requires Node 24+.
- Don't add dependencies without justification; prefer the smallest change
  that solves the problem.
- Don't report a security issue as a public issue — see `SECURITY.md`.

## Questions

Open a blank discussion via an issue using the feature-request template, or
check the docs linked in `.github/ISSUE_TEMPLATE/config.yml` first.
