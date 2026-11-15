// Sitemap collectors — gather one entry list per sitemap type from the
// Astro Content Collections. The rules live here once, and the engine
// (`index.ts`) + the route only orchestrate:
//
//   - draft, future-dated and `noindex` entries are excluded (the same
//     filter the feeds use in `src/lib/utils/feed-entries.ts`);
//   - posts with an external canonical URL are excluded — their content
//     lives off-site, so it must not appear in this site's sitemap;
//   - URLs come from the same helpers the routers use (`slug.ts`,
//     `authors.ts`, `taxonomyParser.ts`), so a sitemap URL always matches
//     a real generated route;
//   - duplicate public URLs fail the build (same as `checkDuplicateSlugs`
//     in the routes and the old `seoManifest`);
//   - lastmod is `updated ?? lastmod ?? date`, a genuine content date
//     only — never the build date.
//
// The transforms (`*ToEntries`) are pure functions over plain entry
// objects so `tests/sitemap.test.js` can exercise every exclusion rule
// without an Astro build; the thin `collect*` wrappers below only fetch
// the collections and call them. `videos` / `news` / `products` /
// `locales` / `locations` have no collector — this project has no such
// content — and enabling one of them fails the build clearly (see
// `collectAllEntries`).
import { getCollection } from "astro:content";
import config from "@/config/config.json";
import { getSinglePage } from "@/lib/contentParser";
import { isExcludedPath } from "@/lib/seo/sitemap/config";
import type {
  SitemapEntry,
  SitemapSettings,
  SitemapTypeKey,
} from "@/lib/seo/sitemap/types";
import { SITEMAP_TYPE_KEYS } from "@/lib/seo/sitemap/types";
import { getTaxonomy } from "@/lib/taxonomyParser";
import { canonicalFor, isAbsoluteUrl, resolveOgImage } from "@/lib/utils/seo";
import {
  authorUrl,
  checkDuplicateSlugs,
  pageUrl,
  postUrl,
} from "@/lib/utils/slug";

/** The entry shape the pure transforms need (a structural subset of a collection entry). */
export interface SitemapContentEntry {
  id: string;
  data: {
    slug?: string | null;
    draft?: boolean | null;
    noindex?: boolean | null;
    date?: Date | string | null;
    updated?: Date | string | null;
    lastmod?: Date | string | null;
    canonical?: string | null;
    title?: string | null;
    image?: string | null;
    og_image?: string | null;
  };
}

/**
 * Last change of a content entry: `updated` else `lastmod` else `date`.
 * Returns undefined when no valid date exists — the caller omits
 * `<lastmod>` rather than inventing one.
 */
export function contentLastmod(data: {
  updated?: Date | string | null;
  lastmod?: Date | string | null;
  date?: Date | string | null;
}): Date | undefined {
  const value = data.updated ?? data.lastmod ?? data.date;
  if (!value) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

/**
 * True when an entry belongs in the sitemap at all: not a draft, not
 * `noindex`, not future-dated, and not a `-`-prefixed listing stub.
 * (The `-index` files of the about/contact collections are the page
 * itself, so `pagesToEntries` checks those explicitly instead.)
 */
export function isSitemapVisible(
  entry: SitemapContentEntry,
  now: Date,
): boolean {
  if (entry.id.startsWith("-")) {
    return false;
  }
  if (entry.data.draft) {
    return false;
  }
  if (entry.data.noindex) {
    return false;
  }
  const date = entry.data.date;
  if (date && new Date(date) > now) {
    return false;
  }
  return true;
}

/**
 * True when an explicit `canonical` frontmatter value points off-site.
 * Site-relative canonicals (`/blog/x`) and same-origin absolute ones
 * are on-site; anything with a different origin is external.
 */
export function isExternalCanonical(
  canonical: string | null | undefined,
): boolean {
  if (!canonical || !isAbsoluteUrl(canonical)) {
    return false;
  }
  try {
    const base = String(config.site.base_url ?? "").replace(/\/+$/, "");
    return new URL(canonical).origin !== new URL(base).origin;
  } catch {
    // Unparseable canonicals are rejected by schema validation elsewhere;
    // never exclude a page on a guess here.
    return false;
  }
}

function entryLastmod(
  entry: SitemapContentEntry,
  settings: SitemapSettings,
): Date | undefined {
  return settings.lastmod ? contentLastmod(entry.data) : undefined;
}

/** Published blog posts, as sitemap entries. */
export function postsToEntries(
  posts: SitemapContentEntry[],
  settings: SitemapSettings,
  now: Date,
): SitemapEntry[] {
  const visible = posts.filter(
    (post) =>
      isSitemapVisible(post, now) &&
      !isExternalCanonical(post.data.canonical) &&
      !isExcludedPath(postUrl(post), settings),
  );
  checkDuplicateSlugs(visible, postUrl, "blog post");
  return visible.map((post) => {
    const entry: SitemapEntry = { loc: canonicalFor(postUrl(post)) };
    const lastmod = entryLastmod(post, settings);
    if (lastmod) {
      entry.lastmod = lastmod;
    }
    return entry;
  });
}

/** Published author pages, as sitemap entries. */
export function authorsToEntries(
  authors: SitemapContentEntry[],
  settings: SitemapSettings,
  now: Date,
): SitemapEntry[] {
  return authors
    .filter(
      (author) =>
        isSitemapVisible(author, now) &&
        !isExternalCanonical(author.data.canonical) &&
        !isExcludedPath(authorUrl(author), settings),
    )
    .map((author) => {
      const entry: SitemapEntry = { loc: canonicalFor(authorUrl(author)) };
      const lastmod = entryLastmod(author, settings);
      if (lastmod) {
        entry.lastmod = lastmod;
      }
      return entry;
    });
}

/** Category archive pages that actually exist (same source as the routes). */
export function categoriesToEntries(
  categories: string[],
  settings: SitemapSettings,
): SitemapEntry[] {
  return categories
    .filter((slug) => !isExcludedPath(`/categories/${slug}`, settings))
    .map((slug) => ({ loc: canonicalFor(`/categories/${slug}`) }));
}

/** Tag archive pages that actually exist (same source as the routes). */
export function tagsToEntries(
  tags: string[],
  settings: SitemapSettings,
): SitemapEntry[] {
  return tags
    .filter((slug) => !isExcludedPath(`/tags/${slug}`, settings))
    .map((slug) => ({ loc: canonicalFor(`/tags/${slug}`) }));
}

/**
 * One image-sitemap entry per published post that has its own featured
 * image (`og_image` else `image`, same priority as the feeds). The
 * site-default OG image is not a post's image, so it is never emitted.
 */
export function imagesToEntries(
  posts: SitemapContentEntry[],
  settings: SitemapSettings,
  now: Date,
): SitemapEntry[] {
  const visible = posts.filter(
    (post) =>
      isSitemapVisible(post, now) &&
      !isExternalCanonical(post.data.canonical) &&
      !isExcludedPath(postUrl(post), settings),
  );
  checkDuplicateSlugs(visible, postUrl, "blog post");
  const entries: SitemapEntry[] = [];
  for (const post of visible) {
    const { url, isPageImage } = resolveOgImage(post.data);
    if (!isPageImage) {
      continue;
    }
    const entry: SitemapEntry = {
      loc: canonicalFor(postUrl(post)),
      images: [
        {
          loc: url,
          ...(post.data.title ? { title: post.data.title } : {}),
        },
      ],
    };
    const lastmod = entryLastmod(post, settings);
    if (lastmod) {
      entry.lastmod = lastmod;
    }
    entries.push(entry);
  }
  return entries;
}

/** Input for the page sitemap: every route the page type must cover. */
export interface PageCollectionInput {
  /** Regular standalone pages (`pages` collection). */
  regularPages: SitemapContentEntry[];
  /** `-index` entry of the about collection, when it exists. */
  aboutIndex?: SitemapContentEntry | null;
  /** `-index` entry of the contact collection, when it exists. */
  contactIndex?: SitemapContentEntry | null;
  /** `-index` entry of the blog collection, when it exists. */
  blogIndex?: SitemapContentEntry | null;
  /** `-index` entry of the authors collection, when it exists. */
  authorsIndex?: SitemapContentEntry | null;
  /** Total blog pagination pages (page 1 is `/blog` itself). */
  blogTotalPages: number;
}

/**
 * Homepage + index/listing pages + standalone pages. The `-index`
 * entries of about/contact carry their own draft/noindex/canonical
 * frontmatter (their routes redirect to /404 when draft, exactly like
 * the old manifest treated them); the blog/authors indexes are gated
 * on draft only, matching their routes, which do not apply `noindex`.
 */
export function pagesToEntries(
  input: PageCollectionInput,
  settings: SitemapSettings,
  now: Date,
): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  const add = (
    path: string,
    data?: {
      date?: Date | string | null;
      updated?: Date | string | null;
      lastmod?: Date | string | null;
    },
  ) => {
    if (isExcludedPath(path, settings)) {
      return;
    }
    const entry: SitemapEntry = { loc: canonicalFor(path) };
    if (data) {
      const lastmod = entryLastmod({ id: "", data: { ...data } }, settings);
      if (lastmod) {
        entry.lastmod = lastmod;
      }
    }
    entries.push(entry);
  };

  // Homepage — always generated; the homepage collection has no dates.
  add("/");
  // Listing index pages (their routes have no draft gate).
  add("/categories");
  add("/tags");

  // Regular standalone pages (custom slugs respected).
  const visiblePages = input.regularPages.filter(
    (page) =>
      isSitemapVisible(page, now) && !isExternalCanonical(page.data.canonical),
  );
  checkDuplicateSlugs(visiblePages, pageUrl, "page");
  for (const page of visiblePages) {
    add(pageUrl(page), page.data);
  }

  // Single-page collections, gated like their routes.
  const single = (index: SitemapContentEntry | null | undefined) =>
    index &&
    !index.data.draft &&
    !index.data.noindex &&
    !isExternalCanonical(index.data.canonical) &&
    (!index.data.date || new Date(index.data.date) <= now);
  if (single(input.aboutIndex)) {
    add("/about", input.aboutIndex!.data);
  }
  if (single(input.contactIndex)) {
    add("/contact", input.contactIndex!.data);
  }
  if (input.blogIndex && !input.blogIndex.data.draft) {
    add("/blog", input.blogIndex.data);
  }
  if (input.authorsIndex && !input.authorsIndex.data.draft) {
    add("/authors", input.authorsIndex.data);
  }

  // Blog pagination pages 2..N (page 1 is /blog itself).
  for (let page = 2; page <= input.blogTotalPages; page++) {
    add(`/blog/page/${page}`);
  }
  return entries;
}

// ─── Async collectors (Astro build only) ───────────────────────────────────

async function collectPosts(
  settings: SitemapSettings,
  now: Date,
): Promise<SitemapEntry[]> {
  const posts = await getCollection("blog", ({ data, id }) =>
    isSitemapVisible({ id, data }, now),
  );
  return postsToEntries(posts, settings, now);
}

async function collectPages(
  settings: SitemapSettings,
  now: Date,
): Promise<SitemapEntry[]> {
  const [
    regularPages,
    aboutEntries,
    contactEntries,
    blogEntries,
    authorsEntries,
    blogPosts,
  ] = await Promise.all([
    getSinglePage("pages"),
    getCollection("about"),
    getCollection("contact"),
    getCollection("blog"),
    getCollection("authors"),
    getSinglePage("blog"),
  ]);
  const findIndex = (
    entries: SitemapContentEntry[],
  ): SitemapContentEntry | null =>
    entries.find((entry) => entry.id === "-index") ?? null;
  // Same page size the blog pagination route uses.
  const configured = Number(config.settings?.pagination ?? 2);
  const perPage =
    Number.isInteger(configured) && configured > 0 ? configured : 2;
  const blogTotalPages = Math.max(1, Math.ceil(blogPosts.length / perPage));
  return pagesToEntries(
    {
      regularPages,
      aboutIndex: findIndex(aboutEntries),
      contactIndex: findIndex(contactEntries),
      blogIndex: findIndex(blogEntries),
      authorsIndex: findIndex(authorsEntries),
      blogTotalPages,
    },
    settings,
    now,
  );
}

async function collectCategories(
  settings: SitemapSettings,
): Promise<SitemapEntry[]> {
  const categories = await getTaxonomy("blog", "categories");
  return categoriesToEntries(categories, settings);
}

async function collectTags(settings: SitemapSettings): Promise<SitemapEntry[]> {
  const tags = await getTaxonomy("blog", "tags");
  return tagsToEntries(tags, settings);
}

async function collectAuthors(
  settings: SitemapSettings,
  now: Date,
): Promise<SitemapEntry[]> {
  const authors = await getSinglePage("authors");
  return authorsToEntries(authors, settings, now);
}

async function collectImages(
  settings: SitemapSettings,
  now: Date,
): Promise<SitemapEntry[]> {
  const posts = await getCollection("blog", ({ data, id }) =>
    isSitemapVisible({ id, data }, now),
  );
  return imagesToEntries(posts, settings, now);
}

/** One collector per type. `null` means the type has no content in this project. */
export type SitemapCollector = (
  settings: SitemapSettings,
  now: Date,
) => Promise<SitemapEntry[]>;

export const COLLECTORS: Record<SitemapTypeKey, SitemapCollector | null> = {
  pages: collectPages,
  posts: collectPosts,
  categories: collectCategories,
  tags: collectTags,
  authors: collectAuthors,
  images: collectImages,
  videos: null,
  news: null,
  products: null,
  locales: null,
  locations: null,
};

/**
 * Collect every enabled type. Disabled types are skipped entirely —
 * never collected, never generated. An enabled type with no collector
 * fails the build clearly instead of generating an empty sitemap.
 */
export async function collectAllEntries(
  settings: SitemapSettings,
  now: Date = new Date(),
): Promise<Partial<Record<SitemapTypeKey, SitemapEntry[]>>> {
  const collected: Partial<Record<SitemapTypeKey, SitemapEntry[]>> = {};
  for (const key of SITEMAP_TYPE_KEYS) {
    if (!settings.types[key].enable) {
      continue;
    }
    const collector = COLLECTORS[key];
    if (!collector) {
      throw new Error(
        `sitemap: type "${key}" is enabled in config.json but this project ` +
          `has no ${key} content and no collector for it. Set ` +
          `"sitemap.types.${key}.enable" to false, or add a collector in ` +
          `src/lib/seo/sitemap/collectors.ts.`,
      );
    }
    collected[key] = await collector(settings, now);
  }
  return collected;
}
