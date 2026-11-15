// Types for the config-driven sitemap system
// (`src/lib/seo/sitemap/`). One engine, one route — the sitemap types
// below are data, not separate generators: `collectors.ts` gathers one
// entry list per type, `index.ts` chunks and serializes them, and the
// single dynamic route `src/pages/[sitemap].xml.ts` serves the files.

/** Every sitemap type the engine knows about. */
export type SitemapTypeKey =
  | "pages"
  | "posts"
  | "categories"
  | "tags"
  | "authors"
  | "images"
  | "videos"
  | "news"
  | "products"
  | "locales"
  | "locations";

/** Fixed order: the order types are collected and listed in the index. */
export const SITEMAP_TYPE_KEYS: readonly SitemapTypeKey[] = [
  "pages",
  "posts",
  "categories",
  "tags",
  "authors",
  "images",
  "videos",
  "news",
  "products",
  "locales",
  "locations",
];

/** Enable/disable + output filename for one sitemap type. */
export interface SitemapTypeSettings {
  enable: boolean;
  filename: string;
}

/** The resolved `sitemap` object from `src/config/config.json`. */
export interface SitemapSettings {
  /** Master switch: false generates no sitemap files at all. */
  enable: boolean;
  /** Filename of the sitemap index (default `sitemap-index.xml`). */
  index_filename: string;
  /** Emit `<lastmod>` when a genuine content date exists. */
  lastmod: boolean;
  /** Exact pathnames to exclude (e.g. `/404`). */
  exclude: string[];
  /** Any URL whose path segments include one of these is excluded. */
  exclude_segments: string[];
  /** Maximum URLs per sitemap file (protocol cap: 50,000; default 1000). */
  max_urls_per_sitemap: number;
  /** Maximum uncompressed bytes per sitemap file (protocol: 50 MB). */
  max_bytes: number;
  /** Per-type settings, keyed by type. */
  types: Record<SitemapTypeKey, SitemapTypeSettings>;
}

/** One image in a sitemap `<image:image>` block. */
export interface SitemapImage {
  /** Absolute image URL. */
  loc: string;
  /** Image title (the page title for post images). */
  title?: string;
}

/** One `<url>` entry in a sitemap file. */
export interface SitemapEntry {
  /** Absolute canonical URL of the page. */
  loc: string;
  /** Last change (`updated` else `lastmod` else `date`); never the build date. */
  lastmod?: Date;
  /** Images on the page (only the images sitemap uses these). */
  images?: SitemapImage[];
}

/** One `<sitemap>` entry in the sitemap index. */
export interface SitemapIndexEntry {
  /** Absolute URL of the generated sitemap file. */
  loc: string;
  /** Newest genuine lastmod inside that file, when any entry has one. */
  lastmod?: Date;
}
