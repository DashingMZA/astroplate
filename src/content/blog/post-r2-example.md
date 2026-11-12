---
title: "Serving Blog Images from R2: A Remote Image Example"
meta_title: "Serving Blog Images from R2: A Remote Image Example"
description: "A demo post showing how Astroplate handles blog images hosted remotely on R2, with a separate social share image for Open Graph."
date: 2022-04-05T05:00:00Z
image: "https://media.csofts.tech/images/r2-example.jpg"
og_image: "https://media.csofts.tech/images/r2-example-og.jpg"
categories: ["Technology"]
author: "John Doe"
tags: ["technology"]
draft: false
---

<!-- Test fixture: demonstrates absolute remote (R2-style) images.
     The `image` and `og_image` above are absolute https:// URLs served from
     media.csoft.tech (R2) instead of local files under public/images/.
     Keep this post published (draft: false) so builds verify remote-image
     handling end to end. -->

This demo post proves that a blog post can use images hosted outside the repository. The hero image above is loaded from an absolute R2 URL instead of a file under `public/images/`, and the social share image is a different absolute URL.

## Why remote images

Hosting images on R2 keeps the repository small and lets the CDN serve media directly. A post only needs the full URL in its frontmatter — no local copy is required.

## What to check

Open this post after a build and confirm the hero image renders, the page metadata uses the separate `og_image` for sharing, and the table of contents above lists both headings on this page.
