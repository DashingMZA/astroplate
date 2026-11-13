// Author resolution — the single place that turns a post's `author` /
// `authors` frontmatter strings into author entries.
//
// Resolution order for each name:
//   1. author file id (e.g. frontmatter "John Doe" -> `john-doe.md`)
//   2. legacy fallback: slugified author file `title`
// A name that matches nothing resolves to `{ entry: null, url: null }` and
// is rendered as plain text with NO link (never a link to a 404 such as
// `/authors/admin`) and a single build-time warning per unknown name.
// Names are deduplicated (by resolved entry id, else by slugified name), so
// a name listed in both `author` and `authors` renders once.

import { slugify } from "@/lib/utils/textConverter";
import type { CollectionEntry } from "astro:content";
import { authorUrl, stripIdExtension } from "@/lib/utils/slug";

export interface ResolvedAuthor {
  /** Display name exactly as written in frontmatter. */
  name: string;
  /** The matching author collection entry, or null when unresolvable. */
  entry: CollectionEntry<"authors"> | null;
  /** `/authors/<id>` when resolved, else null (render plain text). */
  url: string | null;
}

// Warn once per unknown name per build, not once per card render.
const warnedMissing = new Set<string>();

/** Names a post claims, in order: `authors` array wins, else `[author]`. */
export function displayAuthorNames(post: {
  data: { author?: string | null; authors?: string[] | null };
}): string[] {
  const raw =
    post.data.authors && post.data.authors.length > 0
      ? post.data.authors
      : [post.data.author ?? "Admin"];
  const names: string[] = [];
  for (const name of raw) {
    const trimmed = (name ?? "").trim();
    if (trimmed && !names.includes(trimmed)) {
      names.push(trimmed);
    }
  }
  return names;
}

export function resolveAuthors(
  names: string[],
  authors: CollectionEntry<"authors">[],
): ResolvedAuthor[] {
  const seen = new Set<string>();
  const resolved: ResolvedAuthor[] = [];
  for (const rawName of names) {
    const name = (rawName ?? "").trim();
    if (!name) {
      continue;
    }
    const key = slugify(name);
    const entry =
      authors.find((a) => stripIdExtension(a.id) === key) ??
      authors.find((a) => slugify(a.data.title) === key) ??
      null;
    // Dedupe by resolved entry id; unresolved names dedupe by slugified name.
    const dedupeKey = entry
      ? `id:${stripIdExtension(entry.id)}`
      : `name:${key}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    if (!entry && !warnedMissing.has(key)) {
      warnedMissing.add(key);
      console.warn(
        `[authors] No author file matches "${name}" (looked for an author id or title slug "${key}"). ` +
          `Rendering the name as plain text with no author-page link.`,
      );
    }
    resolved.push({ name, entry, url: entry ? authorUrl(entry) : null });
  }
  return resolved;
}

/**
 * True when a post belongs to the given author page: any of the post's
 * resolved authors is that author entry. (Legacy display-name matches only
 * count when they resolve to this entry, so a renamed author file cannot
 * silently keep matching by title.)
 */
export function postBelongsToAuthor(
  post: { data: { author?: string | null; authors?: string[] | null } },
  authorEntry: CollectionEntry<"authors">,
  allAuthors: CollectionEntry<"authors">[],
): boolean {
  const authorId = stripIdExtension(authorEntry.id);
  return resolveAuthors(displayAuthorNames(post), allAuthors).some(
    (resolved) =>
      resolved.entry !== null &&
      stripIdExtension(resolved.entry.id) === authorId,
  );
}
