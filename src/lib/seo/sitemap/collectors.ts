// Sitemap collectors — gather one entry list per sitemap type from the
// Astro Content Collections. The rules live here once, and the engine
// (`index.ts`) + the route only orchestrate:
//
//   - draft, future-dated and noindex entries are excluded — "noindex"
//     is the RESOLVED robotsindex (frontmatter value, else the config
//     default for the page type; see `src/lib/utils/robots.ts`), the
//     same rule the feeds use in `src/lib/utils/feed-entries.ts`.
//     Noindex URLs never appear in a sitemap: authors, tags,
//     categories and blog archives are noindex by config default, so
//     their sitemaps are empty and no file is generated for them;
//   - posts with an external canonical URL are excluded — their content
//     lives off-site, so it must not appear in this site's sitemap;
//   - URLs come from the same helpers the routers use (`slug.ts`,
//     `authors.ts`, `taxonomyParser.ts`), so a sitemap URL always matches
//     a real generated route;
//   - duplicate public URLs fail the build (same as `checkDuplicateSlugs`
//     in the routes and the old `seoManifest`);
//   - lastmod is `dateModified ?? datePublished` (authors: `dateModified
//     ?? dateCreated`, since author profiles have no publication date) —
//     a genuine content date only, never the build date.
//   - post entries carry their images (`image`, `ogImage`, body refs)
//     and page entries carry their page image (homepage banner, about
//     banner, …) as `<image:image>` blocks — `<image:loc>` only, no
//     title. Only images that resolve to a real file under `public/`
//     are emitted (a build-time existence check); a stale reference
//     can never ship. The images sitemap itself is untouched: one OG
//     image per post, as before.
//
// The transforms (`*ToEntries`) are pure functions over plain entry
// objects so `tests/sitemap.test.js` can exercise every exclusion rule
// without an Astro build; the thin `collect*` wrappers below only fetch
// the collections and call them. `videos` / `news` / `products` /
// `locales` / `locations` have no collector — this project has no such
// content — and enabling one of them fails the build clearly (see
// `collectAllEntries`).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCollection } from "astro:content";
import config from "@/config/config.json";
import { getSinglePage } from "@/lib/contentParser";
import { isExcludedPath } from "@/lib/seo/sitemap/config";
import type {
  SitemapEntry,
  SitemapImage,
  SitemapSettings,
  SitemapTypeKey,
} from "@/lib/seo/sitemap/types";
import { SITEMAP_TYPE_KEYS } from "@/lib/seo/sitemap/types";
import { getTaxonomy } from "@/lib/taxonomyParser";
import {
  authorLastmod,
  contentLastmod,
  publicationDate,
  resolveContentDates,
} from "@/lib/utils/dates";
import {
  absoluteUrl,
  canonicalFor,
  isAbsoluteUrl,
  resolveOgImage,
} from "@/lib/utils/seo";
import {
  authorUrl,
  checkDuplicateSlugs,
  pageUrl,
  postUrl,
} from "@/lib/utils/slug";
import { resolveRobotsIndex, type RobotsPageType } from "@/lib/utils/robots";

/** The entry shape the pure transforms need (a structural subset of a collection entry). */
export interface SitemapContentEntry {
  id: string;
  /** Raw Markdown/MDX body (posts) — image refs are extracted from it. */
  body?: string | null;
  data: {
    CustomSlug?: string | null;
    draft?: boolean | null;
    robotsindex?: boolean | null;
    dateCreated?: Date | string | null;
    datePublished?: Date | string | null;
    dateModified?: Date | string | null;
    canonical?: string | null;
    title?: string | null;
    image?: string | null;
    ogImage?: string | null;
  };
}

/**
 * Last change of a content entry: `dateModified` else `datePublished`.
 * Returns undefined when no valid date exists — the caller omits
 * `<lastmod>` rather than inventing one. (Re-exported from the
 * centralized date utility so tests import it from here as before.)
 */
export { contentLastmod, authorLastmod };

/**
 * True when an entry belongs in the sitemap at all: not a draft, not
 * noindex, not future-dated, and not a `-`-prefixed listing stub.
 * "Noindex" is the RESOLVED robotsindex for `type` — the frontmatter
 * value when set, else the config default for that page type — so a
 * page that is noindex by config (authors, tags, categories, blog
 * archives by default) never appears in a sitemap, even without an
 * explicit frontmatter value. (The `-index` files of the
 * about/contact collections are the page itself, so `pagesToEntries`
 * checks those explicitly instead.)
 */
export function isSitemapVisible(
  entry: SitemapContentEntry,
  now: Date,
  type: RobotsPageType,
): boolean {
  if (entry.id.startsWith("-")) {
    return false;
  }
  if (entry.data.draft) {
    return false;
  }
  if (!resolveRobotsIndex(type, entry.data.robotsindex)) {
    return false;
  }
  // Future-dated content stays out until its publication date
  // (creation only as a fallback) is reached.
  const date = publicationDate(resolveContentDates(entry.data));
  if (date && date > now) {
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
  resolver: (data: {
    dateCreated?: Date | string | null;
    datePublished?: Date | string | null;
    dateModified?: Date | string | null;
  }) => Date | undefined = contentLastmod,
): Date | undefined {
  return settings.lastmod ? resolver(entry.data) : undefined;
}

/** Image file extensions accepted for body image references. */
const IMAGE_EXTENSIONS = new Set([
  "webp",
  "avif",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "svg",
]);

/**
 * Raw Markdown with fenced code blocks removed. An image reference
 * inside a code sample is not an image on the page (it is text showing
 * how to write one), so it must not end up in the sitemap.
 */
export function stripFencedCodeBlocks(body: string): string {
  const lines = body.split("\n");
  const kept: string[] = [];
  let inFence = false;
  let fenceChar = "";
  for (const line of lines) {
    const match = /^\s*(`{3,}|~{3,})/.exec(line);
    if (match) {
      const marker = match[1];
      if (!inFence) {
        inFence = true;
        fenceChar = marker[0];
      } else if (marker[0] === fenceChar) {
        inFence = false;
        fenceChar = "";
      }
      continue;
    }
    if (!inFence) {
      kept.push(line);
    }
  }
  return kept.join("\n");
}

/**
 * Site-relative image paths referenced in a post body: Markdown
 * `![alt](path)` refs and `<img src="path">` tags, in document order,
 * deduplicated. Only site-local absolute paths (`/images/...`) are
 * returned — external URLs, relative paths, data URIs and non-image
 * targets are not page images.
 */
export function extractBodyImagePaths(body: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | undefined) => {
    if (!raw) {
      return;
    }
    const clean = raw.trim();
    if (
      !clean.startsWith("/") ||
      clean.startsWith("//") ||
      clean.toLowerCase().startsWith("data:")
    ) {
      return;
    }
    const pathOnly = clean.split(/[?#]/, 1)[0];
    const ext = pathOnly.split(".").pop()?.toLowerCase() ?? "";
    if (!IMAGE_EXTENSIONS.has(ext)) {
      return;
    }
    if (!seen.has(pathOnly)) {
      seen.add(pathOnly);
      found.push(pathOnly);
    }
  };
  const text = stripFencedCodeBlocks(body);
  const refPattern =
    /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)|<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  for (const match of text.matchAll(refPattern)) {
    add(match[1] ?? match[2]);
  }
  return found;
}

/**
 * Candidate image URLs for a post, absolute and deduplicated:
 * frontmatter `image` (featured), `ogImage`, then the images
 * referenced in the body, in document order. No existence check here —
 * the caller filters (see `postsToEntries`).
 */
export function postImageUrls(post: SitemapContentEntry): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (!value) {
      return;
    }
    const url = absoluteUrl(value);
    if (!seen.has(url)) {
      seen.add(url);
      found.push(url);
    }
  };
  add(post.data.image);
  add(post.data.ogImage);
  for (const pathOnly of extractBodyImagePaths(post.body ?? "")) {
    add(pathOnly);
  }
  return found;
}

/**
 * True when a site URL or site-relative path resolves to a real file
 * under `public/` — a build-time check (the sitemap is generated
 * during `astro build`, never at request time). External URLs,
 * protocol-relative URLs and paths escaping `public/` are never
 * "found", so a stale or invented image reference can never ship.
 * Follows the same candidates as `localImageDimensions` in rss.ts.
 */
export function isPublicFile(pathnameOrUrl: string): boolean {
  const baseUrl = String(config.site.base_url ?? "").replace(/\/+$/, "");
  const basePathRaw = String(config.site.base_path ?? "/");
  const basePath =
    basePathRaw === "/" ? "" : `/${basePathRaw.replace(/^\/+|\/+$/g, "")}`;
  const prefix = `${baseUrl}${basePath}`;
  let pathname: string | null = null;
  if (prefix && pathnameOrUrl.startsWith(`${prefix}/`)) {
    pathname = pathnameOrUrl.slice(prefix.length);
  } else if (pathnameOrUrl.startsWith("/") && !pathnameOrUrl.startsWith("//")) {
    pathname = pathnameOrUrl;
  }
  if (!pathname) {
    return false;
  }
  let clean: string;
  try {
    clean = decodeURIComponent(pathname.split(/[?#]/, 1)[0]);
  } catch {
    return false;
  }
  if (clean.split("/").includes("..")) {
    return false;
  }
  const candidates = [
    path.join(process.cwd(), "public", clean),
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "..",
      "public",
      clean,
    ),
  ];
  return candidates.some((file) => {
    try {
      return fs.existsSync(file) && fs.statSync(file).isFile();
    } catch {
      return false;
    }
  });
}

/**
 * Published blog posts, as sitemap entries — each with its images
 * (`<image:loc>` only, no title). `imageExists` gates the images: in
 * production it is `isPublicFile` (only real files under `public/`
 * ship); tests pass a stub or the default, which keeps everything.
 */
export function postsToEntries(
  posts: SitemapContentEntry[],
  settings: SitemapSettings,
  now: Date,
  imageExists: (url: string) => boolean = () => true,
): SitemapEntry[] {
  const visible = posts.filter(
    (post) =>
      isSitemapVisible(post, now, "blogPosts") &&
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
    const images = postImageUrls(post)
      .filter((url) => imageExists(url))
      .map((loc) => ({ loc }));
    if (images.length > 0) {
      entry.images = images;
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
        isSitemapVisible(author, now, "authors") &&
        !isExternalCanonical(author.data.canonical) &&
        !isExcludedPath(authorUrl(author), settings),
    )
    .map((author) => {
      const entry: SitemapEntry = { loc: canonicalFor(authorUrl(author)) };
      // Author profiles have no publication date: lastmod is
      // `dateModified ?? dateCreated`.
      const lastmod = entryLastmod(author, settings, authorLastmod);
      if (lastmod) {
        entry.lastmod = lastmod;
      }
      return entry;
    });
}

/** Category archive pages that actually exist (same source as the routes).
 * Noindex by config default, so this returns no entries unless the
 * config default for categories is flipped to index. */
export function categoriesToEntries(
  categories: string[],
  settings: SitemapSettings,
): SitemapEntry[] {
  if (!resolveRobotsIndex("categories")) {
    return [];
  }
  return categories
    .filter((slug) => !isExcludedPath(`/categories/${slug}`, settings))
    .map((slug) => ({ loc: canonicalFor(`/categories/${slug}`) }));
}

/** Tag archive pages that actually exist (same source as the routes).
 * Noindex by config default, so this returns no entries unless the
 * config default for tags is flipped to index. */
export function tagsToEntries(
  tags: string[],
  settings: SitemapSettings,
): SitemapEntry[] {
  if (!resolveRobotsIndex("tags")) {
    return [];
  }
  return tags
    .filter((slug) => !isExcludedPath(`/tags/${slug}`, settings))
    .map((slug) => ({ loc: canonicalFor(`/tags/${slug}`) }));
}

/**
 * One image-sitemap entry per published post that has its own featured
 * image (`ogImage` else `image`, same priority as the feeds). The
 * site-default OG image is not a post's image, so it is never emitted.
 */
export function imagesToEntries(
  posts: SitemapContentEntry[],
  settings: SitemapSettings,
  now: Date,
): SitemapEntry[] {
  const visible = posts.filter(
    (post) =>
      isSitemapVisible(post, now, "blogPosts") &&
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
  /** Homepage banner image (`banner.image`), shown on `/`. */
  homepageBannerImage?: string | null;
}

/**
 * Homepage + index/listing pages + standalone pages. Every entry is
 * gated on its RESOLVED robotsindex (frontmatter, else the config
 * default for its page type) — a noindex URL never enters the sitemap.
 * The `-index` entries of about/contact carry their own
 * draft/robotsindex/canonical frontmatter (their routes redirect to
 * /404 when draft, exactly like the old manifest treated them); the
 * blog/authors indexes and the blog pagination are gated on the
 * resolved config defaults (`blogArchives` / `authors`), which are
 * noindex by default, so `/blog`, `/blog/page/N` and `/authors` stay
 * out of the sitemap unless the config flips them to index.
 * Page entries carry their page image when they have one (homepage
 * banner on `/`, the about/contact/blog/authors `-index` image on
 * their routes, a regular page's `image` frontmatter) — `<image:loc>`
 * only, no title. Listing and pagination pages have no image.
 * `imageExists` gates the images (see `postsToEntries`).
 */
export function pagesToEntries(
  input: PageCollectionInput,
  settings: SitemapSettings,
  now: Date,
  imageExists: (url: string) => boolean = () => true,
): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  const add = (
    path: string,
    data?: {
      dateCreated?: Date | string | null;
      datePublished?: Date | string | null;
      dateModified?: Date | string | null;
    },
    imagePaths?: (string | null | undefined)[],
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
    const seen = new Set<string>();
    const images: SitemapImage[] = [];
    for (const value of imagePaths ?? []) {
      if (!value) {
        continue;
      }
      const url = absoluteUrl(value);
      if (seen.has(url) || !imageExists(url)) {
        continue;
      }
      seen.add(url);
      images.push({ loc: url });
    }
    if (images.length > 0) {
      entry.images = images;
    }
    entries.push(entry);
  };

  // Homepage — always generated; the homepage collection has no dates.
  add("/", undefined, [input.homepageBannerImage]);
  // Listing index pages — only when their type is indexable by config.
  if (resolveRobotsIndex("categories")) {
    add("/categories");
  }
  if (resolveRobotsIndex("tags")) {
    add("/tags");
  }

  // Regular standalone pages (custom slugs respected).
  const visiblePages = input.regularPages.filter(
    (page) =>
      isSitemapVisible(page, now, "pages") &&
      !isExternalCanonical(page.data.canonical),
  );
  checkDuplicateSlugs(visiblePages, pageUrl, "page");
  for (const page of visiblePages) {
    add(pageUrl(page), page.data, [page.data.image]);
  }

  // Single-page collections, gated like their routes.
  const single = (index: SitemapContentEntry | null | undefined) => {
    if (!index) return false;
    if (index.data.draft) return false;
    if (!resolveRobotsIndex("pages", index.data.robotsindex)) return false;
    if (isExternalCanonical(index.data.canonical)) return false;
    const pub = publicationDate(resolveContentDates(index.data));
    return !pub || pub <= now;
  };
  if (single(input.aboutIndex)) {
    add("/about", input.aboutIndex!.data, [input.aboutIndex!.data.image]);
  }
  if (single(input.contactIndex)) {
    add("/contact", input.contactIndex!.data, [input.contactIndex!.data.image]);
  }
  if (
    input.blogIndex &&
    !input.blogIndex.data.draft &&
    resolveRobotsIndex("blogArchives", input.blogIndex.data.robotsindex)
  ) {
    add("/blog", input.blogIndex.data, [input.blogIndex.data.image]);
  }
  if (
    input.authorsIndex &&
    !input.authorsIndex.data.draft &&
    resolveRobotsIndex("authors", input.authorsIndex.data.robotsindex)
  ) {
    add("/authors", input.authorsIndex.data, [input.authorsIndex.data.image]);
  }

  // Blog pagination pages 2..N (page 1 is /blog itself) — only when
  // blog archives are indexable (noindex by default); the blog
  // `-index` frontmatter governs the whole archive section.
  if (resolveRobotsIndex("blogArchives", input.blogIndex?.data.robotsindex)) {
    for (let page = 2; page <= input.blogTotalPages; page++) {
      add(`/blog/page/${page}`);
    }
  }
  return entries;
}

// ─── Async collectors (Astro build only) ───────────────────────────────────

async function collectPosts(
  settings: SitemapSettings,
  now: Date,
): Promise<SitemapEntry[]> {
  const posts = await getCollection("blog", ({ data, id }) =>
    isSitemapVisible({ id, data }, now, "blogPosts"),
  );
  return postsToEntries(posts, settings, now, isPublicFile);
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
    homepageEntries,
  ] = await Promise.all([
    getSinglePage("pages"),
    getCollection("about"),
    getCollection("contact"),
    getCollection("blog"),
    getCollection("authors"),
    getSinglePage("blog"),
    getCollection("homepage"),
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
  const homepageIndex = homepageEntries.find((entry) => entry.id === "-index");
  return pagesToEntries(
    {
      regularPages,
      aboutIndex: findIndex(aboutEntries),
      contactIndex: findIndex(contactEntries),
      blogIndex: findIndex(blogEntries),
      authorsIndex: findIndex(authorsEntries),
      blogTotalPages,
      homepageBannerImage: homepageIndex?.data.banner?.image ?? null,
    },
    settings,
    now,
    isPublicFile,
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
    isSitemapVisible({ id, data }, now, "blogPosts"),
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
