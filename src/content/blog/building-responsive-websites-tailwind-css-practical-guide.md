---
title: "Building Responsive Websites with Tailwind CSS: A Practical Guide"
meta_title: "Responsive Websites with Tailwind CSS Guide"
description: "Learn to build responsive websites with Tailwind CSS: mobile-first breakpoints, fluid grids and type, container queries, and an Astro setup for every screen."
date: 2026-11-14T05:00:00Z
image: "/images/building-responsive-websites-tailwind-css-practical-guide-feature.jpg"
og_image: "/images/building-responsive-websites-tailwind-css-practical-guide-og.jpg"
og_title: "Responsive Websites with Tailwind CSS"
og_description: "A practical guide to responsive websites with Tailwind CSS — breakpoints, fluid layouts, container queries and testing, with real Astro code examples."
categories: ["Technology", "Software"]
author: "John Doe"
tags: ["tailwind", "responsive-design", "css"]
draft: false
---

A responsive website stays usable and readable at every width, from a 360-pixel phone to a widescreen monitor, without a separate mobile version. Tailwind CSS fits that job because responsiveness is built into its utility classes: describe the small-screen layout first, then add prefixed utilities that change it as the screen grows. This guide walks through that workflow — breakpoints, grids, fluid type, images, container queries and testing — using Tailwind CSS v4 with Astro, the stack this site itself is built on.

## What responsive design means in Tailwind

In plain CSS, responsive design means writing media queries that restyle a page at certain widths. Tailwind moves that idea into the markup: every utility class can take a variant prefix — `md:flex`, `lg:grid-cols-3`, `xl:text-xl` — and Tailwind generates the matching media query. The layout decisions stay next to the elements they affect, so you can read a component and see how it behaves at each size without hunting through a stylesheet.

That changes how you design: instead of building a desktop page and then "fixing it for mobile", you build the mobile layout first and add complexity only where a wider screen earns it. A navigation bar is a good example: on a phone it is a logo and a menu button; at `md` it becomes a horizontal row of links; at `lg` it gains a search box.

Before you write classes, sketch the layout at three widths — phone, tablet, desktop — and note what changes at each step. If you cannot name the change, you probably do not need a breakpoint there.

## Start with the viewport meta tag and mobile-first CSS

Before any breakpoint works, the browser needs to know how to size the page. Add the viewport meta tag to the `<head>` of your document, as the Tailwind documentation instructs:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

Without it, mobile browsers render the page at a desktop-like width and shrink it to fit, which makes your breakpoints meaningless. In Astro, this tag belongs in your shared layout, so set it once there.

Tailwind uses a mobile-first breakpoint system. Unprefixed utilities apply at every screen size, and prefixed utilities apply at that breakpoint and above. The mistake the official docs warn about is treating `sm:` as "on small screens". It is not: `sm:` means "at the small breakpoint (640px) and wider".

```html
<!-- Centers text on mobile, left-aligns it on screens 640px and wider -->
<div class="text-center sm:text-left">Hello</div>

<!-- Wrong: this only centers text on screens 640px and wider -->
<div class="sm:text-center">Hello</div>
```

Write the mobile layout first, then layer on `sm:`, `md:`, `lg:` changes in that order, so you only write the overrides a wider screen actually needs.

## The default breakpoints

Tailwind ships five breakpoints, each a minimum width expressed in `rem` in Tailwind v4, compiling to a media query in modern range syntax (`@media (width >= 48rem)`):

| Prefix | Minimum width  | Typical use                              |
| ------ | -------------- | ---------------------------------------- |
| `sm`   | 40rem (640px)  | Large phones, small tablets in landscape |
| `md`   | 48rem (768px)  | Tablets                                  |
| `lg`   | 64rem (1024px) | Small laptops, large tablets             |
| `xl`   | 80rem (1280px) | Desktops                                 |
| `2xl`  | 96rem (1536px) | Wide desktops                            |

Because the system is mobile-first, `md:grid-cols-2` means "two columns from 768px up", and it stays in effect until another prefixed class overrides it. To confine a style to a single range, stack a breakpoint variant with a `max-*` variant: `md:max-lg:flex` applies only between the `md` and `lg` breakpoints. For a one-off size, use an arbitrary variant such as `min-[900px]:grid-cols-3` — but if you write the same arbitrary width twice, promote it to a real breakpoint.

![How Tailwind's mobile-first breakpoints cascade from small screens to large screens](/images/building-responsive-websites-tailwind-css-practical-guide-diagram-1.png)

Reserve breakpoints for genuine layout changes: a column count, a navigation pattern, a sidebar appearing or disappearing. If a heading only needs to be slightly larger on desktop, that is a job for fluid type (covered below), not a breakpoint.

## Setting up Tailwind CSS v4 in Astro

This site runs Astro 7 with Tailwind CSS v4, and the v4 setup differs from the v3 setup many older tutorials describe. In Tailwind v4 there is no `tailwind.config.js` by default and no `@astrojs/tailwind` integration to install. On Astro 5.2 and newer, the supported path is the Vite plugin, installed with one command:

```bash
npx astro add tailwind
```

That installs `tailwindcss` and `@tailwindcss/vite`, adds the plugin to the Vite configuration in `astro.config.mjs`, and creates a stylesheet — typically `src/styles/global.css` — containing the single line Tailwind v4 needs:

```css
@import "tailwindcss";
```

Import that stylesheet once in your shared layout so it applies to every page:

```astro
---
import "../styles/global.css";
---
```

An older guide telling you to install `@astrojs/tailwind` and create a `tailwind.config.mjs` describes the Tailwind v3 path, now labelled legacy support in the Astro styling docs. Mixing the two is a common source of classes silently not applying. If your utilities do nothing at all, check first whether `global.css` is imported in the layout that renders the page, and whether the old `@astrojs/tailwind` integration is still listed in `astro.config.mjs`.

Configuration in v4 lives in CSS, not JavaScript: the `@theme` directive in the same stylesheet is where you define design tokens — colours, fonts, spacing and breakpoints — covered in the custom-breakpoints section below.

## Responsive layouts with Flexbox and Grid

Most responsive work in Tailwind is choosing between Flexbox and Grid: Flexbox for one-dimensional arrangements (a row or a column of items), Grid for two-dimensional ones (rows and columns together). Both use the same breakpoint prefixes, so a layout can change shape as the screen grows.

A card list is the classic example. On a phone it is a single column; on a tablet it is two columns; on a desktop it is three:

```html
<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
  <!-- cards -->
</div>
```

That single line replaces a media query block and reads exactly like the design: one column by default, two at `sm`, three at `lg`.

Flexbox handles the cases where items should wrap, centre or stretch rather than sit in strict columns. A hero section that stacks on mobile and sits side by side on desktop is a few classes:

```html
<div class="flex flex-col gap-6 md:flex-row md:items-center">
  <div class="flex-1"><!-- text --></div>
  <div class="flex-1"><!-- image --></div>
</div>
```

A few utilities earn their keep in almost every responsive layout. `flex-wrap` lets a row of tags or buttons wrap instead of overflowing on a narrow screen. `min-w-0` on a flex child stops long content — a URL, a code snippet, a username — from forcing its parent wider than the viewport, which is one of the most common causes of horizontal scrolling on phones. `overflow-x-auto` on a wide table lets the table scroll inside its container instead of breaking the page. And `hidden md:block` swaps an element between breakpoints, for example a compact mobile menu button and a full desktop navigation row.

Spacing deserves the same treatment: start small and grow, as in `px-4 py-8 md:px-8 md:py-16`. A container should cap its width on large screens — `mx-auto max-w-7xl px-4` centres content and stops lines of text stretching across a widescreen monitor — while staying full-width on a phone.

## Responsive typography and spacing

Type that is comfortable on a desktop is usually too large on a phone, and type sized for a phone looks lost on a desktop. Tailwind's responsive text utilities handle the stepped version of this problem:

```html
<h1 class="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
  Building Responsive Websites
</h1>
```

That works, and for headings it is often enough. But stepped sizes jump abruptly at each breakpoint. Fluid typography fixes this by letting the size scale smoothly with the viewport, using CSS `clamp()` through Tailwind's arbitrary-value syntax:

```html
<h1 class="text-[clamp(1.75rem,1rem+3vw,3rem)] font-bold tracking-tight">
  Building Responsive Websites
</h1>
```

Read `clamp(1.75rem, 1rem + 3vw, 3rem)` as three promises: never smaller than 1.75rem, never larger than 3rem, and in between, grow with the viewport width. Use the same technique for section spacing, where `py-[clamp(2rem,6vw,5rem)]` gives you breathing room that grows with the screen.

Keep the type scale small — two or three heading sizes, one body size, one small size for captions — define it once in your `@theme` block, and cap text columns with `max-w-prose` (about 65 characters per line) so paragraphs stay readable on wide screens.

## Responsive images and media

A layout can be perfectly responsive while its images are not. Three habits prevent the usual problems. First, never let an image exceed its container: `max-w-full h-auto` on every content image. Second, preserve the image's shape as it resizes with `object-cover` and an aspect ratio — `aspect-video` for a 16:9 hero, `aspect-square` for an avatar — so a cropped image keeps its composition instead of stretching. Third, serve the right file for the screen: a 2400-pixel hero is wasted bandwidth on a phone, so use responsive image markup (`srcset` and `sizes`, or Astro's image component) to let the browser pick a smaller file.

Video and embeds need the same treatment — an `<iframe>` with a fixed pixel width will overflow a phone, so wrap embeds in an aspect-ratio container:

```html
<div class="aspect-video w-full overflow-hidden rounded-lg">
  <iframe class="h-full w-full" src="..." title="Video"></iframe>
</div>
```

On a phone, an oversized image is not just a layout bug, it is a loading-time bug too — see [how to improve Core Web Vitals in Astro](/blog/improve-core-web-vitals-astro-websites), where image weight and layout shift are covered as performance issues. If an image adds nothing on a small screen, hiding it with `hidden md:block` is legitimate, provided it is genuinely decorative.

## Container queries: components that respond to their own space

Viewport breakpoints answer "how wide is the screen?" Container queries answer a better question for reusable components: "how wide is the space I have been given?" A card in a full-width grid on one page and a narrow sidebar on another should not need two versions — it should adapt to its container.

Tailwind v4 supports container queries natively, with no plugin. Mark the parent as a container with `@container`, then use `@`-prefixed variants on the children:

```html
<div class="@container">
  <article class="flex flex-col gap-4 @md:flex-row">
    <img class="w-full @md:w-48" src="..." alt="" />
    <div><!-- title and text --></div>
  </article>
</div>
```

Here the article stacks vertically by default and switches to a horizontal row when its container — not the viewport — reaches the `@md` container size. Note the scale differs from viewport breakpoints: container sizes run from `@3xs` (16rem / 256px) to `@7xl` (80rem / 1280px), and `@md` is 28rem (448px), not the 48rem of the `md:` viewport breakpoint. Like viewport variants, container queries are mobile-first: `@md:flex-row` applies at `@md` and above, and `@max-md:` applies below a size. You can name containers with `@container/main` and target them with `@sm/main:` when several are nested.

![A card component switching from a stacked layout to a horizontal layout when its container widens, independent of the viewport width](/images/building-responsive-websites-tailwind-css-practical-guide-diagram-2.png)

Container queries shine in design systems, where the same component is reused in different slots: a card written once with container queries works in a sidebar, a modal and a full-width grid without a single viewport breakpoint. If you are standardising components across a site, read [how to build a scalable design system with Astro and Tailwind CSS](/blog/build-scalable-website-design-system-astro-tailwind-css) next — container queries are the mechanism that makes those components genuinely portable.

One caution: a container query measures its nearest container ancestor, and an element cannot query itself. If `@md:` seems to do nothing, check that the `@container` class is on an ancestor, not on the same element you are trying to restyle.

## Custom breakpoints and theme tokens

The five default breakpoints cover most sites, but a design sometimes needs its own. In Tailwind v4 you add breakpoints in CSS with `@theme`, using `--breakpoint-*` variables in `rem` — the same unit the defaults use, so the generated utilities sort in the right order:

```css
@import "tailwindcss";

@theme {
  --breakpoint-xs: 30rem; /* 480px — small phones in landscape */
  --breakpoint-3xl: 120rem; /* 1920px — very wide screens */
}
```

That immediately creates `xs:` and `3xl:` variants you can use in markup, for example `grid xs:grid-cols-2 3xl:grid-cols-6`. To replace the defaults entirely, reset them first and define your own set:

```css
@theme {
  --breakpoint-*: initial;
  --breakpoint-tablet: 48rem;
  --breakpoint-laptop: 64rem;
  --breakpoint-desktop: 80rem;
}
```

The `@theme` block is also where a responsive type scale belongs. Define fluid sizes once as `--text-*` tokens and they become utilities everywhere:

```css
@theme {
  --text-display: clamp(2rem, 1rem + 4vw, 3.5rem);
  --text-lead: clamp(1.125rem, 1rem + 0.5vw, 1.375rem);
}
```

Then `text-display` and `text-lead` work in any component, and changing the scale later means editing one line. Keep the token set small — a handful of breakpoints, a handful of type sizes.

## Testing checklist: how to know it actually works

Responsive design is not finished when the code looks right; it is finished when the site has been checked at real widths. Work through this list before shipping:

- **Check the widths that matter, not just the breakpoints.** Test at 360px, 768px, 1024px and 1440px, and just either side of each breakpoint you use.
- **Look for horizontal scrolling.** On a phone, scroll sideways: if the page moves, something overflows. Long URLs, wide tables, fixed-width elements and flex children without `min-w-0` are the usual suspects. Fix the cause, not the symptom — `overflow-x-hidden` on the body hides the scrollbar but leaves the broken layout underneath.
- **Check touch targets and keyboard access.** Buttons and links should be easy to tap — aim for at least 44 pixels of height at mobile sizes — and a mobile menu that only works on hover, or traps keyboard focus, is a responsive failure as much as a visual one. The accessibility side is covered in [web accessibility in Astro](/blog/web-accessibility-astro-semantic-html-aria-keyboard-navigation), including semantic HTML, ARIA and keyboard navigation.
- **Test on a real phone, not only in a desktop browser's device toolbar.** The toolbar is useful for quick checks, but it does not reproduce real viewport behaviour, font rendering or touch scrolling.

## Putting it together: a responsive card grid in Astro

Here is the whole workflow in one small Astro component — a blog card grid that is one column on a phone, two on a tablet and three on a desktop:

```astro
---
const posts = [
  {
    title: "First post",
    excerpt: "A short summary.",
    image: "/images/image-placeholder.png",
  },
  {
    title: "Second post",
    excerpt: "A short summary.",
    image: "/images/image-placeholder.png",
  },
  {
    title: "Third post",
    excerpt: "A short summary.",
    image: "/images/image-placeholder.png",
  },
];
---

<section class="mx-auto max-w-7xl px-4 py-8 md:py-16">
  <h2 class="text-[clamp(1.5rem,1rem+2vw,2.25rem)] font-bold tracking-tight">
    Latest articles
  </h2>
  <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {posts.map((post) => (
      <article class="overflow-hidden rounded-xl bg-white shadow-sm">
        <img
          class="aspect-video w-full object-cover"
          src={post.image}
          alt={post.title}
        />
        <div class="p-4">
          <h3 class="text-lg font-semibold">{post.title}</h3>
          <p class="mt-1 text-gray-600">{post.excerpt}</p>
        </div>
      </article>
    ))}
  </div>
</section>
```

Nothing in that component mentions a pixel width except through the breakpoint prefixes and the `clamp()` type size. That is the point: the responsive behaviour is declared in the markup, the theme tokens live in one CSS file, and the component itself stays readable.

## Frequently asked questions

### Should I design mobile-first or desktop-first with Tailwind?

Mobile-first. Tailwind's breakpoints are `min-width` queries, so the unprefixed utility is the base and each prefix adds a change for wider screens. The base layout is the one most visitors actually see, and every breakpoint you add is a deliberate improvement rather than a repair. Desktop-first means fighting the framework, overriding desktop styles downward with `max-*` variants everywhere.

### How many breakpoints should a website have?

As few as the design needs — usually two or three layout shifts per page. Tailwind gives you five by default, but using all five on one component is a warning sign. If a component changes at every breakpoint, ask whether fluid type, flexible grids or a container query would handle the in-between sizes more gracefully. Add a custom breakpoint only when a real design decision lands at a width the defaults do not cover.

### What is the difference between a breakpoint and a container query?

A breakpoint responds to the viewport width; a container query responds to the width of a parent element. Use breakpoints for page-level layout — the navigation pattern, the number of columns in a grid, the sidebar appearing. Use container queries for reusable components in different slots, such as a card that should stack in a narrow sidebar and sit side by side in a wide grid. In Tailwind v4, breakpoints use `sm:` / `md:` prefixes and container queries use `@container` with `@sm:` / `@md:` variants — and the two scales differ, with `@md` at 28rem against `md` at 48rem.

### Why does my Tailwind layout break only on mobile?

The most common causes, in order: a missing viewport meta tag, so the phone renders a desktop-width page; an element wider than the viewport, usually a fixed-width image, a long unbroken string, or a flex child without `min-w-0`; and a `sm:` class mistaken for a mobile style, when it actually applies at 640px and above. Check for horizontal scrolling first — it points straight at the overflowing element.

### Do I need Tailwind v4, or does this work in v3?

Everything in this guide is written for Tailwind v4, which is what this site uses: CSS-first configuration with `@theme`, the `@tailwindcss/vite` plugin in Astro, and container queries built in. In v3 the same responsive utilities and breakpoint prefixes work the same way, but configuration lives in `tailwind.config.js` (`theme.screens`), the Astro setup uses the `@astrojs/tailwind` integration, and container queries need the separate `@tailwindcss/container-queries` plugin. If you are starting a new project, use v4.

## References

- Tailwind CSS, "Responsive design" — [tailwindcss.com/docs/responsive-design](https://tailwindcss.com/docs/responsive-design)
- Astro Docs, "Styles and CSS" (Tailwind setup) — [docs.astro.build/en/guides/styling](https://docs.astro.build/en/guides/styling/)
- Tailwind CSS, "Theme" (`--breakpoint-*` and `--container-*` variables) — [tailwindcss.com/docs/theme](https://tailwindcss.com/docs/theme)
