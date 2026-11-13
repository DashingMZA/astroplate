# Deployment

The build output is fully static. `pnpm build` produces `dist/`
(30 pages), which can be served by any static host. There is no
server component, no database, and no runtime secrets needed for
the static build.

> Status: the deploy targets below are **present in the repo but
> have not been deployed or tested live** from this copy. The
> instructions describe what the repo configures, not a verified
> live deployment.

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
(see “GitHub Pages” below) and should not be relied on until fixed.

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
- The worker name is `astroplate`; the custom domain is attached in
  the Cloudflare dashboard (the current demo domain is
  `astroplate.csofts.tech`).

## Netlify

Configured in `netlify.toml`:

```toml
[build]
publish = "dist"
command = "pnpm build"
```

Connect the repo in the Netlify dashboard (or use the Netlify CLI)
with build command `pnpm build` and publish directory `dist`.
No environment variables are required for the static build. The
old upstream demo (`astroplate.netlify.app`) is not this copy's
deployment.

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
$uri/index.html =404`, `error_page 404 /404.html`).

```bash
docker build -t astroplate .
docker run -p 3000:80 astroplate
# shell inside the container:
docker run -it --rm astroplate ash
```

The default installer is pnpm (`ARG INSTALLER=pnpm`); `npm` and
`yarn` are also supported via `--build-arg INSTALLER=npm|yarn`.

> Note: the `Dockerfile` pins a `node:22.20.0-alpine` base image,
> which differs from the Node 24+ local-dev requirement in
> [INSTALLATION.md](INSTALLATION.md). It has not been verified
> against the current dependency set — treat the Docker path as
> untested until someone builds and runs it.

## GitHub Pages

`.github/workflows/deploy-to-github-pages.yml` exists but is
**unverified and currently broken as written**:

- The branch trigger contains a literal `$default-branch`
  placeholder (`branches: [$default-branch]`) that GitHub does not
  expand — it must be replaced with the real branch name
  (e.g. `main`).
- The workflow pins `node-version: "20"`, while the project targets
  Node 24+.

Fix both, then trigger the workflow manually (`workflow_dispatch`)
and confirm the deployment before relying on it.

## Environment considerations

- **No secrets are needed for the static build.** There are no
  API keys in the build path.
- Optional integrations, all configured in `src/config/config.json`:
  - Google Tag Manager: disabled by default; set `enable: true`
    and a real `gtm_id` (the placeholder is `GTM-XXXXXX`).
  - Disqus: disabled by default; set `enable: true` and your
    `shortname` (the placeholder is `csofts-template`).
  - Contact form: `params.contact_form_action` is `"#"` by
    default — point it at a real endpoint before launch.
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
DOMAIN="https://astroplate.csofts.tech"

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
and the mobile menu opens.

## Security headers

**No security headers are configured on any host in this repo**
— no `Content-Security-Policy`, `Strict-Transport-Security`,
`X-Content-Type-Options`, or similar in `wrangler.jsonc`,
`netlify.toml`, or `config/nginx/nginx.conf`. If the deployment
needs them, add them at the host layer (Cloudflare Transform Rules /
`_headers` file for Netlify / nginx `add_header` directives).
Do not claim the site ships hardened headers until that work is
done and verified.
