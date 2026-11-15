---
title: "How to Improve Core Web Vitals in Astro Websites"
meta_title: "Core Web Vitals in Astro: Improve LCP, INP, CLS"
description: "Learn how to improve Core Web Vitals in Astro: fix LCP with priority images, cut INP with lazy hydration, and stop CLS with reserved space and metric fonts."
date: 2026-11-10T05:00:00Z
image: "/images/blog/improve-core-web-vitals-astro-websites-feature.webp"
og_image: "/images/blog/improve-core-web-vitals-astro-websites-og.webp"
og_title: "Core Web Vitals in Astro: A Practical Guide"
og_description: "A practical Astro guide to LCP, INP and CLS: priority images, lazy hydration, reserved space, self-hosted fonts and real-user measurement."
categories: ["Performance"]
author: "Muhammad Zaheer Ahmad"
tags: ["astro", "core-web-vitals", "performance"]
draft: false
---

Core Web Vitals are the three numbers Google uses to judge how a page feels in real use: how fast its main content appears, how quickly it answers a tap or click, and how still it stays while it loads. Astro gives you a head start, because it ships static HTML with no client-side JavaScript unless you explicitly ask for it — but the images, fonts, islands and third-party scripts you add can still push a fast site over the line.

## What Core Web Vitals measure

Core Web Vitals are three field metrics: Largest Contentful Paint (LCP), Interaction to Next Paint (INP) and Cumulative Layout Shift (CLS). They are part of Google's page experience signals, reported in Search Console from real Chrome users through the Chrome User Experience Report (CrUX). A page passes only when all three are good — judged at the 75th percentile of real page loads, separately for mobile and desktop. A fast result on your own laptop does not pass a page if a quarter of real visitors, often on slower phones, have a worse experience.

| Metric                          | What it measures                                                        | Good                     | Needs improvement               | Poor                  |
| ------------------------------- | ----------------------------------------------------------------------- | ------------------------ | ------------------------------- | --------------------- |
| LCP — Largest Contentful Paint  | When the largest image or text block in the viewport finishes rendering | 2.5 seconds or less      | Over 2.5 up to 4 seconds        | Over 4 seconds        |
| INP — Interaction to Next Paint | How long from a tap, click or key press until the next visual update    | 200 milliseconds or less | Over 200 up to 500 milliseconds | Over 500 milliseconds |
| CLS — Cumulative Layout Shift   | How much visible content moves unexpectedly                             | 0.1 or less              | Over 0.1 up to 0.25             | Over 0.25             |

LCP is a loading metric; on most pages the element is a hero image or a large heading — web.dev notes that, per the 2024 Web Almanac, 73% of mobile pages have an image as their LCP element. INP replaced First Input Delay (FID) on 12 March 2024 and is stricter, covering interactions across the whole visit. CLS is a unitless score that only counts shifts the visitor did not cause: a shift within 500 milliseconds of a tap, click or key press is excluded.

The three metrics share a common enemy: unnecessary JavaScript and late-discovered resources. Heavy scripts delay the largest paint, block the main thread on interaction, and inject content that shoves the layout around. Ship less JavaScript, make important resources discoverable early, and reserve space for everything that arrives late.

![How Astro's zero-JavaScript default, partial hydration and static HTML map to LCP, INP and CLS](/images/blog/improve-core-web-vitals-astro-websites-diagram-1.webp)

## Why Astro starts ahead — and where it can still go wrong

An Astro page is rendered to plain HTML at build time. A framework component with no client directive renders to HTML and ships no JavaScript at all. Interactivity is added only where you mark a component as an island, and each island hydrates independently — the idea explained in our guide to [Astro Islands architecture](/blog/astro-islands-architecture-explained-partial-hydration-works). A content page with no islands is just HTML and CSS, with no runtime competing with the hero image and no hydration pass blocking the main thread.

That head start is not a guarantee. Four additions erase it: unoptimised images, especially a lazy-loaded hero; islands that hydrate too early, with `client:load` on every widget; third-party scripts — analytics, tag managers, chat widgets and embeds — which load JavaScript you do not control and often inject content late; and third-party web fonts, which can block text rendering and then swap in a font with different metrics.

## Measure before you change anything

Do not optimise from a single Lighthouse score. Lighthouse is a lab tool: it loads a page once in a simulated environment, and it cannot measure INP at all, because there is no real user to interact with the page. The score Google judges you on comes from field data — what real visitors experienced over the previous 28 days.

Start with field data: PageSpeed Insights shows CrUX data at the top of its report, and Search Console's Core Web Vitals report groups your URLs by whether they pass. If a URL has no field data — new and low-traffic pages often do not — use lab data to find the problems, fix them, and let field data accumulate. Then run Lighthouse and read the diagnostics, not just the headline score: the "Largest Contentful Paint element" audit names the exact element, and the layout-shift audits name the elements that moved.

For ongoing measurement, collect the metrics from your own visitors with the `web-vitals` library, a small wrapper around the browser's performance APIs that reports values the same way Chrome and CrUX do. Its attribution build tells you which element or interaction caused a poor value, not just that one exists.

```bash
npm install web-vitals
```

```js
import { onCLS, onINP, onLCP } from "web-vitals";

function send(metric) {
  navigator.sendBeacon(
    "/api/vitals",
    JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      url: location.pathname,
    }),
  );
}

onCLS(send);
onINP(send);
onLCP(send);
```

Call each `on*` function only once per page load, and let the callbacks fire when ready — CLS and INP keep changing until the visitor leaves. Slice results by route, device and connection type, and fix the worst route first. `onINP` never fires if nobody interacts, which is expected. Import from `web-vitals/attribution` for the diagnosis: `onLCP` attribution breaks the result into time to first byte, resource load delay, load duration and render delay, and `onCLS` attribution names the largest shift source.

## Improving LCP in Astro

LCP is the time from when a visitor starts loading the page until its largest visible element finishes rendering. Web.dev breaks it into four subparts: time to first byte (TTFB), resource load delay, resource load duration and element render delay. Shrinking the hero image alone rarely fixes a poor LCP: web.dev's field data found that origins with poor LCP spend less than 10% of their LCP time actually downloading the image, and far more waiting for the server to respond and for the browser to discover it. Fix discovery and TTFB first, then file size.

Find the LCP element before changing anything: record a page load in DevTools' Performance panel and look for the LCP marker, or read Lighthouse's "Largest Contentful Paint element" audit. On a landing page it is usually the hero image; on an article, usually the headline. Two common Astro mistakes: a hero set as a CSS `background-image`, which the preload scanner cannot discover early, and a hero lazy-loaded because a component applies `loading="lazy"` to every image.

Use Astro's `<Image />` from `astro:assets` for the hero, imported from `src/` so Astro can optimise it at build time: it converts to WebP by default, resizes, and writes `width` and `height`, which also helps CLS. The key prop for LCP is `priority` — eager loading with high fetch priority, on exactly one image per page.

```astro
---
import { Image } from "astro:assets";
import hero from "../assets/hero.jpg";
---

<Image
  src={hero}
  alt="Dashboard showing weekly traffic"
  width={1200}
  height={675}
  layout="constrained"
  priority
/>
```

`layout="constrained"` generates `srcset` and `sizes`, so phones download a smaller file and large screens get the full width. Every other image should keep the default lazy loading. If the LCP element is a heading, nothing should block its render — no render-blocking font request, no JavaScript before the text appears, and no CSS transition delaying the first paint. For the full pipeline, including AVIF with `<Picture />` and CDN delivery, see our guide to [image optimization for Astro](/blog/image-optimization-astro-webp-avif-responsive-images-cdn-delivery).

TTFB — the time until the browser receives the first byte of the HTML — is roughly 40% of LCP in web.dev's breakdown. On a static Astro site the HTML is pre-built, so a slow TTFB usually means the hosting or CDN is the bottleneck: an origin far from the visitor, no edge caching, or a redirect chain. Serve from a CDN near your readers and keep redirect chains to one hop. The browser also cannot paint the LCP element until its CSS has loaded, so keep critical CSS small and defer non-critical stylesheets and scripts.

![A checklist flow for diagnosing a poor LCP: identify the element, check TTFB, check discovery and priority, then check render-blocking resources](/images/blog/improve-core-web-vitals-astro-websites-diagram-2.webp)

## Improving INP in Astro

INP is the delay between an interaction — a tap, click or key press — and the next visual update: input delay (waiting for the main thread), processing time (running your handlers) and presentation delay (painting the result). A page can have a fast LCP and a terrible INP, because INP is about what happens after the page loads. The usual causes on Astro sites are islands that hydrate eagerly, third-party scripts, and handlers that do too much work on the main thread.

Each island ships its framework runtime — once per framework — plus its own code, and the client directive decides when that code downloads and runs. Use the cheapest directive that still works:

| Directive        | When it hydrates                      | Use it for                                               |
| ---------------- | ------------------------------------- | -------------------------------------------------------- |
| No directive     | Never — static HTML only              | Anything that does not need JavaScript                   |
| `client:visible` | When the island scrolls into view     | Below-the-fold widgets: comments, carousels, maps        |
| `client:idle`    | When the main thread is idle          | Visible but non-urgent widgets: search, toasts           |
| `client:load`    | Immediately on page load              | Controls the visitor may touch at once: navigation, cart |
| `client:media`   | When a media query matches            | Mobile-only or desktop-only components                   |
| `client:only`    | Immediately, without server rendering | Components that cannot render on the server              |

Start with no directive and add one only where interactivity is genuinely needed. A comment widget below the fold does not need `client:load`; `client:visible` keeps its JavaScript off the critical path. A search box is a good `client:idle` candidate, and the main navigation is one of the few things that earns `client:load`. Two islands in the same framework share one runtime, but a React island plus a Svelte island ship both. A menu toggle rarely needs a framework at all — a small `<script>` tag does the same job.

```astro
<NavBar client:load />
<SearchBox client:idle />
<Comments client:visible />
```

Third-party scripts are the other usual INP offender. Audit them like your own code: sort the Network panel by size and main-thread time, and ask of each script whether it earns its place on every page. Load what you keep with `defer` or `async`, delay non-essential widgets until after the first interaction or until they scroll into view, and consider Astro's Partytown integration, which moves third-party scripts into a web worker off the main thread.

Finally, break up long tasks — JavaScript occupying the main thread for more than 50 milliseconds, during which no interaction can be processed. Split large lists into chunks, debounce search input so you filter on a pause rather than every keystroke, and move expensive computation out of the interaction path or into a worker.

## Preventing CLS in Astro

CLS adds up every unexpected layout shift during the page's lifetime, weighted by how much of the viewport moved and how far. Astro's static HTML already removes one large cause — no client-side render pushes content around after the first paint — so the remaining causes arrive late or change size after rendering: images and embeds without reserved space, web fonts that swap in with different metrics, and injected banners, ads and cookie notices.

An image without `width` and `height` has no size until it downloads, so the browser lays out the page as if it were not there, then pushes everything below it down when it arrives. Astro's `<Image />` writes both attributes for you. For images you cannot run through `astro:assets` — remote images, or images in `public/` — set the attributes yourself, or use `aspect-ratio`:

```css
.media-box {
  aspect-ratio: 16 / 9;
  width: 100%;
}
```

Give videos, iframes and embeds the same treatment: a fixed-size container, a skeleton, or an `aspect-ratio`, and never let an ad slot or related-posts widget appear without a reserved height. A cookie banner sliding in at the top is a classic CLS source; reserve its space, or place it at the bottom. Check the shift at every breakpoint — a hero that is 16:9 on desktop and a tall crop on a phone changes the space below it. That responsive discipline is covered in our guide to [building responsive websites with Tailwind CSS](/blog/building-responsive-websites-tailwind-css-practical-guide).

When a web font loads, text first renders in a fallback font, then swaps. If the fallback has different letter widths or line heights, paragraphs rewrap and everything below moves — on a text-heavy page, often the largest single source of CLS. The fix is to self-host the fonts, preload only the weights used above the fold, and use a fallback whose metrics match the web font. Astro's Fonts API, stable since Astro 6, does all three: declare each family once in `astro.config.mjs`, and Astro downloads the files at build time, serves them from your own domain, and generates a metric-matched fallback with `size-adjust`, `ascent-override` and `descent-override`.

```js
// astro.config.mjs
import { defineConfig, fontProviders } from "astro/config";

export default defineConfig({
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Inter",
      cssVariable: "--font-body",
      weights: [400, 700],
      fallbacks: ["system-ui", "sans-serif"],
    },
  ],
});
```

```astro
---
// In your layout's <head>
import { Font } from "astro:assets";
---

<Font cssVariable="--font-body" preload />
```

Only weight 400 is included by default, so list every weight you use — and only those. Preload only the one or two weights used above the fold; every preloaded file competes with the hero image. If you self-host manually, use `font-display: swap` and add the same metric overrides to a fallback `@font-face`.

For anything else injected after the first paint — a related-posts block, an ad taller than its slot, a comment count from an API — the space must exist before the content does. Use skeleton placeholders with fixed heights and explicit ad-slot dimensions.

## A launch checklist for Core Web Vitals

Work through this list before every launch, and again after any change that adds JavaScript, an image or a font. It is ordered by leverage:

1. **Find the LCP element on each key template** and give it `priority` if it is an image, or remove whatever blocks it if it is text.
2. **Audit every island's directive.** No directive by default, `client:visible` below the fold, `client:idle` for non-urgent widgets, `client:load` only for controls the visitor may touch immediately.
3. **Check every image has dimensions** — `<Image />` or `<Picture />` for local images, `width`/`height` or `aspect-ratio` for everything else.
4. **Self-host fonts and preload only above-the-fold weights**, with a generic fallback so the metric-matched fallback is generated.
5. **List every third-party script and justify it.** Defer or delay what you keep.
6. **Reserve space for late content**: skeletons and fixed-height slots for ads, embeds and banners.
7. **Enable prefetch.** `prefetch: true` in `astro.config.mjs` prefetches linked pages on hover; strategies are `hover`, `tap`, `viewport` and `load`, and `prefetchAll: true` prefetches every link. Use `load` sparingly.
8. **Test on a real phone, on a slow connection**, and check field data after launch. A green lab score is not a pass until the 75th percentile of real loads agrees.

## Frequently asked questions

### What is a good Core Web Vitals score?

Good is LCP of 2.5 seconds or less, INP of 200 milliseconds or less, and CLS of 0.1 or less, each at the 75th percentile of real page loads, separately for mobile and desktop. A page passes only when all three are good. "Needs improvement" is LCP over 2.5 up to 4 seconds, INP over 200 up to 500 milliseconds, and CLS over 0.1 up to 0.25.

### Why is my Astro site slow if Astro ships zero JavaScript?

Because Astro ships zero JavaScript by default, not zero JavaScript in practice. The JavaScript on your pages comes from the islands you hydrate, the third-party scripts you add, and the frameworks those islands bring. Audit every island's directive and defer or delay third-party scripts.

### Should I use `client:load` or `client:visible` for a below-the-fold widget?

Use `client:visible`. `client:load` hydrates immediately, so its JavaScript competes with the LCP image and blocks the main thread. `client:visible` waits until the island scrolls into view. Reserve `client:load` for controls the visitor may touch immediately, such as the main navigation.

### Can I fix CLS just by adding `width` and `height` to images?

That fixes the largest cause, but not the only one. Web fonts swapping in with different metrics, ads and embeds without reserved space, and banners injected at the top can still move content. Fix images first, then fonts, then reserve space for late-arriving content.

### How long does a Core Web Vitals fix take to show in Search Console?

Field data is collected over a 28-day window, so a fix does not change the report overnight. You should see the improvement in lab tools and in your own `web-vitals` data within a day of deploying, and Search Console follows as the window rolls forward. Do not revert a fix because the report has not moved yet.

## Sources

- web.dev — [Web Vitals](https://web.dev/articles/vitals) and [Optimize Largest Contentful Paint](https://web.dev/articles/optimize-lcp): definitions, thresholds and the LCP subpart breakdown.
- web.dev — [The most effective ways to improve Core Web Vitals](https://web.dev/articles/top-cwv): LCP discovery, `fetchpriority`, and CDN use for TTFB.
- Google Search Central — [Core Web Vitals report](https://support.google.com/webmasters/answer/9205520): Search Console field data from CrUX.
- Astro docs — [Images](https://docs.astro.build/en/guides/images/): `<Image />`, `<Picture />`, `priority` and `layout`.
- Astro docs — [Fonts](https://docs.astro.build/en/guides/fonts/): the Fonts API, `cssVariable`, preloading and optimised fallbacks.
- Astro docs — [Prefetch](https://docs.astro.build/en/guides/prefetch/) and [View Transitions](https://docs.astro.build/en/guides/view-transitions/): prefetch strategies and `<ClientRouter />`.
- GoogleChrome/web-vitals — [web-vitals on GitHub](https://github.com/GoogleChrome/web-vitals): `onLCP`, `onINP`, `onCLS` and attribution.
