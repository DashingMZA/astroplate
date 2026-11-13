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

## General security notes for site owners

- Never commit secrets (API keys, tokens, passwords) to the repo or to
  content files; use your host's environment variables.
- The demo contact form has no backend (`action="#"`) — wire it to a real,
  validated endpoint before using it on a live site.
- No security headers are shipped by the theme itself; set them at your
  host (Cloudflare / Netlify / your web server) — see `DEPLOYMENT.md`.
