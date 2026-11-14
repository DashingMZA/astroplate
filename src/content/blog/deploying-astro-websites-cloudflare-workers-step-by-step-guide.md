---
title: "Deploying Astro Websites to Cloudflare Workers: A Step-by-Step Guide"
meta_title: "Deploy Astro to Cloudflare Workers: Guide"
description: "Learn how to deploy Astro websites to Cloudflare Workers step by step: static assets, the Cloudflare adapter, custom domains, headers, secrets and CI/CD."
date: 2026-11-14T05:00:00Z
image: "/images/deploying-astro-websites-cloudflare-workers-step-by-step-guide-feature.jpg"
og_image: "/images/deploying-astro-websites-cloudflare-workers-step-by-step-guide-og.jpg"
og_title: "Deploy Astro to Cloudflare Workers"
og_description: "A step-by-step guide to deploying Astro sites to Cloudflare Workers — static assets, on-demand rendering, domains and CI/CD."
categories: ["Technology"]
author: "John Doe"
tags: ["astro", "cloudflare", "deployment"]
draft: false
---

Cloudflare Workers is now the recommended home for Astro sites on Cloudflare. A static Astro build can be served as Workers Static Assets with no server code at all, and the same project can grow into on-demand rendering, API routes and platform bindings without changing hosts. This guide walks through both paths, using the commands and configuration files from the official Astro and Cloudflare documentation as published on 14 November 2026.

## Why deploy Astro on Cloudflare Workers?

Astro and Workers share the same idea: do as much work as possible ahead of time, and run code only where a request needs it. A typical Astro site is mostly prerendered HTML, CSS and images, served by Workers directly from Cloudflare's edge network, near the visitor instead of from a single origin server. When a page does need rendering per request — a dashboard, a search endpoint, a form handler — the same Worker runs that code at the edge too.

The upgrade path is the main attraction: start with pure static assets and add the `@astrojs/cloudflare` adapter only when a route needs on-demand rendering. The surrounding platform is unusually complete, with KV, D1, R2 and Workers AI reachable through bindings, and Cloudflare itself recommends Workers for new projects.

One clarification: this is a guide for readers deploying their own Astro sites. Astroplate itself follows the static path in Step 2 — a static build served through Wrangler Static Assets, with no Cloudflare adapter — the normal shape for a content site.

## Before you start

You need four things: a Cloudflare account (a free account is enough); an Astro project that builds cleanly on your machine — fix build errors there first, because a failed build fails the same way on Cloudflare; Node.js 22.12.0 or later for Astro 6 or 7 (Astro 5 supports Node 18.20.8, 20.3.0 and later); and Wrangler, Cloudflare's command-line tool, installed as a development dependency:

```bash
npm install wrangler@latest --save-dev
```

Pinning Wrangler in the project matters if you later use Workers Builds, which uses the version in your `package.json` — a pinned version keeps local and remote deploys identical. With pnpm, the equivalent is `pnpm add -D wrangler@latest`.

Before the first deploy command, decide which of the two deployment shapes your site is. That decision drives everything else.

## Step 1: Decide — static assets or on-demand rendering?

Astro has two rendering modes. In the default `output: 'static'`, every page is prerendered to HTML at build time and Cloudflare serves the finished files in `dist/` without running any of your code. In `output: 'server'`, pages render on demand inside the Worker for each request. You can mix them: keep `output: 'static'` and mark individual pages `export const prerender = false`, or set `output: 'server'` and opt pages back with `export const prerender = true`.

The rule of thumb is simple: a blog, documentation site, marketing site or portfolio — content that is the same for every visitor — deploys as static assets, with no adapter. The adapter documentation says this directly: "If you're using Astro as a static site builder, you don't need an adapter." Add the adapter only when a route genuinely needs to run per request: an API endpoint, a page behind authentication, a server island, an Astro Action, or a session-backed feature such as a shopping cart.

![Static assets versus on-demand rendering on Cloudflare Workers: a decision flow from the Astro output mode to the matching deployment shape](/images/deploying-astro-websites-cloudflare-workers-step-by-step-guide-diagram-1.png)

Static output goes straight to Workers Static Assets with a small Wrangler configuration file and no Worker script. On-demand output goes through the `@astrojs/cloudflare` adapter, which builds a Worker entry point alongside the static files.

The rendering choice also affects page weight: Astro's islands model means a static page can still carry interactive components, but only the islands hydrate. If you are unsure, read our guide to [Astro islands architecture and how partial hydration works](/blog/astro-islands-architecture-explained-partial-hydration-works) before deciding which pages need to be dynamic.

## Step 2: Deploy a static Astro site

A fully static Astro site needs no adapter and no Worker code — just a build, a Wrangler configuration file, and a deploy command. Create `wrangler.jsonc` in the project root, using the static-site configuration from the Astro deployment guide:

```json
{
  "name": "my-astro-app",
  "compatibility_date": "2026-11-14",
  "assets": {
    "directory": "./dist"
  }
}
```

`name` is your Worker name and part of the default `workers.dev` address. `compatibility_date` pins the Workers runtime behaviour to a date — set it to the day you deploy, and update it deliberately when you want newer runtime behaviour. `assets.directory` tells Wrangler where the built site lives: `./dist`, Astro's default output directory. Note what is absent: there is no `main` field, because there is no Worker script to run. If you prefer TOML, `wrangler.toml` accepts the same fields, with an `[assets]` table holding `directory = "./dist"`.

Then build and deploy in one chain:

```bash
npx astro build && npx wrangler deploy
```

Wrangler uploads `dist/` as static assets and returns a preview URL, typically on a `workers.dev` subdomain. Requests matching a file in `dist/` are served directly from the edge; no Worker code runs for them, and static-asset requests are not billed as Worker invocations. Preview locally with `npx astro build && npx wrangler dev`, which serves `dist/` the way Cloudflare will and catches bugs `astro dev` cannot, such as wrong asset paths or files missing from the build output.

### Serve your custom 404 page

By default, a request for a missing path gets Cloudflare's generic handling rather than your own `404.astro` page. Add `not_found_handling` to the assets block:

```json
{
  "assets": {
    "directory": "./dist",
    "not_found_handling": "404-page"
  }
}
```

The value `"404-page"` serves your project's `404.html` when no file matches; the alternatives are `"single-page-app"` (serves the root `index.html`) and `"none"` (the default). For a content site, `"404-page"` is almost always right — a branded 404 page beats a generic error for visitors and search engines.

## Step 3: Add the Cloudflare adapter for on-demand rendering

When a route needs to render per request, install the adapter:

```bash
npx astro add cloudflare
```

This installs `@astrojs/cloudflare` and edits `astro.config.mjs` for you:

```js
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
});
```

By default `output` becomes `'server'`, so every page renders on demand unless you opt it out. If most of your site is static, that default is backwards — keep `output: 'static'` and mark only the dynamic pages with `export const prerender = false`. The command also creates a Wrangler configuration file if one does not exist; for an on-demand site it gains a `main` field pointing at the generated Worker entry point, and the assets block gains a `binding`:

```json
{
  "name": "my-astro-app",
  "main": "./dist/_worker.js/index.js",
  "compatibility_date": "2026-11-14",
  "assets": {
    "binding": "ASSETS",
    "directory": "./dist"
  },
  "observability": {
    "enabled": true
  }
}
```

A request first hits the static-asset layer: if a file in `dist/` matches, it is served directly. Otherwise it falls through to the Worker at `dist/_worker.js/index.js`, which renders the on-demand route — so the Worker runs only for the routes that need it.

The on-demand setup also needs a `.assetsignore` file in `public/` listing `_worker.js` and `_routes.json`, so these build artefacts are not uploaded as public static assets.

Two details are worth knowing. The `imageService` option controls image handling for on-demand routes; the default `'cloudflare-binding'` uses the Cloudflare Images binding, provisioned automatically on deploy. And on-demand pages run in Cloudflare's `workerd` runtime, not Node.js: web-standard APIs such as `fetch` work, but Node.js-only APIs do not — a build error like `Could not resolve "node:fs"` means a dependency imports one, so replace it. For prerendered pages only, `prerenderEnvironment: 'node'` builds static pages in Node.js.

## Step 4: Headers, redirects and caching

Static-asset behaviour is configured with two plain-text files in `public/`, which Astro copies into `dist/` at build time — the same format Cloudflare Pages used, so the files transfer directly if you migrate from Pages.

A `_headers` file attaches response headers to paths:

```text
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

The first rule applies security headers to every response; the second gives long-lived, immutable caching to hashed asset files, which Astro names with a content hash, so a changed file gets a new name and the old copy can never be stale.

A `_redirects` file maps old paths to new ones:

```text
/old-blog-post  /blog/new-post  301
/docs/*  /guides/:splat  301
```

Use 301 for permanent moves — search engines transfer ranking signals to the new URL — and 302 only for temporary ones. Cloudflare's documented limits are 2,000 static redirects plus 100 dynamic ones, and 100 header rules.

One scope note: `_headers` and `_redirects` apply to static-asset responses only, not to Worker responses. For dynamic routes, set headers and redirects in Astro itself. Redirects are also an SEO concern — a chain, or a missing canonical after a URL change, can cost visibility — so if you are moving an existing site, read our guide to [technical SEO for Astro websites, including sitemaps, canonicals and structured data](/blog/technical-seo-astro-websites-sitemaps-canonicals-structured-data) and verify the live URLs after the move.

## Step 5: Environment variables, secrets and bindings

Cloudflare distinguishes three kinds of values, and mixing them up is the most common source of leaked credentials. **Public variables** go in `wrangler.jsonc` under `vars` — visible in the dashboard and bundled into the Worker, so never put secrets there:

```json
{
  "vars": {
    "PUBLIC_SITE_NAME": "My Astro Site"
  }
}
```

**Secrets** are encrypted values set through the Wrangler CLI, never written into a configuration file:

```bash
npx wrangler secret put API_KEY
```

Wrangler prompts for the value and stores it encrypted. For local development, use a `.dev.vars` file at the project root — and add it to `.gitignore`, because it holds real credentials.

**Bindings** connect your Worker to platform resources: a KV namespace, a D1 database, an R2 bucket or an Images binding. Declare them in `wrangler.jsonc` — a KV namespace looks like this:

```json
{
  "kv_namespaces": [{ "binding": "MY_KV", "id": "<namespace_id>" }]
}
```

Create the namespace with `npx wrangler kv namespace create MY_KV`, paste the returned id into the configuration, and read bindings from `cloudflare:workers` inside an on-demand route:

```astro
---
import { env } from "cloudflare:workers";

const value = await env.MY_KV.get("some-key");
---
```

Bindings only exist in code that runs on request, so a page reading `env.MY_KV` must be on-demand; a prerendered page that touches a binding fails at build time.

Two features deserve a mention. **Sessions** — Astro's API for storing user data between requests, such as cart contents or login state — are backed by Workers KV automatically with the adapter; Wrangler provisions a KV namespace named `SESSION` on deploy, and `session: false` skips it if you do not use sessions. **Request metadata** is available through `Astro.request.cf`, which carries geolocation information.

## Step 6: Custom domains and DNS

A fresh deploy lives on a `workers.dev` subdomain — fine for testing, wrong for production. Adding a custom domain is a dashboard operation, not a code change: open your Worker in the Cloudflare dashboard, go to Settings, then Domains, and add the domain. If Cloudflare manages your DNS, the records are created for you; otherwise, add the records Cloudflare shows you at your registrar.

Two details catch people out. First, update the `site` field in `astro.config.mjs` to the custom domain before deploying — sitemaps, canonicals and Open Graph URLs all derive from `site`, and deploying to `example.com` while `site` still says `my-app.workers.dev` publishes the wrong URLs everywhere. Second, verify the live site after attaching the domain: request a page and a missing page, and confirm the custom 404 and the Step 4 security headers are present.

## Step 7: Automate deployments with Workers Builds

Manual deploys from your laptop work, but they do not scale to a team and are easy to forget. Workers Builds connects your repository to Cloudflare so every push builds and deploys automatically:

1. Complete Steps 1–3 above, so the repository already contains a working `wrangler.jsonc`.
2. In the Cloudflare dashboard, go to Compute, then Workers & Pages, and select Create application.
3. Under Import a repository, select your Git account and the repository containing the Astro project.
4. Configure the project with build command `npx astro build` and deploy command `npx wrangler deploy`.
5. Click Save and Deploy, and preview the Worker at its `workers.dev` subdomain.

![Continuous deployment pipeline for an Astro site on Cloudflare Workers: push to Git, Workers Builds runs the build, Wrangler deploys static assets and the Worker entry point](/images/deploying-astro-websites-cloudflare-workers-step-by-step-guide-diagram-2.png)

Every push now triggers the same pipeline you ran by hand, and Workers Builds also creates preview deployments for pull requests, so a content change can be reviewed on a live URL before production. Keep the Node.js version in mind: the default meets Astro's requirements, but an override must satisfy the version floor for your Astro major version.

If you prefer your own CI, such as GitHub Actions, the same two commands run there instead: authenticate Wrangler with a Cloudflare API token stored as a repository secret (`CLOUDFLARE_API_TOKEN`), then run `npx astro build && npx wrangler deploy`. Workers Builds needs no CI configuration to maintain; your own CI runs the build wherever your tests already run.

## Troubleshooting common deployment failures

**Build passes locally but fails on Cloudflare.** Usually a Node.js version difference or a missing environment variable. Check the build log, confirm the Node.js version Workers Builds is using, and confirm that any variable the build needs is set in the dashboard, not only in your local `.env` file.

**Pages render, but interactive components do nothing.** Cloudflare's Auto Minify setting can break client-side hydration, with a console error about hydration mismatches. The Astro documentation's fix is direct: disable Auto Minify in your Cloudflare settings — a legacy optimisation modern build tools made unnecessary.

**Static files return 404 after a successful deploy.** Check that `assets.directory` points at the real build output (`./dist` by default) and that the build ran before the deploy — `npx wrangler deploy` alone uploads whatever stale `dist/` happens to exist. Always chain the build in front of it, or use Workers Builds.

**On-demand routes work locally but fail in production.** Usually a binding created in `.dev.vars` but never in production, or a secret set on the wrong environment. Check the Worker's bindings and secrets in the dashboard, and stream live logs with `npx wrangler tail`.

**The site feels slow.** First check whether your pages are actually prerendered, or whether every request renders on demand because `output` is `'server'` with no prerendered pages. If the pages are static and still slow, the problem is usually on the page itself: unoptimised images, render-blocking scripts, or excessive JavaScript. Our guide on [how to improve Core Web Vitals in Astro websites](/blog/improve-core-web-vitals-astro-websites) covers the measurements and fixes.

## When Workers is the wrong choice

Workers is the right default for Astro on Cloudflare, but two situations deserve a different host: a site that depends heavily on Node.js-only packages that cannot run in `workerd` and cannot be replaced — a VPS, container platform or the Node adapter causes less friction than fighting the runtime — and a team whose whole estate already runs on another platform with working CI, monitoring and on-call coverage.

Do not start a new Astro project on Cloudflare Pages for server-rendered routes: Cloudflare recommends Workers for new projects, and the adapter dropped Pages support for on-demand rendering in v13 (see the [v13 release notes](https://newreleases.io/project/github/withastro/astro/release/@astrojs%2Fcloudflare@13.0.0)) — Pages remains usable for purely static sites, but it is a dead end the moment a route needs to render on request.

One note on the near future: the adapter documentation carries a preview notice that the adapter will drop Wrangler in favour of a new `cf` CLI and a `cloudflare.config.ts` file, requiring Astro 7.4 and `@astrojs/cloudflare` v15. The stable documentation still describes the Wrangler flow used in this guide — follow that for a production site today.

## Frequently asked questions

### Do I need the Cloudflare adapter for a static Astro site?

No. A fully static Astro site — the default `output: 'static'` — needs no adapter: build the site, point a Wrangler configuration file at `./dist`, and deploy with `npx wrangler deploy`. Add the adapter only when a route renders on demand, or when you need server features such as actions, sessions or server islands.

### How do I deploy an Astro site to Cloudflare Workers for free?

A free Cloudflare account covers this guide: static-asset requests are served from the edge without invoking Worker code, and the free tier includes a daily allowance of Worker requests. Create the account, install Wrangler, add `wrangler.jsonc`, and run `npx astro build && npx wrangler deploy`.

### What is the difference between Cloudflare Workers and Cloudflare Pages for Astro?

Workers is Cloudflare's serverless compute platform with static-asset serving built in; Pages is a static-hosting product built on top of Workers with its own build system. Cloudflare recommends Workers for new projects, and Workers offers the fuller feature set — bindings, cron triggers, Durable Objects, gradual rollouts. For on-demand rendering, Workers is the only supported target since the adapter dropped Pages support in v13.

### Why is my Astro site returning 404 on Cloudflare Workers?

Usually an `assets.directory` that does not point at the real build output, a deploy run without building first, or a missing `not_found_handling` setting. Verify the build output exists locally, redeploy with `npx astro build && npx wrangler deploy`, and confirm `not_found_handling` is inside the `assets` object.

### Can I use a custom domain with my Astro site on Cloudflare Workers?

Yes — add it in the Cloudflare dashboard under the Worker's Settings, then Domains. If Cloudflare manages your DNS, the records are created automatically; otherwise, add the records it shows you at your registrar. Update the `site` field in `astro.config.mjs` to the custom domain before deploying, so sitemaps, canonicals and social-sharing URLs use the right address.
