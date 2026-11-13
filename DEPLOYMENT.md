# Deployment

The build output is fully static. `pnpm build` produces `dist/`
(30 pages), which can be served by any static host. There is no
server component, no database, and no runtime secrets needed for
the static build.

> Status: the live production site is on **Vercel at
> https://astroplate.jadoo.bond** (dashboard-managed deployment,
> verified serving HTTP 200 with the custom domain). The Cloudflare,
> Netlify, and Docker targets below are present in the repo but have
> not been deployed or tested live from this copy — the instructions
> describe what the repo configures, not a verified live deployment
> for those targets.

## Build first

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm preview   # sanity-check dist/ locally before deploying
```

`pnpm build` runs the theme generator, the search-index generator,
`astro build`, and the LLM docs generator. If `dist/` is missing or
stale, deploy nothing — rebuild.

### Manual-deploy posture

Deployments are manual: build, preview, verify (see “After deploy”
below), then deploy. Nothing in this repo auto-deploys on push.
The GitHub Pages workflow (`.github/workflows/`) is **not** verified
(see “GitHub Pages” below) and should not be relied on until it has
been triggered once and confirmed.

## Cloudflare Workers

Configured in `wrangler.jsonc` (Static Assets):

```jsonc
{
  "name": "astroplate",
  "compatibility_date": "2026-11-09",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "404-page",
  },
}
```

Commands (from `package.json`):

```bash
pnpm run deploy:cf-workers    # build, then wrangler deploy
pnpm run preview:cf-workers   # build, then wrangler dev
```

Notes:

- `not_found_handling: "404-page"` serves the built `404.html` for
  unknown routes.
- `wrangler deploy` requires a Cloudflare account and login
  (`wrangler login`) — credentials live outside this repo.
- The worker name is `astroplate`; no custom domain is configured
  in `wrangler.jsonc` — a custom domain, if one is wanted for this
  target, is attached in the Cloudflare dashboard. (An earlier
  version of this doc named `astroplate.csofts.tech` as the demo
  domain; that was never recorded in the repo config and is not
  verified — do not treat it as the Cloudflare domain. The live
  production domain is https://astroplate.jadoo.bond on Vercel.)
- Security headers for this target come from `public/_headers`,
  which the build copies to `dist/_headers` — see
  [SECURITY.md](SECURITY.md).

## Vercel (live)

The live production site is **https://astroplate.jadoo.bond**,
deployed from this repo through the Vercel dashboard (Git push
auto-deploys production). There is **no `vercel.json` in the repo**
— deployment is dashboard-managed on purpose, so the Vercel
project settings (framework preset, Node version, custom domain)
live in the dashboard, not in code.

One consequence: the security headers configured in this repo
(`public/_headers`, `netlify.toml`, nginx) are **not** served by
Vercel — Vercel does not read `_headers` files. Until headers are
added in the Vercel dashboard (or a `vercel.json` is introduced),
the live Vercel site does not send the CSP / HSTS / `nosniff`
headers documented in [SECURITY.md](SECURITY.md). See that file
before claiming the live site is header-hardened.

## Netlify

Configured in `netlify.toml`:

```toml
[build]
publish = "dist"
command = "pnpm build"

[build.environment]
NODE_VERSION = "24"
```

Connect the repo in the Netlify dashboard (or use the Netlify CLI)
with build command `pnpm build` and publish directory `dist`.
No environment variables are required for the static build. The
old upstream demo (`astroplate.netlify.app`) is not this copy's
deployment. Security headers are configured in the same file
(`[[headers]]` for `/*`, including HSTS) — see
[SECURITY.md](SECURITY.md).

## Static hosting (any host)

Copy the contents of `dist/` to any static host (Vercel, GitHub
Pages, S3 + CloudFront, nginx, …). Requirements:

- Serve `index.html` files at their directory paths
  (`/blog/post-1/` → `dist/blog/post-1/index.html`).
- Serve `dist/404.html` for unknown routes with a 404 status.
- Serve `dist/robots.txt`, `dist/sitemap-index.xml`,
  `dist/sitemap-0.xml`, and `dist/rss.xml` at the site root.
- Respect `site.trailing_slash` in `config.json`: the build emits
  URLs with or without trailing slashes accordingly; the host
  should not force the opposite form, or canonical URLs and served
  URLs will disagree.

## Docker (nginx)

`Dockerfile` is a multi-stage build: install deps → build →
serve `dist/` with nginx. The nginx config is
`config/nginx/nginx.conf` (gzip on, `try_files $uri ${uri}.html
$uri/index.html =404`, `error_page 404 /404.html`, plus the
security headers documented in [SECURITY.md](SECURITY.md) —
CSP, `nosniff`, Referrer/Permissions-Policy, but **no HSTS**:
the container listens on port 80 only, so HSTS must be added at
the TLS-terminating reverse proxy in front of it).

```bash
docker build -t astroplate .
docker run -p 3000:80 astroplate
# shell inside the container:
docker run -it --rm astroplate ash
```

The default installer is pnpm (`ARG INSTALLER=pnpm`); `npm` and
`yarn` are also supported via `--build-arg INSTALLER=npm|yarn`.

> Note: the `Dockerfile` uses a `node:24-alpine` base image,
> matching the Node 24+ local-dev requirement in
> [INSTALLATION.md](INSTALLATION.md), and pins pnpm to the exact
> version in `package.json` (12.19.0). It has not been verified
> against the current dependency set — treat the Docker path as
> untested until someone builds and runs it.

## GitHub Pages

`.github/workflows/deploy-to-github-pages.yml` exists but is
**unverified**: it triggers on `workflow_dispatch` only and pins
`node-version: "24"`, matching the project target. Trigger the
workflow manually once and confirm the deployment before relying
on it.

## Environment considerations

- **No secrets are needed for the static build.** There are no
  API keys in the build path.
- Optional integrations, all configured in `src/config/config.json`:
  - Google Tag Manager: disabled by default; set `enable: true`
    and a real `gtm_id` (the placeholder is `GTM-XXXXXX`).
  - Disqus: disabled by default; set `enable: true` and your
    `shortname` (the placeholder is `csofts-template`).
  - Contact form: `contact_form.action` is empty by default —
    the page renders a disabled form until a real provider
    endpoint is configured (see [CONFIGURATION.md](CONFIGURATION.md)).
- `site.base_url` **must** be the production domain before
  building for release. Canonical URLs, sitemap, RSS, and OG URLs
  are all baked in at build time; deploying the same `dist/` to a
  different domain serves wrong canonicals. Rebuild after any
  `base_url` change.
- The same applies to `public/robots.txt`: its `Sitemap:` line
  names the domain explicitly and is not generated from
  `config.json` — keep the two in sync.

## Sandbox EPERM note (sandbox only, not a product requirement)

In this sandbox, `pnpm install` can fail with `EPERM` `chown` /
`fchown` errors while writing lockfiles, because the mount forbids
`chown`. Regenerating a missing lockfile with
`pnpm install --lockfile-only` worked, and running `pnpm build`'s
pre-check can trigger the same error — running the build steps
directly bypasses it:

```bash
node scripts/themeGenerator.js && node scripts/jsonGenerator.js && npx astro build
```

**Do not present this as expected behaviour on a normal machine.**
On normal machines `pnpm install --frozen-lockfile` and `pnpm build`
work as documented. See [INSTALLATION.md](INSTALLATION.md).

## What to check after deploy

Run these against the live domain (replace the domain with yours):

```bash
DOMAIN="https://astroplate.jadoo.bond"

# Home page serves, canonical is absolute and self-referential
curl -s $DOMAIN/ | grep -o '<link rel="canonical" href="[^"]*"'

# Sitemap index + sitemap resolve, no /404 entry
curl -s $DOMAIN/sitemap-index.xml
curl -s $DOMAIN/sitemap-0.xml | grep -o "<loc>[^<]*</loc>" | head
curl -s $DOMAIN/sitemap-0.xml | grep -c 404   # expect 0

# robots.txt serves and names the sitemap
curl -s $DOMAIN/robots.txt

# RSS serves with items
curl -s $DOMAIN/rss.xml | grep -o "<item>" | wc -l   # expect 5

# A post: OG article tags + exactly one JSON-LD Article
curl -s $DOMAIN/blog/post-1/ | grep -o '<meta property="og:type" content="[^"]*"'
curl -s $DOMAIN/blog/post-1/ | grep -c '"@type":"Article"'   # expect 1

# Unknown URL serves the custom 404 page
curl -s -o /dev/null -w "%{http_code}\n" $DOMAIN/this-page-does-not-exist
```

Also verify in a browser: the homepage renders, the theme switcher
works, search opens and returns results, a blog post shows its hero
image (including the remote-image demo post `/blog/post-r2-example/`),
and the mobile menu opens (button toggle, `aria-expanded` flips,
Escape closes it, submenu opens on keyboard focus).

# Verify the security headers are actually served (host-dependent)
curl -s -I $DOMAIN/ | grep -i "content-security-policy\|strict-transport\|x-content-type-options\|referrer-policy\|permissions-policy"

## Security headers

Security headers **are** configured in the repo — one CSP, kept
identical across all three targets (see [SECURITY.md](SECURITY.md)
for the domain inventory and the `unsafe-inline` trade-off):

- Cloudflare: `public/_headers` (copied to `dist/_headers` by the
  build; includes HSTS).
- Netlify: `[[headers]]` in `netlify.toml` (includes HSTS).
- Docker/nginx: `add_header` in `config/nginx/nginx.conf`
  (**no HSTS** — the container is HTTP-only; add it at the TLS
  terminator).
- Vercel: **not covered** — Vercel ignores `_headers` files and
  there is no `vercel.json` in the repo, so the live Vercel site
  needs headers added in the dashboard. Do not claim the live site
  ships hardened headers until that is done and verified with the
  `curl -I` check above.
- GitHub Pages: cannot serve custom headers at all — that target
  has no header configuration, by platform limitation.

The headers are config, not a live guarantee: after deploying to
any target, run the `curl -I` check above against the live domain.
