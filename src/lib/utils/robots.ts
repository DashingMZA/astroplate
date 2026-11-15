import config from "@/config/config.json";

// Robots indexing — the single place that decides whether a page emits
// the index or the noindex robots meta.
//
// Resolution order:
//   1. explicit frontmatter `robotsindex` (true = index, false = noindex)
//   2. config default for the page type (`robots.index` in config.json)
//   3. true (index) when neither is set.
//
// The config default controls the robots meta tag AND sitemap / feed
// exclusion alike: both key off the RESOLVED value (frontmatter,
// else the config default for the page type). A type that is noindex
// by config (authors, tags, categories, blog archives) therefore
// emits the noindex meta and stays out of the sitemap and feeds,
// even without an explicit frontmatter value.

export type RobotsPageType =
  "pages" | "blogPosts" | "authors" | "tags" | "categories" | "blogArchives";

const INDEX_DEFAULTS: Record<RobotsPageType, boolean> = {
  pages: true,
  blogPosts: true,
  authors: false,
  tags: false,
  categories: false,
  blogArchives: false,
};

function configIndexDefault(type: RobotsPageType): boolean {
  const robots = (config as { robots?: { index?: Record<string, unknown> } })
    .robots;
  const value = robots?.index?.[type];
  return typeof value === "boolean" ? value : INDEX_DEFAULTS[type];
}

export function resolveRobotsIndex(
  type: RobotsPageType,
  frontmatter?: boolean | null,
): boolean {
  if (typeof frontmatter === "boolean") {
    return frontmatter;
  }
  return configIndexDefault(type);
}

/** The exact robots meta content for an indexed / non-indexed page. */
export function robotsMetaContent(indexed: boolean): string {
  const action = indexed ? "index" : "noindex";
  return `${action}, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1`;
}
