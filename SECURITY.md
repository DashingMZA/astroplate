# Security Policy

## Supported versions

Astroplate is a theme, not a hosted service: security fixes land on the
`main` branch and in releases cut from it. Only the current `main` branch
(and the latest release) receives security fixes.

| Version | Supported |
| ------- | --------- |
| `main` (Astro 7.x) | ✅ |
| Latest release | ✅ |
| Older releases / forks | ❌ |

If you run a site on Astroplate, keep your copy up to date with `main` and
keep your dependencies current — see `.github/dependabot.yml`, which files
weekly update PRs for npm/pnpm packages and GitHub Actions.

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.** Public issues
are visible to everyone, including people who would exploit the flaw before
a fix ships.

Instead, report it privately through GitHub's private vulnerability
reporting for this repository:

1. Go to the **Security** tab of
   [DashingMZA/astroplate](https://github.com/DashingMZA/astroplate).
2. Click **"Report a vulnerability"** and fill in the form.

Your report stays private between you and the maintainers until a fix is
ready. Please include:

- A description of the vulnerability and its impact.
- Steps to reproduce (a minimal post, config, or page that triggers it).
- The Astro / Node.js / pnpm versions you tested with.
- Any suggested fix, if you have one.

## What happens next

- Maintainers will triage the report and confirm whether it is a real
  vulnerability in the theme.
- If confirmed, a fix will be prepared on `main`, and the advisory will be
  published with credit to the reporter (unless you ask to stay anonymous).
- No fixed timeline is promised — triage and fixes happen as maintainer time
  allows — but private reports are prioritized over regular issues.

## Scope

In scope:

- The theme code in `src/` (layouts, components, helpers, content
  collections, routing, SEO / structured-data output).
- The build and deploy configuration in this repo (`astro.config.mjs`,
  `.github/workflows/`, `Dockerfile`, `wrangler.jsonc`, `netlify.toml`).
- Dependencies declared in `package.json` / `pnpm-lock.yaml` (for example a
  vulnerable package version the theme pins or requires).
- The demo content and example configuration shipped in this repo.

Out of scope:

- Vulnerabilities in a specific site built with the theme (its own content,
  custom code, hosting, or secrets) — report those to that site's owner.
- The Sitepins / Sketivo CMS, PowerAI Astro, and Geeky Astro — separate
  projects with their own security processes.
- Social engineering, physical attacks, or reports that require access to
  private infrastructure.

## Security headers

The theme ships header configuration for three deployment targets,
all carrying the same policy. The headers are config served by the
host — the static build cannot send them itself — so verify them
against the live domain after deploying (`curl -I <domain>/`).

| Target | Config file | HSTS |
| --- | --- | --- |
| Cloudflare | `public/_headers` (copied to `dist/_headers`) | Yes |
| Netlify | `netlify.toml` (`[[headers]]`) | Yes |
| Docker/nginx | `config/nginx/nginx.conf` (`add_header … always;`) | No — see below |
| Vercel | **Not configured** — Vercel does not read `_headers`, and there is no `vercel.json` in the repo | Add in the Vercel dashboard |
| GitHub Pages | **Not possible** — the platform serves no custom headers | — |

Headers sent on every response (`/*`):

- `Content-Security-Policy` (identical on all three targets):
  `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://media.csofts.tech https://i.ytimg.com; media-src 'self' https://media.csofts.tech https://www.w3schools.com; font-src 'self'; connect-src 'self'; frame-src https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; form-action 'self' https://formspree.io https://getform.io; frame-ancestors 'self'; upgrade-insecure-requests`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  (Cloudflare + Netlify only)

### What the CSP allows — and why

- **`media.csofts.tech`** (R2 media host) is allow-listed for
  `img-src` and `media-src` because the theme's demo post loads
  images from it; fonts are self-hosted, so `font-src` is `'self'`
  only.
- **YouTube**: `frame-src https://www.youtube-nocookie.com` and
  `img-src https://i.ytimg.com` exist only because the
  `/elements` demo page embeds a `lite-youtube` video. If you
  remove that demo, remove those two sources.
- **`media-src https://www.w3schools.com`** exists only because
  the same demo page embeds a w3schools-hosted video. Demo-only.
- **`form-action`** allows `'self'` plus Formspree and Getform —
  the two documented contact-form providers. A different provider
  must be added here before the contact form can submit to it.
- **Google Tag Manager and Disqus are deliberately NOT
  allow-listed**: both are disabled by default, so their domains
  are not in the policy. Enabling either one requires adding its
  domains (`googletagmanager.com`, `disqus.com` / `disquscdn.com`,
  and Disqus's `https://*.disqus.com` frame sources) to the CSP
  first, or the feature will silently fail to load.
- **No `report-uri` / `report-to`**: there is no reporting
  endpoint, so violations are not collected anywhere.

### The `unsafe-inline` trade-off (honest)

`script-src` and `style-src` both include `'unsafe-inline'`. That
is deliberate, not an oversight:

- Every page carries Astro-generated inline scripts (view
  transitions, the search index, the announcement banner, the
  theme switcher), React islands mount from inline bootstraps, and
  components use inline `style` attributes. A strict CSP without
  `'unsafe-inline'` would break the site.
- Static hosts cannot inject per-response nonces, and a hash
  allow-list would be brittle — Astro regenerates the inline
  scripts on every build and across upgrades, so pinned hashes
  would rot silently.
- The policy still does the useful work: it blocks third-party
  scripts/frames/fonts from any domain not listed above, blocks
  plugins (`object-src 'none'`), pins framing to the site itself
  (`frame-ancestors 'self'` — no separate `X-Frame-Options`, which
  would conflict), and upgrades HTTP subresources.
- If you later move to a host that can inject nonces (or drop the
  inline scripts), removing `'unsafe-inline'` is the first CSP
  hardening step to take.

### Why nginx has no HSTS

The Docker/nginx container listens on port 80 only — it never
serves HTTPS itself. HSTS (`Strict-Transport-Security`) is only
meaningful when the browser reached the site over HTTPS, and
sending it over plain HTTP is ignored by browsers and misleading.
Add HSTS at the TLS-terminating reverse proxy in front of the
container instead.

## General security notes for site owners

- Never commit secrets (API keys, tokens, passwords) to the repo or to
  content files; use your host's environment variables.
- The contact form has no backend of its own — it POSTs to the
  endpoint in `contact_form.action` in `config.json`. Until one is
  configured the form renders visibly disabled and never fakes a
  successful submission. Configure a real, validated provider
  endpoint (Formspree / Getform / Netlify Forms — see
  [CONFIGURATION.md](CONFIGURATION.md)) before using it on a live
  site, and keep the CSP `form-action` directive in sync with the
  provider you choose.
- Security headers are configured in the repo (see above) for
  Cloudflare, Netlify, and nginx — but they are served by the host,
  not by the theme. The live Vercel deployment needs headers added
  in the Vercel dashboard (no `vercel.json` in the repo); verify
  them with `curl -I` against the live domain after every deploy.
- The announcement banner stores one cookie (`announcement-close`,
  `SameSite=Lax`, `Secure` only on HTTPS so local development still
  works) recording that the banner was dismissed; nothing else
  about the visitor is stored.
- Google Tag Manager and Disqus are both disabled by default. While
  disabled, no GTM or Disqus domain is allow-listed in the CSP and
  (for Disqus) no Disqus JavaScript is loaded at all. Enabling
  either one means adding its domains to the CSP first — see the
  inventory above.
