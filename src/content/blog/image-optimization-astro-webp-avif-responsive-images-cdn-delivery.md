---
title: "Image Optimization for Astro: WebP, AVIF, Responsive Images and CDN Delivery"
meta_title: "Image Optimization for Astro: WebP & AVIF Guide"
description: "Learn image optimization for Astro: WebP and AVIF formats, responsive srcset images, lazy loading, and CDN delivery that cut page weight and speed up LCP."
date: 2026-11-14T05:00:00Z
image: "/images/image-optimization-astro-webp-avif-responsive-images-cdn-delivery-feature.jpg"
og_image: "/images/image-optimization-astro-webp-avif-responsive-images-cdn-delivery-og.jpg"
og_title: "Image Optimization for Astro: WebP, AVIF & CDN"
og_description: "A practical Astro guide to WebP and AVIF, responsive images, lazy loading, and CDN delivery — smaller files, faster pages, better Core Web Vitals."
categories: ["Technology"]
author: "John Doe"
tags: ["astro", "images", "performance"]
draft: false
---

Images are usually the heaviest part of a web page. A single uncompressed hero photograph can outweigh the HTML, CSS, and JavaScript combined. Image optimization for Astro is therefore one of the highest-value performance jobs on an Astro site, and Astro does most of it at build time, before a single visitor arrives.

This guide covers choosing between WebP, AVIF, JPEG, and PNG; using Astro's `<Image />` and `<Picture />` components; serving responsive images; controlling loading and priority; and deciding when a CDN should take over delivery.

## Why images dominate page weight

Photographs and screenshots usually account for the largest share of a page's weight. Serve a 4,000-pixel-wide camera original in an 800-pixel-wide column and the browser still downloads the whole file, decodes it, and shrinks it to fit. That waste shows up in loading time, mobile data use, and Largest Contentful Paint (LCP) when the image is the largest element in the viewport.

Astro is a good fit because most of this happens at build time: a prerendered page's local images are transformed into hashed, correctly sized files with width and height baked into the markup. There is no runtime image server to run. The pipeline only sees images in `src/` that Astro can import, or remote images from authorized domains. Files in `public/` are copied as-is and skip optimization — right for a favicon, wrong for content images.

Before changing anything, establish a baseline: note the transferred size of the largest images in the Network panel, then run Lighthouse and note the LCP element. After each change, check whether the delivered bytes actually went down.

## Choosing the right image format

WebP is the sensible default for most photographs and illustrations. It supports lossy and lossless compression, transparency, and animation, and every modern browser decodes it. Astro's `<Image />` outputs WebP by default, so doing nothing already gets you a modern format — and for a typical photograph WebP is noticeably smaller than an equivalent-quality JPEG.

AVIF goes further. Based on the AV1 video codec, it usually produces smaller files than WebP at similar visual quality, especially for photographs with fine detail and gradients. The catch is encoding cost: AVIF takes longer to encode, so converting every image to AVIF slows the build. Browser support is broad in current browsers — Chrome, Firefox, Edge, and Safari 16 and later — but older browsers do not decode it, so AVIF should always be served with a fallback. That is what Astro's `<Picture />` is for.

JPEG still has two uses: compatibility with very old software, and images served through a path Astro cannot transform. For new work, there is rarely a reason to choose JPEG over WebP. PNG is for lossless quality and sharp edges — logos, icons, diagrams, screenshots — but it is large for photographs, so never use it for a photo. SVG is for vector graphics, because it scales to any size. Animated GIFs are almost always wrong: a short MP4 or WebM video is far smaller.

The practical rule: WebP by default, AVIF for the large images where the saving matters most, PNG for sharp graphics, SVG for logos and icons. One format, well sized and well compressed, beats three formats generated for an image nobody looks at closely.

Quality is the other half of the choice. Astro's `quality` accepts a number from 0 to 100 or a preset — `low`, `mid`, `high`, or `max`. Higher is not always better: beyond a point, extra quality buys almost no visible improvement and costs real bytes. Start in the 70s or 80s for WebP photographs, a little lower for AVIF. Export the same image at two or three settings, view them at their displayed size, and choose the lowest setting where you cannot see a difference. Be more conservative with diagrams and screenshots, where artefacts show up first on sharp edges and lettering.

## How Astro optimizes images

Astro's image support lives in `astro:assets`, and it starts with where the file lives. Local images in `src/` — in `src/assets/`, say, or alongside the content that uses them — can be imported, transformed, and bundled. Astro knows their intrinsic dimensions at build time, so it stamps `width` and `height` onto the rendered `<img>` and reserves the right amount of layout space before the image arrives. That reservation prevents layout shift: the browser does not reflow the page when the image loads.

The `<Image />` component is the workhorse. Import it from `astro:assets`, import the image, and render it with a required `alt`:

```astro
---
import { Image } from "astro:assets";
import hero from "../assets/hero.jpg";
---

<Image src={hero} alt="A mountain lake at sunrise." width={1200} height={675} />
```

Astro transforms the image at build time into an optimized WebP file with a hashed filename; the HTML includes `width`, `height`, `decoding="async"`, and `loading="lazy"` by default. `<Picture />` renders a `<picture>` element with one `<source>` per format and a fallback `<img>`, so the browser takes the first format it can decode — list AVIF first, then WebP. Use it for the hero and large images; use `<Image />` elsewhere so the build stays fast. Sharp is the default image service (Astroplate sets `image: { service: sharp() }`); where Sharp cannot run, `passthroughImageService()` performs no transformation but still enforces `alt` text and dimensions.

```astro
---
import { Picture } from "astro:assets";
import hero from "../assets/hero.jpg";
---

<Picture
  src={hero}
  formats={["avif", "webp"]}
  alt="A mountain lake at sunrise."
  width={1200}
  height={675}
/>
```

For images not rendered directly in HTML, `getImage()` from `astro:assets` generates the same optimized file and returns its URL — for a background image in CSS, say. It can only be used on the server, so call it in frontmatter and pass the resulting `src` to the client.

Remote images need explicit authorization: Astro only optimizes remote images from domains in `image.domains` or patterns in `image.remotePatterns`. Others are displayed but not optimized, and need explicit `width` and `height` (or `inferSize`). Images in `public/` behave the same way: they can be rendered through `<Image />`, but they are served as-is.

In Markdown, standard `![alt](src)` syntax works for local images in `src/` and for remote images, and those images are processed and optimized. `<Image />` and `<Picture />` are not available in plain `.md` files; for their props in Markdown content, use MDX. On this site, the blog hero is handled by the post layout, which is why the frontmatter `image` field points at a file in `public/images/`.

![The Astro image pipeline: a source image in src/ is imported, transformed by Sharp at build time, and emitted as hashed WebP and AVIF files with width and height in the markup.](/images/image-optimization-astro-webp-avif-responsive-images-cdn-delivery-diagram-1.png)

## Responsive images: srcset, sizes, and layout

A responsive image is a set of files at different widths, with hints that let the browser choose the smallest that fits. Without them, a phone on a slow connection downloads the same 1,600-pixel hero as a desktop monitor, even though it displays it at 400 pixels wide. With them, the phone downloads the 640-pixel version and the desktop downloads the larger one.

The two attributes are `srcset` and `sizes`. `srcset` lists candidate files with their widths, for example `hero-640.webp 640w, hero-1200.webp 1200w`. `sizes` tells the browser how wide the image will be displayed at each viewport width, for example `(max-width: 768px) 100vw, 1200px` — full viewport width on small screens, 1,200 pixels otherwise. The browser combines those hints with the viewport size and device pixel ratio and picks a candidate. A wrong `sizes` value is the most common reason the browser picks an oversized file, so `sizes` must describe your actual CSS layout, not a guess.

Astro can generate both attributes. The `layout` prop on `<Image />` or `<Picture />`, added in Astro 5.10, generates `srcset` and `sizes` automatically and applies the styles the image needs to resize correctly. The three layouts are: `constrained`, which scales down to fit its container but never grows beyond its `width` — right for most content images, cards, and covers; `full-width`, which always fills its container — right for heroes and full-bleed banners; and `fixed`, which stays at its `width` and `height` and generates 1x and 2x versions — right for avatars, logos, and icons. A site-wide default can be set with `image.layout` in config, applying to components and Markdown images alike.

```astro
<Image
  src={cover}
  alt="A designer reviewing a website layout."
  width={1200}
  height={675}
  layout="constrained"
/>
```

For exact control — a three-column grid, for example — pass explicit `widths` and `sizes`:

```astro
<Image
  src={cover}
  alt="A designer reviewing a website layout."
  width={640}
  height={360}
  widths={[320, 480, 640, 960]}
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
/>
```

The `sizes` value mirrors the grid: full width on a phone, half the viewport on a tablet, a third on a desktop. If the CSS changes, `sizes` has to change with it. For fixed-size images such as avatars, `densities` is the alternative: `densities={[1, 2]}` generates 1x and 2x versions for standard and retina screens. You cannot combine `widths` with `densities`, or `densities` with `layout` — pick the mechanism that matches the image: widths for fluid images, densities for fixed ones.

Art direction — a different crop per breakpoint, via `<source>` elements with `media` queries — is a separate case. Most images only need different widths of the same crop; a second crop doubles the files you must produce and check.

![How the browser picks a responsive image: srcset lists candidate widths, sizes describes the displayed width at each breakpoint, and the browser combines them with viewport size and pixel density to choose the smallest fitting file.](/images/image-optimization-astro-webp-avif-responsive-images-cdn-delivery-diagram-2.png)

## Loading, priority, and layout stability

When an image loads matters almost as much as how big it is. Native lazy loading, `loading="lazy"`, defers an image until the visitor scrolls near it — the right default for images below the fold, such as article photos further down the page or gallery thumbnails. Astro's `<Image />` applies it by default. If the visitor never scrolls, a lazy image never loads, saving data as well as time.

The one image you must not lazy-load is the hero. If the hero is the page's Largest Contentful Paint element, lazy-loading it delays exactly the metric you are trying to improve. Web.dev's guidance is blunt: never lazy-load your LCP image, because it always adds unnecessary load delay. Give the hero `loading="eager"` instead, and in Astro use the `priority` prop, which loads it eagerly with high fetch priority:

```astro
<Image
  src={hero}
  alt="A mountain lake at sunrise."
  width={1200}
  height={675}
  layout="full-width"
  priority
/>
```

Only one image per page should get that treatment; marking several as high priority dilutes the signal. The `fetchpriority="high"` attribute is the underlying HTML mechanism, and `priority` is Astro's way of setting it with eager loading. For a hero discovered late — inserted by CSS or JavaScript — a `<link rel="preload">` with `as="image"` can help the browser find it sooner, but preload is a targeted tool, not a default.

Layout stability is the third concern. Cumulative Layout Shift (CLS) measures how much visible content moves as the page loads, and an image without reserved space is a classic cause: the text loads, the image arrives, and everything below it jumps down. The fix is to give the browser the image's aspect ratio before it downloads the file, which is what `width` and `height` attributes do. Astro infers both from the imported file. Do not set dimensions that disagree with the file's real aspect ratio: the browser will reserve the wrong shape.

## Sizing workflow: start from a good master

Work out the largest size each image will ever be displayed at, and size the master to cover that plus a margin for high-density screens. A content image displayed at 800 pixels wide needs a source of at most 1,600 pixels for a 2x retina display; a 4,000-pixel original adds nothing visible. For screenshots and diagrams, export at the displayed size or at 2x, and prefer PNG or SVG over a lossy format so text stays crisp. If a diagram is drawn in vector form, ship the SVG itself. Descriptive filenames and alt text also help image search, covered in [technical SEO for Astro websites](/blog/technical-seo-astro-websites-sitemaps-canonicals-structured-data).

## CDN delivery and caching

Build-time optimization and CDN delivery solve different problems and work best together. Astro's build produces small, correctly sized files; a CDN puts those files close to the visitor and serves them fast. Serve the whole built site through a CDN: hashed image filenames can be cached for a long time with `immutable`, while HTML gets a short lifetime, so updates are picked up quickly.

An image CDN adds on-the-fly transformation. Services such as Cloudflare Image Resizing, Cloudinary, and imgix store one original and generate any size or format on demand from URL parameters. Cloudflare's version uses a `/cdn-cgi/image/` prefix with options such as `width=800,format=auto,quality=75`, where `format=auto` serves AVIF to browsers that advertise it and WebP to the rest. The result is cached at the edge, so the transform is paid for once. That is useful when variants are not known at build time — user uploads, a large catalogue, or editors adding images without a build step.

Decide deliberately. If Astro already generates every variant you need, an image CDN buys you little and adds a second system to pay for. If your images come from users, a CMS, or an external store, an image CDN is the right tool: configure `passthroughImageService()` and let the CDN own resizing and format negotiation. Either way, do not run two optimizers in series, because each lossy pass degrades the image. And check your actual `Cache-Control` headers with `curl -I`: `no-store` on images defeats the CDN entirely.

## Measuring what changed

Optimization without measurement is guesswork. Start with the Network panel: load the page, filter to images, and compare transferred bytes and dimensions against your baseline. A responsive image set should show the phone-sized file on a phone viewport and the larger file on desktop, not the same file on both.

Then run Lighthouse and read the image opportunities it reports: improperly sized images, modern formats, and offscreen images that are not lazy-loaded. Each names a concrete file and fix. Pay particular attention to the LCP element: if it is an image, that image is the single most valuable file on the page. [How to improve Core Web Vitals in Astro websites](/blog/improve-core-web-vitals-astro-websites) covers LCP, CLS, and Interaction to Next Paint in more depth.

## A repeatable image workflow

A workflow that works for most Astro sites looks like this. Keep masters in `src/assets/` at the largest size you will ever display, and never edit the generated files in `dist/`. Render content images with `<Image />` and a `constrained` layout, heroes with `<Picture />` in AVIF and WebP at `full-width` with `priority`, and fixed-size images with `densities`. Write `sizes` that match your CSS, or let the layout generate it and check the output. Give every image descriptive alt text, using `alt=""` only for images that are genuinely decorative. Lazy-load everything below the fold and nothing above it. Serve the built site through a CDN with long cache lifetimes on hashed image files, and add an image CDN only when your images are not known at build time.

That workflow is deliberately boring: no clever tricks, no settings only one person understands. Image optimization is a habit, not a project. The sites that stay fast are the ones where every image goes through the same pipeline, every time, checked with real measurements. When image rules need to live in shared components rather than being repeated on every page, codify them — a shared image component with your defaults baked in is part of [building a scalable design system with Astro and Tailwind CSS](/blog/build-scalable-website-design-system-astro-tailwind-css).

## Frequently asked questions

### Should I use WebP or AVIF for my Astro site?

Use WebP as the default and AVIF for large images where the saving matters most. WebP is supported everywhere modern and is what `<Image />` outputs by default; AVIF is usually smaller but slower to encode. Serve AVIF through `<Picture />` with a WebP fallback.

### Why are my Astro images not being optimized?

Usually location: images in `public/` are copied as-is and never optimized, and neither are remote images from domains you have not authorized in `image.domains` or `image.remotePatterns`. Move content images into `src/` and import them, or authorize the domain. A plain `<img>` tag also skips optimization — use `<Image />` or `<Picture />`.

### How do I stop phones downloading desktop-sized images?

Serve responsive images with `srcset` and `sizes`, generated by Astro via the `layout` prop or explicit `widths`. The `sizes` value must describe your actual layout, or the browser will download a file larger than it needs. Check the Network panel at a phone viewport and confirm the smaller candidate loads.

### Should the hero image be lazy-loaded?

No. The hero is usually the Largest Contentful Paint element, and lazy-loading it delays that metric. Load it eagerly with high fetch priority — in Astro, the `priority` prop — and lazy-load the images below the fold instead. Only one image per page should be high priority.

### Do I still need a CDN if Astro optimizes images at build time?

For most static Astro sites, a plain CDN in front of your host is enough. An image CDN that transforms on demand is worth adding when image sizes are not known at build time, such as user uploads or CMS images. If you use one, let it own transformation and configure Astro's passthrough image service.
