---
title: "Technical SEO for Astro Websites: Sitemaps, Canonicals and Structured Data"
meta_title: "Technical SEO for Astro Websites"
description: "Technical SEO for Astro websites: automatic sitemaps, self-referencing canonical URLs, robots.txt and JSON-LD structured data, with working Astro 7 examples."
date: 2026-11-12T05:00:00Z
image: "/images/technical-seo-astro-websites-sitemaps-canonicals-structured-data-feature.jpg"
og_image: "/images/technical-seo-astro-websites-sitemaps-canonicals-structured-data-og.jpg"
og_title: "Technical SEO for Astro Websites"
og_description: "Sitemaps, canonical URLs and JSON-LD structured data for Astro sites — a practical technical SEO guide with working config and code."
categories: ["SEO"]
author: "Muhammad Zaheer Ahmad"
tags: ["astro", "seo", "technical-seo"]
draft: false
---

Astro already does a lot of the hard work for search engines: pages are prerendered to plain HTML at build time, so a crawler gets the full content without running JavaScript. But that head start only pays off if the technical plumbing around the pages is right. This guide covers the three pillars of technical SEO for an Astro site — sitemaps, canonical URLs and structured data — plus robots.txt and meta tags.

## Why technical SEO matters on a fast static site

Content and links decide what a page ranks for, but technical SEO decides whether search engines can find and trust it at all. A page that is never discovered is never ranked, and a page at five different URLs splits its own signals across five versions.

Astro helps because pages are prerendered by default, so crawlers that do not execute JavaScript still receive the complete content. What remains is the site owner's job: tell crawlers which pages exist, which URL is the real one for each page, and what each page is about. One principle runs through all three: the URL in your sitemap, canonical tag, structured data and internal links should all be the same URL.

## Sitemaps: tell crawlers which pages exist

A sitemap is an XML file listing the URLs you want search engines to crawl, usually with a last-modified date for each one. It does not guarantee indexing — Google decides that itself — but it is the most reliable way to make sure new and updated pages are discovered quickly, especially pages that are several clicks from the homepage or have few inbound links.

### Install the official integration

Astro does not generate a sitemap out of the box. The official integration is `@astrojs/sitemap`, installed with one command:

```bash
npx astro add sitemap
```

That installs the package and registers it in your config. The integration needs one thing: your deployed URL, set as the `site` option in `astro.config.mjs` — the exact production origin you want indexed, beginning with `http://` or `https://`, including whether or not you use `www`:

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://www.example.com",
  integrations: [sitemap()],
});
```

Without `site` set, the integration cannot build absolute URLs and will not produce a usable sitemap — the most common sitemap mistake in Astro projects, and the first thing to check when a sitemap looks empty.

On every build, the integration crawls your statically generated routes — including dynamic routes produced by `getStaticPaths()`, such as blog posts from a content collection — and writes `sitemap-index.xml` and `sitemap-0.xml` into your output directory. Past the default limit of 45,000 URLs per file, it splits the output into additional numbered files.

![How the Astro sitemap integration builds sitemap-index.xml and sitemap-0.xml from your routes at build time](/images/technical-seo-astro-websites-sitemaps-canonicals-structured-data-diagram-1.png)

### Control what goes in

Every static page is included by default, which is not always what you want: thank-you pages, previews, drafts and private routes should not be handed to a search engine. `filter` receives each page's full URL and returns `false` to leave it out:

```js
sitemap({
  filter: (page) => !page.includes("/thank-you/") && !page.includes("/drafts/"),
});
```

The `serialize` option goes further: it lets you adjust individual entries, which is how you set an accurate `lastmod` per page — for a blog, from the post's own frontmatter, its `updated` date if one exists, otherwise its publish date. Wrong `lastmod` values are worse than none, because crawlers learn to ignore the file.

Two details from Google's documentation are worth knowing. First, Google ignores the `changefreq` and `priority` hints in sitemaps, so do not spend time tuning them. Second, sitemap inclusion is only a weak canonicalization signal: it helps a URL become canonical, but it cannot override a stronger signal pointing elsewhere.

One limitation: the integration cannot generate entries for dynamic routes rendered on demand in SSR mode, because those URLs do not exist at build time — add them explicitly with the `customPages` option, or generate a separate sitemap from an endpoint.

### Submit it and verify

Once the sitemap exists, submit the index file — `/sitemap-index.xml`, not `/sitemap.xml`, which Astro does not create — in Google Search Console and Bing Webmaster Tools, then check the report: it tells you how many submitted URLs were indexed and flags the ones that were not, with a reason. The same build also serves the site's feeds at `/rss.xml`, `/atom.xml` and `/feed.json`; how the three formats differ is covered in [RSS vs Atom vs JSON Feed: which format should your website support?](/blog/rss-vs-atom-vs-json-feed-which-format-should-website-support).

## robots.txt: point crawlers at the sitemap

The sitemap integration does not write a robots.txt file, and Astro does not generate one by default. Add it yourself, either as a static file in `public/robots.txt` or as a generated endpoint at `src/pages/robots.txt.ts`. The endpoint is better for most sites, because the sitemap URL is built from your `site` config:

```ts
// src/pages/robots.txt.ts
import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL("sitemap-index.xml", site).href;
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`);
};
```

In a static build, Astro runs this endpoint once and writes `dist/robots.txt`. The `Sitemap:` line must be an absolute URL pointing at the index file the integration actually creates.

Two rules about robots.txt are frequently misunderstood. First, it controls crawling, not indexing: a `Disallow` rule asks crawlers not to fetch a page, but Google can still index a disallowed URL if other pages link to it. To keep a page out of search results, use a `noindex` meta tag on the page itself and leave the page crawlable so Google can see the tag. Second, robots.txt is a request, not access control: it does not hide staging sites or private content, which belong behind authentication.

That matters for staging and preview deployments, which can end up indexed and competing with production for the same content. Decide the robots.txt content from an environment variable at build time, so every non-production build blocks crawlers automatically instead of relying on someone remembering to edit a file.

## Canonical URLs: pick one URL per page and stick to it

The same content can be reachable at many URLs: with and without a trailing slash, with and without `www`, over HTTP and HTTPS, with tracking parameters, and through paginated or syndicated copies. Google groups these near-duplicates into a cluster and picks one representative URL — the canonical — to show in search results. Canonicalization is the process of telling Google which one that should be.

### The signals, ranked

Google's Search Central documentation ranks the canonicalization methods by strength:

1. **Redirects.** A 301 redirect from a duplicate to the preferred URL is a strong signal. Use it when a duplicate should not exist at all, such as an old URL after a move.
2. **`rel="canonical"` link annotations.** A `<link rel="canonical">` element in the page head is also a strong signal. Use it when both versions need to exist for users — a print view, a filtered listing, a syndicated copy — but only one should be indexed.
3. **Sitemap inclusion.** A weak signal. It supports a URL's case for being canonical, but it cannot carry the decision on its own.

These methods stack: when the redirect, the canonical tag, the sitemap and your internal links all point at the same URL, the combined signal is far stronger than any one of them alone. And none of them is a command — Google describes canonicalization as a preference, not an instruction, and it can choose a different URL if its own analysis disagrees.

![The canonical decision flow: duplicate URLs are grouped, signals are compared, and one representative URL is chosen for search results](/images/technical-seo-astro-websites-sitemaps-canonicals-structured-data-diagram-2.png)

### The rules for a correct canonical tag

Every page should carry a self-referencing canonical tag — a tag on the canonical page itself, pointing at its own URL. That sounds redundant, but it protects the page when it is reached through a URL variant. Google's guidance is explicit:

- **Use absolute URLs**, not relative paths, which can be resolved against the wrong base.
- **Use HTTPS** and match the `www` form you actually use.
- **Do not use a URL fragment** as a canonical; Google generally does not support fragments in canonicals.
- **Do not point different techniques at different URLs.** The canonical in the head, the URL in the sitemap and the URL in your internal links must agree.
- **Do not use `noindex` to choose a canonical within your own site.** It blocks the page from search entirely instead of consolidating it.

A minimal canonical element looks like this:

```html
<link rel="canonical" href="https://www.example.com/blog/my-post/" />
```

In Astro, derive the canonical from the page's own URL rather than hard-coding it per page. A layout that builds it from `Astro.url.pathname` combined with the configured `site` origin covers every page automatically, and an optional frontmatter `canonical` field lets individual posts override it — for example, a republished article whose original lives on another site. This theme follows that pattern: the base layout always emits a canonical tag, defaulting to the page's own URL, with an explicit frontmatter value winning when one is set.

The most common canonical bugs are not in the tag but in the URLs around it. A trailing-slash mismatch is the classic one: if your site serves `/blog/my-post/` but your internal links point to `/blog/my-post`, crawlers see two versions of every page. Pick one form, set Astro's `trailingSlash` option to match it, and make every internal link, sitemap entry and canonical tag use that form. The same applies to query strings: a link with `?utm_source=...` is a different URL to a crawler, so keep tracking parameters out of internal links.

Some duplicates are deliberate — a product under two categories, a post syndicated elsewhere, a printable version — and `rel="canonical"` is what keeps them usable while telling search engines which version to index. Never block such duplicates with robots.txt, which prevents Google from seeing the tag.

## Structured data: say what the page is, in machine-readable form

Structured data is a standardized format for describing a page and classifying its content, so search engines can understand what the page is about rather than inferring it from prose alone. The vocabulary is schema.org, which defines types such as `Article`, `Product` and `Organization`. The format Google recommends is JSON-LD: a `<script type="application/ld+json">` block that sits apart from the visible HTML, making it far easier to maintain than annotating the visible markup. Google also supports Microdata and RDFa, and says all three are equally fine when valid, but JSON-LD is recommended because it is less prone to errors.

### Which types to use

Use the most specific type that genuinely describes the page's main content — for a blog, usually `BlogPosting` for each article, plus site-wide `WebSite` and `Organization` blocks:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BlogPosting",
      "headline": "Technical SEO for Astro Websites",
      "description": "Sitemaps, canonical URLs and structured data for Astro sites.",
      "datePublished": "2026-11-14T05:00:00Z",
      "author": { "@type": "Person", "name": "John Doe" },
      "publisher": { "@type": "Organization", "name": "Example Site" },
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": "https://www.example.com/blog/technical-seo-astro-websites-sitemaps-canonicals-structured-data/"
      },
      "url": "https://www.example.com/blog/technical-seo-astro-websites-sitemaps-canonicals-structured-data/"
    }
  ]
}
```

Three things in that example are deliberate. The `url` and `mainEntityOfPage` values are the page's canonical URL, keeping structured data consistent with the canonical tag and the sitemap. The `datePublished` is an ISO 8601 timestamp. And the markup lives in a single `@graph` array inside one script tag, which is easier to audit than several unrelated scripts.

This theme builds its JSON-LD the same way: a shared helper produces `BlogPosting` for post pages, `WebSite` and `Organization` blocks site-wide, plus `BreadcrumbList` for pages with a breadcrumb trail, and the base layout merges them into exactly one `@graph` script per page. Duplicate `Article` or `BlogPosting` blocks on the same page are a common source of validation warnings, so check what a theme already emits before adding your own.

### The rules Google actually enforces

Google's general structured data guidelines draw the line between markup eligible for rich results and markup that earns a manual action:

- **Markup must match visible content.** Do not describe content readers cannot see on the page: if the JSON-LD names an author, a date or an image, the page itself must show it.
- **Do not mark up irrelevant or misleading content.** Fake reviews, ratings that do not exist and prices for things that are not for sale are policy violations.
- **Use the most specific applicable type.** A `BlogPosting` for a blog post is more useful than a vague `Article`, and more likely to match a documented Search feature.
- **Do not block the page to Googlebot.** Structured data on a page that robots.txt or `noindex` hides from crawlers cannot be read or used.

Two expectations need correcting. First, eligibility is not a guarantee: Google states that it does not guarantee structured data will show up in search results, even when the Rich Results Test validates it. Second, structured data is not a ranking factor — a manual action against it removes rich-result eligibility but does not affect how the page ranks in web search. Its value is that it makes your page understandable and eligible for enhanced display.

### Validate before and after publishing

Test every page with structured data in Google's Rich Results Test, which reports the types Google recognises and missing required properties, and with the Schema Markup Validator for vocabulary and syntax errors. Run the test on the live URL, not just on pasted code. Then check the Enhancements reports in Search Console after publishing.

If a page has no type matching a documented Google Search feature, schema.org markup is still reasonable for machine readability, but do not expect a rich result from it. Schema.org defines far more types than Google uses for Search; Search Central — not schema.org — is the reference for what Google will display.

## Meta tags, Open Graph and the social preview

Every page needs a unique `<title>` and a unique meta description, and every blog post should also carry Open Graph tags (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`) and Twitter card tags, with `og:url` set to the canonical URL.

Social platforms crop preview images aggressively, so compose the featured image with its subject clear of the edges, and serve it in a modern, well-compressed format — the details are covered in [Image Optimization for Astro: WebP, AVIF, Responsive Images and CDN Delivery](/blog/image-optimization-astro-webp-avif-responsive-images-cdn-delivery).

Title and description length are practical limits: a title much longer than 60 characters is truncated in search results, and a description much longer than 160 characters is cut off. Write them for the human reading the result, with the page's main keyword near the front of the title.

## A verification workflow that catches the usual mistakes

Technical SEO work is only finished when checked from the outside, the way a crawler sees it. A short routine after each deploy catches almost everything that goes wrong:

1. **Fetch the homepage and a post with `curl` and read the head.** Confirm the canonical tag is present, absolute and self-referencing, and the title, description and Open Graph tags are the ones you intended.
2. **Open `/sitemap-index.xml` and one numbered sitemap.** Confirm the new pages are listed, the URLs match the canonical form exactly, and the `lastmod` dates are real dates from the content.
3. **Open `/robots.txt`.** Confirm it is served and the `Sitemap:` line points at the real index file.
4. **Run the Rich Results Test on a new post.** Confirm the `BlogPosting` block validates and no duplicate structured data blocks appear.
5. **Check Search Console.** Submit the sitemap if it is new, use URL Inspection to see which canonical Google chose, and watch the Enhancements reports.

Most technical SEO problems are not exotic: a `site` URL never set, a trailing-slash mismatch between links and canonicals, a sitemap listing pages the canonical tag points away from, or structured data describing content the page does not show.

The frontmatter fields behind all of this — title, description, image, dates and the optional `canonical` override — come from the content collection that defines each post, as covered in [Astro Content Collections: A Complete Guide to Managing Blog Content](/blog/astro-content-collections-complete-guide-managing-blog-content).

## Frequently asked questions

### Does Astro generate a sitemap automatically?

No. Astro ships no sitemap by default. Install the official `@astrojs/sitemap` integration with `npx astro add sitemap`, set the `site` option to your production URL, and every build writes `sitemap-index.xml` and `sitemap-0.xml` into the output directory.

### Should every page have a self-referencing canonical tag?

Yes. Google recommends a `rel="canonical"` link on the canonical page itself, pointing at its own URL. It protects the page when it is reached through a URL variant — a trailing slash, a tracking parameter, a different case. Use an absolute HTTPS URL matching your sitemap and internal links.

### Does structured data improve rankings?

No, not directly. Google states that structured data does not affect how a page ranks in web search, and that a structured-data manual action only removes rich-result eligibility. The value is different: valid markup makes a page eligible for rich results, which can make its listing more informative.

### What is the difference between robots.txt and noindex?

Robots.txt asks crawlers not to fetch a page; it does not prevent the URL from being indexed if other pages link to it. A `noindex` meta tag on the page itself tells search engines not to include the page in results, and the page must remain crawlable for Google to see the tag.

### Why did Google choose a different canonical URL than the one I specified?

A canonical tag is a preference, not a command, and Google can override it. The usual causes are conflicting signals — a sitemap, internal links or redirects pointing at a different URL than the tag — or pages so similar that Google's clustering picks a different representative. Check the URL Inspection tool and align every signal on one URL.
