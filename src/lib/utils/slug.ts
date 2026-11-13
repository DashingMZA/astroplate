// Canonical public-slug helpers — the SINGLE source of truth for post and
// page URLs. Every router, link, canonical, RSS item, sitemap entry, search
// record and JSON-LD URL must go through here so a custom `slug` frontmatter
// value and the filename-derived id can never disagree.
//
// Rules:
// - `data.slug`, when set, wins over the filename-derived id.
// - Normalisation: trim, lowercase, spaces/punctuation runs become one
//   hyphen, duplicate hyphens collapse, leading/trailing hyphens and
//   slashes are stripped. Unicode letters/digits are PRESERVED (they are
//   valid in URL path segments; browsers percent-encode them on request).
// - Nested paths are supported: `guides/my-post` stays nested.
// - A bare `blog/my-guide` custom slug is forgiven for blog posts: the
//   leading `blog/` segment is stripped (the old search index only worked
//   when authors wrote the prefix by accident).
// - An empty/whitespace/punctuation-only custom slug falls back to the id.
// - Duplicate public slugs are a build error (see checkDuplicateSlugs).

export interface Sluggable {
  id: string;
  data: { slug?: string | null };
}

/** Strip a trailing `.md` / `.mdx` extension from a collection entry id. */
export function stripIdExtension(id: string): string {
  return id.replace(/\.(?:md|mdx)$/i, "");
}

/**
 * Normalise one slug (or one `/`-separated path of slug segments).
 * Pure and dependency-free so plain-node scripts and tests can import it.
 */
export function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .split("/")
    .map((segment) =>
      segment
        // Any run of characters that are not letters/digits becomes one hyphen.
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .join("/");
}

/**
 * The public slug for a blog post or a regular page: the normalised custom
 * `slug` when set (and non-empty after normalisation), else the
 * filename-derived id.
 */
export function publicSlug(entry: Sluggable): string {
  const custom = entry.data.slug ? normalizeSlug(entry.data.slug) : "";
  if (custom) {
    return custom;
  }
  return normalizeSlug(stripIdExtension(entry.id));
}

/**
 * The public slug for a blog post. Identical to publicSlug except a leading
 * `blog/` segment in a custom slug is stripped — the post URL already
 * carries the `/blog/` prefix (see postUrl).
 */
export function postSlug(post: Sluggable): string {
  return publicSlug(post).replace(/^blog\//, "");
}

/** Public URL path of a blog post, e.g. `/blog/my-guide`. */
export function postUrl(post: Sluggable): string {
  return `/blog/${postSlug(post)}`;
}

/** Public slug for a regular page (same as publicSlug; named for symmetry with postSlug). */
export function pageSlug(page: Sluggable): string {
  return publicSlug(page);
}

/** Public URL path of a regular page, e.g. `/privacy-policy`. */
export function pageUrl(page: Sluggable): string {
  return `/${publicSlug(page)}`;
}

/** Public URL path of an author page, keyed by the author file id. */
export function authorUrl(author: { id: string }): string {
  return `/authors/${normalizeSlug(stripIdExtension(author.id))}`;
}

/**
 * Throw a build error when two or more entries resolve to the same public
 * URL. `urlFor` picks the URL each entry resolves to (postUrl / pageUrl).
 * The error lists every conflicting slug with the file ids behind it so the
 * author can fix the frontmatter instead of silently shipping a collision
 * (Astro would otherwise build only one of the two pages).
 */
export function checkDuplicateSlugs(
  entries: Sluggable[],
  urlFor: (entry: Sluggable) => string,
  label: string,
): void {
  const byUrl = new Map<string, string[]>();
  for (const entry of entries) {
    const url = urlFor(entry);
    const ids = byUrl.get(url) ?? [];
    ids.push(stripIdExtension(entry.id));
    byUrl.set(url, ids);
  }
  const conflicts = [...byUrl.entries()].filter(([, ids]) => ids.length > 1);
  if (conflicts.length === 0) {
    return;
  }
  const lines = conflicts.map(
    ([url, ids]) => `  ${url} <- ${ids.sort().join(", ")}`,
  );
  throw new Error(
    `Duplicate ${label} URL${conflicts.length > 1 ? "s" : ""} — two or more entries resolve to the same public URL. ` +
      `Give each entry a unique custom \`slug\` (or rename the file):\n${lines.join("\n")}`,
  );
}
