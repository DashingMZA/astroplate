// Sitemap configuration — reads the `sitemap` object from
// `src/config/config.json`, applies defaults when the object or individual
// properties are missing, and validates. Invalid configuration fails the
// build with a clear error instead of silently generating wrong files.
//
// The shape follows the existing `feeds` / `llms` objects in config.json:
// a plain JSON object the site owner edits, no code change needed to
// enable/disable a type or rename a file.
import config from "@/config/config.json";
import {
  SITEMAP_TYPE_KEYS,
  type SitemapSettings,
  type SitemapTypeKey,
  type SitemapTypeSettings,
} from "@/lib/seo/sitemap/types";

/** A sitemap filename is a plain `.xml` filename — no directories, no traversal. */
const FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.xml$/;

/** 50 MiB — the sitemap protocol's 50 MB uncompressed limit. */
export const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

/** Defaults for every property; only `videos`/`news`/`products`/`locales`/
// `locations` are off — this project has no such content (no collections,
// routes or data), so enabling them would generate empty sitemaps. */
export const DEFAULT_SITEMAP_SETTINGS: SitemapSettings = {
  enable: true,
  index_filename: "sitemap_index.xml",
  lastmod: true,
  exclude: ["/404"],
  exclude_segments: ["draft", "drafts", "preview", "private"],
  max_urls_per_sitemap: 1000,
  max_bytes: DEFAULT_MAX_BYTES,
  types: {
    pages: { enable: true, filename: "page-sitemap.xml" },
    posts: { enable: true, filename: "post-sitemap.xml" },
    categories: { enable: true, filename: "category-sitemap.xml" },
    tags: { enable: true, filename: "post_tag-sitemap.xml" },
    authors: { enable: true, filename: "author-sitemap.xml" },
    images: { enable: true, filename: "image-sitemap.xml" },
    videos: { enable: false, filename: "video-sitemap.xml" },
    news: { enable: false, filename: "news-sitemap.xml" },
    products: { enable: false, filename: "product-sitemap.xml" },
    locales: { enable: false, filename: "locales-sitemap.xml" },
    locations: { enable: false, filename: "locations-sitemap.xml" },
  },
};

function fail(message: string): never {
  throw new Error(`sitemap config: ${message}`);
}

function asBoolean(value: unknown, name: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    fail(`"${name}" must be a boolean, got ${JSON.stringify(value)}`);
  }
  return value;
}

function asPositiveInt(value: unknown, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    fail(`"${name}" must be a positive integer, got ${JSON.stringify(value)}`);
  }
  return value;
}

function asFilename(value: unknown, name: string, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !FILENAME_RE.test(value)) {
    fail(
      `"${name}" must be a plain .xml filename (letters, digits, ".", "_" or "-", ` +
        `no directories), got ${JSON.stringify(value)}`,
    );
  }
  return value;
}

function asStringArray(
  value: unknown,
  name: string,
  fallback: string[],
): string[] {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(`"${name}" must be an array of strings, got ${JSON.stringify(value)}`);
  }
  return [...value];
}

function resolveTypeSettings(
  raw: unknown,
  key: SitemapTypeKey,
  fallback: SitemapTypeSettings,
): SitemapTypeSettings {
  if (raw === undefined) return { ...fallback };
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    fail(`"types.${key}" must be an object, got ${JSON.stringify(raw)}`);
  }
  const obj = raw as Record<string, unknown>;
  return {
    enable: asBoolean(obj.enable, `types.${key}.enable`, fallback.enable),
    filename: asFilename(
      obj.filename,
      `types.${key}.filename`,
      fallback.filename,
    ),
  };
}

/**
 * Resolve the raw `sitemap` value from config.json into validated
 * settings. `undefined` (no `sitemap` key at all) yields the defaults.
 * Unknown keys are ignored so a future option cannot break old builds.
 */
export function resolveSitemapSettings(raw: unknown): SitemapSettings {
  if (raw === undefined) {
    // Plain-data clone so callers can mutate the result safely.
    return JSON.parse(
      JSON.stringify(DEFAULT_SITEMAP_SETTINGS),
    ) as SitemapSettings;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    fail(`"sitemap" must be an object, got ${JSON.stringify(raw)}`);
  }
  const obj = raw as Record<string, unknown>;
  const defaults = DEFAULT_SITEMAP_SETTINGS;
  const settings: SitemapSettings = {
    enable: asBoolean(obj.enable, "enable", defaults.enable),
    index_filename: asFilename(
      obj.index_filename,
      "index_filename",
      defaults.index_filename,
    ),
    lastmod: asBoolean(obj.lastmod, "lastmod", defaults.lastmod),
    exclude: asStringArray(obj.exclude, "exclude", defaults.exclude),
    exclude_segments: asStringArray(
      obj.exclude_segments,
      "exclude_segments",
      defaults.exclude_segments,
    ),
    max_urls_per_sitemap: asPositiveInt(
      obj.max_urls_per_sitemap,
      "max_urls_per_sitemap",
      defaults.max_urls_per_sitemap,
    ),
    max_bytes: asPositiveInt(obj.max_bytes, "max_bytes", defaults.max_bytes),
    types: Object.fromEntries(
      SITEMAP_TYPE_KEYS.map((key) => [
        key,
        resolveTypeSettings(
          (obj.types as Record<string, unknown> | undefined)?.[key],
          key,
          defaults.types[key],
        ),
      ]),
    ) as Record<SitemapTypeKey, SitemapTypeSettings>,
  };

  // Two files must never share a filename — the index and every type
  // included. A collision would make one file overwrite the other.
  const seen = new Map<string, string>();
  const claim = (filename: string, owner: string) => {
    const prev = seen.get(filename);
    if (prev) {
      fail(
        `duplicate filename "${filename}" — used by both ${prev} and ${owner}. ` +
          `Give each sitemap type (and the index) a unique filename.`,
      );
    }
    seen.set(filename, owner);
  };
  claim(settings.index_filename, "index");
  for (const key of SITEMAP_TYPE_KEYS) {
    claim(settings.types[key].filename, `types.${key}`);
  }

  // A configured filename must never equal a chunk filename of any
  // type: chunks are named `<stem>1.xml`, `<stem>2.xml`, … where
  // `<stem>` is a type filename without `.xml`. Such a collision would
  // make a chunk overwrite (or be overwritten by) the other file.
  const chunkStems = SITEMAP_TYPE_KEYS.map((key) =>
    settings.types[key].filename.replace(/\.xml$/, ""),
  );
  const chunkStemOf = (filename: string): string | null => {
    const match = /^(.+?)(\d+)\.xml$/.exec(filename);
    if (!match) {
      return null;
    }
    return chunkStems.includes(match[1]) ? match[1] : null;
  };
  const checkChunkCollision = (filename: string, owner: string) => {
    const stem = chunkStemOf(filename);
    if (stem) {
      fail(
        `filename "${filename}" (${owner}) collides with a chunk filename ` +
          `of the "${stem}" sitemap type (chunks are named "<stem>1.xml", ` +
          `"<stem>2.xml", ...). Choose a different filename.`,
      );
    }
  };
  checkChunkCollision(settings.index_filename, "index");
  for (const key of SITEMAP_TYPE_KEYS) {
    checkChunkCollision(settings.types[key].filename, `types.${key}`);
  }
  return settings;
}

/** The resolved sitemap settings for this site (from config.json). */
export function getSitemapSettings(): SitemapSettings {
  return resolveSitemapSettings((config as { sitemap?: unknown }).sitemap);
}

/**
 * True when a public pathname must not appear in any sitemap: it matches
 * an `exclude` entry exactly, or one of its path segments is in
 * `exclude_segments`. Mirrors the old @astrojs/sitemap `filter` rules
 * (`/404` + draft/drafts/preview/private segments).
 */
export function isExcludedPath(
  pathname: string,
  settings: SitemapSettings,
): boolean {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const normalised =
    path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  if (settings.exclude.includes(normalised)) {
    return true;
  }
  const segments = normalised.split("/").filter(Boolean);
  return segments.some((segment) =>
    settings.exclude_segments.includes(segment),
  );
}
