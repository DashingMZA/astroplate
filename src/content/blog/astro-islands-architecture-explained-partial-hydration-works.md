---
title: "Astro Islands Architecture Explained: How Partial Hydration Works"
meta_title: "Astro Islands Architecture: Partial Hydration Explained"
description: "Learn how Astro islands architecture works: partial hydration, client directives, server islands, and shipping zero JavaScript by default on content sites."
date: 2026-11-14T05:00:00Z
image: "/images/astro-islands-architecture-explained-partial-hydration-works-feature.jpg"
og_image: "/images/astro-islands-architecture-explained-partial-hydration-works-og.jpg"
og_title: "Astro Islands Architecture Explained"
og_description: "How Astro islands architecture and partial hydration work — client directives, server islands, and zero JavaScript by default."
categories: ["Technology", "Architecture"]
author: "John Doe"
tags: ["astro", "islands", "performance"]
draft: false
---

Most websites are mostly reading material: headings, paragraphs, images, and links that never need JavaScript to do their job. Yet many frameworks ship a JavaScript application for the whole page anyway, then re-run it in the browser just to make a search box or a carousel work. Astro islands architecture flips that default. The page is rendered to static HTML, and only the small interactive regions — the islands — get JavaScript, each on its own schedule.

This guide explains how that works in practice: what an island is, how partial hydration turns server-rendered HTML into an interactive widget, what each `client:*` directive does, and when server islands are the better tool.

## What islands architecture is

Islands architecture is a rendering pattern in which a page is mostly static HTML with small, self-contained regions of interactivity embedded in it. The term "component island" was coined by Etsy frontend architect Katie Sylor-Miller in 2019, and the pattern was documented by Preact creator Jason Miller in 2020. Astro helped popularise it and became the first mainstream framework with selective hydration built in.

Picture a page as a sea of static HTML. Floating in that sea are a few islands: a navigation menu, an image carousel, a newsletter form, a pricing calculator. Each island is interactive; everything between them is plain HTML and CSS, rendered on the server and sent exactly as it will be displayed. No JavaScript application wraps the whole page, and no framework runtime runs just to keep static text on screen.

In Astro, there are two kinds of island. A **client island** is an interactive JavaScript UI component that is hydrated separately from the rest of the page. A **server island** is a UI component that server-renders its dynamic content separately from the rest of the page. Both exist so that expensive or slow work — whether it runs in the browser or on the server — happens per component, in isolation, instead of holding up the whole page.

![A page rendered as a sea of static HTML with three glowing interactive islands — a menu, a carousel, and a form — floating above it](/images/astro-islands-architecture-explained-partial-hydration-works-diagram-1.png)

The contrast with the single-page application (SPA) model makes the idea concrete. In a typical SPA, the server sends a mostly empty HTML shell and a large JavaScript bundle, and the browser must download and run it before the page becomes interactive — even for text that never changes. Islands architecture keeps the component-based developer experience but removes the all-or-nothing hydration: the page arrives as finished HTML, and JavaScript is added back only where a component genuinely needs it. Search engines likewise receive complete HTML without a rendering step.

## How partial hydration works

Partial hydration — also called selective hydration — is the technique underneath islands architecture. Hydration is taking server-rendered HTML and attaching JavaScript behaviour to it: event listeners, state, and the framework runtime that keeps the component live. Full hydration does this for the entire page at once; partial hydration does it only for the components you mark, and only when you say so.

Here is what happens when Astro builds and serves a page with islands:

1. **Every component renders to HTML on the server.** Astro components (`.astro` files) and UI framework components (React, Vue, Svelte, Solid, Preact) are all rendered to HTML at build time, or at request time for on-demand pages.
2. **Components without a directive ship no JavaScript.** By default, Astro strips out all client-side JavaScript. A React component used with no directive renders to static HTML and CSS only — it looks identical to the interactive version, but does nothing when clicked. This zero-JavaScript-by-default rule is the single most important thing to understand about Astro.
3. **A `client:*` directive marks an island.** Adding a directive such as `client:load` tells Astro to build and bundle that component's JavaScript, plus the framework runtime it needs, and to ship it with the page.
4. **Astro wraps the island in an `<astro-island>` element.** In the delivered HTML, each island is wrapped in this custom element, which loads the island's JavaScript at the right moment and starts hydration. The server-rendered HTML inside is what the visitor sees first; hydration reuses it rather than re-rendering from scratch.
5. **Each island hydrates on its own trigger, in parallel and in isolation.** Islands do not wait for each other. A heavy carousel lower down the page does not block the header menu from becoming interactive, and a failure in one island does not take down the others.

![Flow diagram showing partial hydration: the server renders the full page to HTML, components without a directive stay static, marked islands are wrapped in astro-island elements and hydrate independently on their own triggers](/images/astro-islands-architecture-explained-partial-hydration-works-diagram-2.png)

A short example makes the boundary visible. Consider a blog post page with a header, an article, a newsletter form, and a comments section:

```astro
---
import Header from "../components/Header.astro";
import NewsletterForm from "../components/NewsletterForm.jsx";
import Comments from "../components/Comments.jsx";
---

<Header />
<article>
  <!-- Static HTML: headings, paragraphs, images. No JavaScript. -->
</article>
<NewsletterForm client:idle />
<Comments client:visible />
```

`Header` is an Astro component, so it is server-only and ships no JavaScript. `NewsletterForm` hydrates when the browser is idle; `Comments` hydrates only when scrolled into view. If the visitor never scrolls to the comments, that JavaScript is never downloaded.

Two rules follow. First, only UI framework components can become client islands: a `client:*` directive can be attached to a React, Vue, Svelte, Solid, or Preact component, but not to an `.astro` component, which has no client runtime to hydrate. Use a `<script>` tag in an Astro component instead for small page-level scripts. Second, props passed to an island must be serializable — functions cannot be passed as props.

## Client islands and the zero-JavaScript default

The zero-JavaScript default is a design decision, not an accident. Astro renders every UI component to HTML and CSS and strips out client-side JavaScript automatically, unless you explicitly opt a component in. The official documentation puts it plainly: this behaviour "keeps Astro websites fast by default and protects developers from accidentally sending unnecessary or unwanted JavaScript."

That protection matters because JavaScript is, per byte, one of the slowest assets a page can load: it must be downloaded, parsed, compiled, and executed on the main thread, competing directly with rendering and with responding to taps. A page with two or three small islands pays that cost only for those islands, and only when their directives fire.

In Astro, every `client:*` directive is therefore a deliberate purchase: you are buying interactivity for one component with download size, parse time, and main-thread work. That is a good trade for a search box the visitor uses on every visit, and a poor trade for a decorative widget nobody clicks. Start with static HTML, add an island only when a component must respond to the visitor, and choose the laziest directive that still feels instant.

## The five client directives

There are five built-in client directives, and they differ only in _when_ an island hydrates. Choosing between them is where most of the performance benefit lives.

| Directive        | Priority | Hydrates when                          | Browser mechanism                                       | Use for                                     |
| ---------------- | -------- | -------------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| `client:load`    | High     | Immediately on page load               | None — loads with the page                              | Above-the-fold controls needed at once      |
| `client:idle`    | Medium   | When the browser is idle               | `requestIdleCallback`, falling back to the `load` event | Lower-priority widgets                      |
| `client:visible` | Low      | When the component enters the viewport | `IntersectionObserver`                                  | Below-the-fold or heavy components          |
| `client:media`   | Low      | When a CSS media query matches         | `matchMedia`                                            | Screen-size-specific UI                     |
| `client:only`    | High     | Immediately, client-side only          | None — no server render                                 | Components that cannot render on the server |

### client:load — hydrate immediately

`client:load` hydrates immediately on page load. Use it only for UI visible on first paint that must be interactive at once — a navigation menu, a cart button, an above-the-fold modal trigger. It competes with everything else at startup, so it is the most expensive directive and the most overused. If a component can wait even a moment, it should not be `client:load`.

```astro
<MobileMenu client:load />
```

### client:idle — hydrate when the browser is idle

`client:idle` waits until initial load is done and the browser reports idle time, via `requestIdleCallback` (falling back to the `load` event). It suits near-the-fold, low-urgency islands — a search widget, a newsletter form, a theme toggle — which load in the background while the visitor reads. Cap the wait with a `timeout` option:

```astro
<SearchWidget client:idle={{ timeout: 2000 }} />
```

### client:visible — hydrate when scrolled into view

`client:visible` hydrates only once the component enters the viewport, via an `IntersectionObserver`. It suits anything below the fold, especially heavy components — carousels, charts, comment forms. If the visitor never scrolls that far, the JavaScript is never loaded at all. Start early with a `rootMargin` option:

```astro
<LazyChart client:visible={{ rootMargin: "200px" }} />
```

### client:media — hydrate only on matching screens

`client:media` hydrates only when a CSS media query matches, using `matchMedia` under the hood. It suits UI that exists on one screen size and not another: a mobile hamburger menu or a desktop-only dashboard widget can simply never hydrate where it is not shown:

```astro
<SidebarToggle client:media="(max-width: 768px)" />
<DesktopDashboard client:media="(min-width: 1024px)" />
```

### client:only — skip server rendering entirely

`client:only` skips HTML server rendering and renders only on the client, loading and hydrating immediately like `client:load`. Use it for components that cannot render on the server: anything that reads `window`, `document`, or `localStorage` during render, or a library that assumes a browser environment at import time. You must pass the framework as the value, because Astro has no server-rendered output to infer it from:

```astro
<BrowserOnlyMap client:only="react" />
```

The trade-off is real: with `client:only` there is no server-rendered HTML, so the island is blank until its JavaScript runs. Treat it as an escape hatch, not a default — a component that only touches browser APIs inside a handler or effect can usually render on the server and hydrate normally.

## Choosing the right directive

A practical decision process, applied island by island, beats any memorised list:

1. **Does this component need JavaScript at all?** If it is text, an image, a link, or a layout, the answer is no — leave it static. If the interaction is a single toggle, a `<script>` tag in an Astro component may be cheaper than a whole framework runtime.
2. **Is it above the fold and needed immediately?** Only then is `client:load` justified.
3. **Does it depend on the screen size?** If it only exists on mobile or only on desktop, `client:media` skips its cost everywhere else.
4. **Is it below the fold?** Use `client:visible`, with a `rootMargin` if the island is heavy and you want it ready on arrival.
5. **Otherwise, use `client:idle`.** It is the safe middle ground for everything that should be ready soon but does not need to compete with first paint.
6. **Can it render on the server?** Only if the answer is genuinely no should you reach for `client:only`.

## Server islands: dynamic content without a dynamic page

Client islands solve the problem of JavaScript in the browser. Server islands solve the mirror-image problem: a page that is mostly static but has one piece of personalised, slow, or live content that used to force the entire page out of static rendering.

Add the `server:defer` directive to any Astro component and it becomes a server island. The rest of the page renders immediately — statically, and cacheable — with fallback content in place. A small script then fetches the island's rendered HTML from the server and swaps it in when ready:

```astro
---
import Avatar from "../components/Avatar.astro";
---

<Avatar server:defer>
  <span slot="fallback">Loading profile…</span>
</Avatar>
```

The `fallback` slot is what the visitor sees first, so make it match the final content's shape — a skeleton in the same dimensions, or a generic avatar — rather than nothing at all. That is what prevents layout shift when the real content lands.

Server islands need an adapter installed, because the deferred component is rendered on demand by a server. The page itself can stay static and aggressively cached while the island is rendered per request. Props must be serializable — plain objects, strings, numbers, arrays, `Map`, `Set`, `Date`, `URL`, and similar types; functions and circular references are not allowed — and Astro encrypts them in the request.

Good candidates are the small dynamic pieces of an otherwise stable page: a logged-in visitor's avatar, a live stock level, personalised recommendations, or user reviews. The visitor sees the important part immediately, while the personalised pieces fill in around it. If you are deploying Astro to a server or edge platform, the deployment guide in [Deploying Astro Websites to Cloudflare Workers: A Step-by-Step Guide](/blog/deploying-astro-websites-cloudflare-workers-step-by-step-guide) covers the adapter setup that server islands depend on.

## Mixing frameworks and sharing state

Astro is framework-agnostic: official integrations exist for React, Preact, Svelte, Vue, Solid, and Alpine.js, and you can mix several frameworks on the same page because each island is independent. Astro ships each framework's runtime only to the islands that use it, so stick to one framework per site where you can — each additional one adds its own runtime.

Setting up a framework is one command: `npx astro add react` installs `@astrojs/react`, `react`, and `react-dom`, and updates `astro.config.mjs` and `tsconfig.json`. After that, importing a `.jsx` or `.tsx` component into an `.astro` file and adding a directive creates an island.

Isolation has one consequence that surprises developers from single-framework apps: islands do not share context. Each island hydrates as its own independent root, so a React context provider in one island does not reach another, and wrapping an Astro layout in a provider has no effect. Two islands that both need the same thing — a cart count, a theme, a login state — need a different mechanism.

The pattern Astro's own documentation recommends is Nano Stores, a tiny framework-agnostic store library. A store defined once in a shared file can be read and written from React, Vue, Svelte, Solid, and plain JavaScript islands on the same page:

```js
// src/stores/cart.js
import { atom } from "nanostores";

export const cartCount = atom(0);
```

```jsx
// CartBadge.jsx — header island
import { useStore } from "@nanostores/react";
import { cartCount } from "../stores/cart.js";

export default function CartBadge() {
  const count = useStore(cartCount);
  return <span>Cart ({count})</span>;
}
```

```jsx
// AddToCart.jsx — product island
import { cartCount } from "../stores/cart.js";

export default function AddToCart() {
  return (
    <button onClick={() => cartCount.set(cartCount.get() + 1)}>
      Add to cart
    </button>
  );
}
```

Used as `<CartBadge client:load />` in the header and `<AddToCart client:visible />` on the product, the two islands stay in sync through the shared store even though they hydrate at different times. Alternatives exist — Svelte stores, Solid signals, Vue's reactivity API, custom browser events — but Nano Stores is the cleanest option when islands span frameworks.

## When islands are the wrong tool

Islands architecture is a deliberately narrow tool, optimised for content-heavy pages: blogs, documentation, marketing sites, landing pages, and product pages where most of the page is read, not operated. It is not the best fit for every application.

If the page is a highly interactive application — a dashboard with live data, a collaborative editor, a drag-and-drop builder — most of the page is islands, and the overhead of many separate roots and hydration triggers can exceed the cost of a single application that hydrates once. In that case a framework built around a single client tree is the more honest choice, and Astro supports embedding an SPA inside a page for exactly that situation.

The payoff shows up directly in Core Web Vitals: less JavaScript means the largest element paints sooner, a near-empty main thread means interactions respond faster, and complete HTML up front means less layout shift. For the full picture, see [How to Improve Core Web Vitals in Astro Websites](/blog/improve-core-web-vitals-astro-websites), and for organising the content on those fast pages, [Astro Content Collections: A Complete Guide to Managing Blog Content](/blog/astro-content-collections-complete-guide-managing-blog-content).

## Frequently asked questions

### What is the difference between an island and a component?

A component is a reusable piece of UI; an island is a component opted into client-side hydration with a `client:*` directive, or deferred server rendering with `server:defer`. Most components on an Astro page are never islands — they render to static HTML and ship no JavaScript.

### Do Astro islands work with any JavaScript framework?

Astro has official integrations for React, Preact, Svelte, Vue, Solid, and Alpine.js, and you can mix them on the same page. Plain `.astro` components cannot be hydrated, because they have no client runtime; interactivity there comes from a `<script>` tag instead.

### Which client directive should I use by default?

Start with `client:visible` below the fold and `client:idle` near it. Reserve `client:load` for above-the-fold controls that must work at once, `client:media` for screen-size-specific UI, and `client:only` for components that cannot render on the server. If unsure, `client:idle` is the safest middle ground.

### Can islands share state with each other?

Yes, but not through framework context, because each island is an independent root. Use a framework-agnostic store such as Nano Stores, which Astro's documentation recommends, or custom browser events. For closely related components, merging them into one island is often simpler.

### Do islands hurt SEO?

No — they help it, as long as the content is server-rendered: search engines receive the complete HTML, including the HTML inside each island, without running JavaScript. The exception is `client:only`, which leaves the island blank until JavaScript runs, so avoid it for content that needs indexing.
