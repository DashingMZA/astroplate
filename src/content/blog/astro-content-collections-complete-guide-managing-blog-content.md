---
title: "Astro Content Collections: A Complete Guide to Managing Blog Content"
meta_title: "Astro Content Collections: Complete Guide"
description: "Learn how Astro Content Collections work: define schemas with Zod, load content with glob, query with getCollection, and render blog posts with type safety."
date: 2026-11-14T05:00:00Z
image: "/images/blog/astro-content-collections-complete-guide-managing-blog-content-feature.jpg"
og_image: "/images/blog/astro-content-collections-complete-guide-managing-blog-content-og.jpg"
og_title: "Astro Content Collections: Complete Guide"
og_description: "Define, validate, query and render blog content in Astro with type-safe content collections — loaders, Zod schemas, references and routes explained."
categories: ["Astro"]
author: "Muhammad Zaheer Ahmad"
tags: ["astro", "content-collections", "blogging"]
draft: false
---

A blog that lives in a folder of Markdown files is easy to start and easy to break. One post is missing a date, another spells a tag differently, a third forgets its description, and nothing complains until a reader — or a search engine — finds the gap. Astro Content Collections fix that problem at the source: they turn a folder of files into a typed, validated, queryable content API, so a mistake in frontmatter becomes a build error instead of a broken page.

This guide explains how content collections work in Astro 7, from defining a collection and writing a Zod schema to querying entries, rendering them, and generating routes.

## What Are Astro Content Collections?

A content collection is a named group of entries that share the same shape: blog posts, documentation pages, product descriptions, recipes, or team profiles. The entries can live in local files — Markdown, MDX, JSON, YAML, or TOML — or be fetched from a remote source such as a CMS or API. Either way, Astro loads them, validates them against a schema you define, and exposes them through typed query functions.

Collections give you three things a loose folder of Markdown files does not. First, **validation**: every entry is checked against your schema at build time, and a missing title or mistyped date fails the build with an error naming the file and the field. Second, **type safety**: Astro generates TypeScript types from the schema, so your editor autocompletes frontmatter fields and `post.data.title` is typed as a string everywhere you use it. Third, **a single query API**: whether the content comes from local files or a remote API, you read it the same way — `getCollection()`, `getEntry()`, and `render()` — so the source can change later without rewriting every page.

Astro has offered collections since version 2, but the API changed substantially in Astro 5 with the Content Layer. In the current API, collections are defined in `src/content.config.ts`, each one has an explicit `loader`, and rendering uses a `render(entry)` function from `astro:content`. Older tutorials that use `src/content/config.ts`, a `type: "content"` field, or `entry.render()` describe the legacy API — treat them as migration sources, not patterns to copy.

Define a collection when your content has a repeated shape. A blog is the classic case: every post has a title, a date, a description, tags, and a body. Documentation, changelogs, and product catalogues are the same kind of problem. If you have only two or three one-off pages, a collection adds ceremony without benefit — but the moment you copy the same frontmatter fields by hand, it will pay for itself.

## How Content Collections Work

A collection has three moving parts: a loader, a schema, and the query API. The loader fetches raw entries from wherever they live. The schema validates each entry's data and gives it a TypeScript type. Astro stores the validated entries in a data store during the build, and your pages query that store with `getCollection()` or `getEntry()`. For Markdown and MDX entries, `render()` turns an entry's body into a component you can place in a layout, and returns its headings as well — useful for a table of contents.

![How Astro content collections work: a loader fetches files, a Zod schema validates them, Astro stores the entries, and pages query them with getCollection and render](/images/blog/astro-content-collections-complete-guide-managing-blog-content-diagram-1.png)

Two details catch people out. First, `getCollection()` does not guarantee the order of the entries it returns, so always sort the result yourself, usually by date, before rendering a list. Second, an entry's identifier is `id`, derived from the file path relative to the loader's base directory, without the extension. In Astro 5 and later, `entry.slug` no longer exists.

## Defining a Collection: Loaders and Schemas

All build-time collections are defined in one file, `src/content.config.ts` at the root of `src/`. Each collection is created with `defineCollection()`, given a `loader` and a `schema`, and exported in a single `collections` object — its key is the name you query by.

```ts
// src/content.config.ts
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
```

Note the imports: loaders come from `astro/loaders`, and Zod from `astro/zod` — importing `z` from `astro:content` still works in Astro 7 but is deprecated and scheduled for removal in Astro 8.

### The glob() loader

`glob()` is the loader for folders of files. It creates one entry per matching file, and accepts Markdown, MDX, Markdoc, JSON, YAML, and TOML files. The `pattern` is a glob relative to `base`; the entry `id` is the file path relative to `base`, without the extension. A file at `src/content/blog/guides/first-post.md` gets the id `guides/first-post`. Patterns can exclude files: `**/[^_]*.{md,mdx}` matches Markdown and MDX in any subfolder but skips files whose names start with an underscore — a handy way to keep a draft out of the collection. This site uses the simpler pattern `**/*.{md,mdx}` and excludes files starting with `-` (such as `-index.md`) from its feeds instead.

### The file() loader

`file()` reads a single file and turns each item in it into an entry. It understands JSON, YAML, and TOML by extension, and accepts a custom `parser` for formats it cannot parse by default. The file must contain an array of objects with a unique `id` field, or an object whose keys are the ids. This loader suits lists that belong in one file: team members, FAQs, locations, or site navigation.

For example, `loader: file("src/data/team.json")` with a schema of `name`, `role`, and an optional `bio` turns one JSON file into a `team` collection.

### Custom loaders

For remote content, there is no prebuilt loader. Define a loader as a plain async function that returns an array of entries, for a simple CMS or API fetch, or as a loader object with a `name` and a `load(context)` method that writes to `context.store` and validates with `context.parseData()`. The object form suits caching and incremental updates: pass a digest per entry and Astro only re-processes the ones that changed.

### Writing a schema with Zod

The schema is the contract for every entry. Astro 7 ships Zod 4, so the full Zod API is available. A few patterns cover most blogs: `z.string()` for a required field; `z.coerce.date()` for dates, which accepts a YAML string such as `2026-11-14` and normalises it to a `Date` (plain `z.date()` would reject the string); `.optional()` for a field that may be absent, such as `updated`; `.default([])` for a field with a fallback, which keeps old posts valid when you add a new field; and `z.enum(["guide", "note", "news"])` for a fixed set of allowed values. Require the fields that affect rendering and SEO — title, description, date — and make the rest optional or defaulted.

One more schema feature matters for blogs with images. To validate and optimise a local image referenced in frontmatter, pass a function to `schema` and use the `image()` helper from its context:

```ts
const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      cover: image(),
      coverAlt: z.string(),
    }),
});
```

In the Markdown file, the value is a path relative to that file, such as `cover: ./cover.jpg`. Astro checks that the file exists at build time and returns an image object for the `<Image />` component from `astro:assets`; a missing file fails the build instead of producing a broken image. This only applies to images in `src/` — images in `public/` are copied as-is and bypass optimisation, which is why this site's schema uses plain strings for `image` and `og_image`.

## Querying Collections: getCollection, getEntry, and getEntries

Pages import the query functions from `astro:content`. `getCollection()` returns every entry in a collection, optionally filtered; `getEntry()` returns one entry by collection and id; `getEntries()` resolves an array of references in one call.

```astro
---
import { getCollection } from "astro:content";

const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort(
  (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
);
---

<ul>
  {posts.map((post) => (
    <li>
      <a href={`/blog/${post.id}`}>{post.data.title}</a>
      <time>{post.data.date.toISOString().slice(0, 10)}</time>
    </li>
  ))}
</ul>
```

The filter callback receives each entry and can inspect its `id` or its `data` (the validated frontmatter). Filtering drafts here is the standard pattern: the schema allows `draft: true`, and the listing page simply excludes those entries. `getEntry()` returns `undefined` when the id does not exist, so check the result before using it.

Each entry has the same shape: `entry.id` is the identifier derived from the file path, `entry.data` is the validated frontmatter typed from your schema, and `entry.body` holds the raw Markdown or MDX source. Sort at the point of use, explicitly every time, since `getCollection()` makes no ordering promise.

## Rendering Entries and Building Routes

Collection entries do not automatically become pages. A dynamic route turns entries into URLs: a file at `src/pages/blog/[id].astro` with a `getStaticPaths()` function that maps each entry to a route, passing the entry through `props` so the page body does not fetch it a second time.

```astro
---
// src/pages/blog/[id].astro
import { getCollection, render } from "astro:content";

export async function getStaticPaths() {
  const posts = await getCollection("blog");
  return posts.map((post) => ({
    params: { id: post.id },
    props: { post },
  }));
}

const { post } = Astro.props;
const { Content, headings } = await render(post);
---

<article>
  <h1>{post.data.title}</h1>
  <Content />
</article>
```

`render()` returns a `Content` component for the entry body, plus `headings` — the list of headings in the document, which is what a table of contents is built from. For MDX entries, you can also pass a `components` prop to `<Content>` to map Markdown elements to your own components. Passing the entry through `props` is worth doing deliberately: fetching it again in the page body with `getEntry()` doubles the queries.

Astroplate, the theme this site is built on, uses this pattern: its blog collection in `src/content.config.ts` uses the `glob()` loader over `src/content/blog/*.md`, with a schema covering `title`, `description`, `date`, `image`, `og_image`, `categories`, `tags`, `author`, and `draft`. Slugs come from filenames, so this article's file becomes `/blog/astro-content-collections-complete-guide-managing-blog-content`, and the same collection feeds the blog index, the post pages, and the feeds.

## References Between Collections

Collections can point at each other, and Astro validates the link at build time. The `reference()` helper, from `astro:content`, declares that a field holds the id of an entry in another collection:

```ts
import { defineCollection, reference } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    author: reference("authors"),
    related: z.array(reference("blog")).default([]),
  }),
});
```

In frontmatter you write only the entry id, for example `author: john-doe`. Astro stores it as a `{ collection: "authors", id: "john-doe" }` object, and a typo in the id fails the build instead of rendering a blank byline. A collection can also reference itself, which is what `related` does.

References are not resolved for you. In a page, call `getEntry()` with the reference object to load the full entry, or `getEntries()` for an array — `getEntry()` returns `undefined` for a missing target:

```astro
---
import { getEntry, getEntries, render } from "astro:content";

const author = await getEntry(post.data.author);
const related = await getEntries(post.data.related);
const { Content } = await render(post);
---

<p>By {author?.data.name ?? "Unknown author"}</p>
<Content />
```

Use `reference()` instead of matching ids by hand whenever one collection logically belongs to another — posts to authors, docs to categories. Plain strings are fine for free-form values such as tags. For more on how the pieces fit into a fast site, see [how Astro Islands architecture and partial hydration work](/blog/astro-islands-architecture-explained-partial-hydration-works).

## Markdown vs MDX vs Data Collections

The loader decides the format, and the format decides what you can do in the body. **Markdown (`.md`)** is the default for writing, with whatever remark and rehype plugins the project configures — this site adds a table of contents, collapsible sections, math with KaTeX, and Shiki syntax highlighting. It suits prose whose layout the template handles. **MDX (`.mdx`)** adds components to Markdown: import a component and use it inline for callouts, interactive demos, or tabs. MDX requires the `@astrojs/mdx` integration and a slightly heavier build, so use it where components genuinely help and keep plain Markdown everywhere else.

**Data collections** hold structured data rather than prose: JSON, YAML, or TOML files loaded with `glob()` or `file()`. A data entry has `id` and `data` but no `body` and nothing to render — you read the fields and render them with components. Use data collections for lists of records rather than documents: navigation, FAQs, pricing tiers, or a directory of tools. A practical rule: if the entry is mostly words, it is a content collection; if it is mostly fields, it is a data collection.

## Live Collections: When Build-Time Is Not Enough

Build-time collections are the right default for a blog: posts change when you deploy, and a static build is fast, cacheable, and cheap to serve. But some data changes too often for a rebuild — live prices, inventory, or a CMS editors update daily. For that case, Astro offers live content collections, defined with `defineLiveCollection()` in `src/live.config.ts` and queried with `getLiveCollection()` and `getLiveEntry()` on on-demand pages. They fetch at request time and return a `{ entries, error }` result instead of throwing, so the page can handle a failed fetch gracefully. The trade-off is real: every request pays the cost of fetching, and the page cannot be served as a static file. The official docs recommend build-time collections whenever possible; for a blog, live collections are rarely needed.

## Common Mistakes and How to Fix Them

Most errors fall into a handful of patterns. **"Frontmatter does not match collection schema"** names the file and the field: a required field is missing, a value has the wrong type, or a field is present that the schema does not define. A schema rejects unknown fields, so a typo in a field name is a build error, not a silently ignored value. **"`post.slug` is undefined"** means you are using the pre-Astro 5 identifier; use `post.id` instead. **"`entry.render()` is not a function"** means you need the `render(entry)` function from `astro:content`. **Collections in the wrong file** — the config lives at `src/content.config.ts`, not the legacy `src/content/config.ts`. **Unsorted lists** — `getCollection()` makes no ordering promise, so sort by date explicitly. **Drafts in production** — the `draft` flag does nothing on its own; pages, sitemaps, and feeds must filter it out, as this site's feed pipeline does. The feed format matters too — see [RSS vs Atom vs JSON Feed: which format your website should support](/blog/rss-vs-atom-vs-json-feed-which-format-should-website-support). **Images that break the build** — with `image()`, a frontmatter path is resolved relative to the Markdown file, and a missing file fails the build.

## A Practical Workflow: From New Post to Published Page

Publishing a post is a short, repeatable sequence. First, add the file — `src/content/blog/my-new-post.md` — with frontmatter matching the schema. Second, let the build validate it; a schema error here is the system working. Third, check the listing and the page: the blog index picks the post up through `getCollection()`, and the dynamic route generates its page through `getStaticPaths()`, with no routing code changes needed. Fourth, check the outputs that read the same collection — the sitemap, feeds, and search index all derive from the same entries, and on this site they are generated automatically. Fifth, mind the SEO fields: the description, image, and Open Graph fields are what search engines and social platforms display, so keep them specific to the post. For the full picture, see [technical SEO for Astro websites: sitemaps, canonicals and structured data](/blog/technical-seo-astro-websites-sitemaps-canonicals-structured-data).

![Querying and rendering a collection: getCollection lists entries, getEntry loads one, render turns its body into a component, and getStaticPaths maps entries to pages](/images/blog/astro-content-collections-complete-guide-managing-blog-content-diagram-2.png)

## Frequently asked questions

### Do I need a schema, or can I skip it?

You can — the schema is optional. But skipping it gives up build-time validation and TypeScript types, the two things that make collections worth using.

### Can one collection mix Markdown and JSON files?

Yes — a `glob()` pattern such as `**/*.{md,mdx,json,yaml}` loads all of them into one collection. In practice, mixing prose and data in one collection is confusing, so prefer a content collection for documents and a separate data collection for records, linked with `reference()` when they relate.

### How do I keep drafts out of the live site?

Set `draft: true` in frontmatter and filter it out wherever entries are listed — the blog index, tag and category pages, the sitemap, and the feeds. The flag does nothing until your queries respect it.

### What is the difference between content collections and the Content Layer?

Content collections are the feature — typed, validated groups of content. The Content Layer is the API behind them in Astro 5 and later: loaders fetch entries, a data store caches them, and the query functions read from that store.

### Should I use a headless CMS instead of files in a collection?

It depends on who writes the content and how often it changes. Files suit developers and technical writers, with changes shipping in deploys. A headless CMS suits non-technical editors who need a visual editor and publishing workflow. The two are not mutually exclusive: a custom loader can pull CMS content into a collection, giving editors their CMS and developers the same typed `getCollection()` API.

Content collections reward a small upfront investment — one config file, one schema, one dynamic route — with a blog that stays consistent as it grows. Define the shape of your content once, let the build enforce it, and spend your time writing posts instead of debugging missing fields.

---

**References**

- Astro Docs, "Content collections" — https://docs.astro.build/en/guides/content-collections/
- Astro Docs, "Content Loader API" — https://docs.astro.build/en/reference/content-loader-reference/
