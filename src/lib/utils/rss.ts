// Pure helpers for the RSS feed (`src/pages/rss.xml.ts`). Everything here
// is unit-tested in `tests/rss.test.js`; the endpoint itself only
// orchestrates (collections, rendering, container) and is covered by
// marker tests, because `astro:content` / `astro/container` cannot run
// under plain `node --test`.
import path from "node:path";
import { fileURLToPath } from "node:url";
import sanitizeHtml from "sanitize-html";
import sharp from "sharp";
import config from "@/config/config.json";
import { absoluteUrl, resolveOgImage } from "@/lib/utils/seo";
import {
  lastChangeDate,
  publicationDate,
  resolveContentDates,
} from "@/lib/utils/dates";

/** Escape a value interpolated into raw `customData` XML. */
export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * RSS `<language>` from the site locale/language, e.g. `en_US` -> `en-us`,
 * `fr` -> `fr`. Falls back to `en` when nothing is configured.
 */
export function toRssLanguage(
  locale?: string | null,
  language?: string | null,
): string {
  const raw = (locale ?? language ?? "en").trim();
  return raw.replace(/_/g, "-").toLowerCase() || "en";
}

/**
 * BCP 47 language tag from the site locale/language, e.g. `en_US` ->
 * `en-US`, `fr` -> `fr`. Unlike `toRssLanguage`, the region subtag keeps
 * its case — Atom `xml:lang` and JSON Feed `language` are BCP 47 tags.
 */
export function toBcp47(
  locale?: string | null,
  language?: string | null,
): string {
  const raw = (locale ?? language ?? "en").trim();
  return raw.replace(/_/g, "-") || "en";
}
export function mediaMimeType(url: string): string | null {
  const clean = url.split(/[?#]/, 1)[0];
  const ext = clean.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "avif":
      return "image/avif";
    case "svg":
      return "image/svg+xml";
    default:
      return null;
  }
}

/**
 * Media RSS tags for a post's own featured image (`ogImage` else
 * `image`, same priority as `resolveOgImage`). Returns "" when the post
 * has no own image — the site-default OG image is not a post's featured
 * image, so it is never emitted here. `dimensions` (when known, e.g.
 * from `localImageDimensions`) adds width/height to both tags; unknown
 * dimensions are omitted, never invented.
 */
export function mediaTags(
  input: {
    ogImage?: string | null;
    image?: string | null;
  },
  dimensions?: { width: number; height: number } | null,
): string {
  const { url, isPageImage } = resolveOgImage(input);
  if (!isPageImage) {
    return "";
  }
  const type = mediaMimeType(url);
  const dims =
    dimensions && dimensions.width && dimensions.height
      ? ` width="${dimensions.width}" height="${dimensions.height}"`
      : "";
  const content = type
    ? `<media:content url="${escapeXml(url)}" medium="image" type="${type}"${dims} />`
    : `<media:content url="${escapeXml(url)}" medium="image"${dims} />`;
  return `${content}\n<media:thumbnail url="${escapeXml(url)}"${dims} />`;
}

/**
 * Dublin Core creator tags for author display names. RSS 2.0 `<author>`
 * is an email address, so it is deliberately NOT emitted here: author
 * emails in a public feed are harvested by scrapers, and the display
 * name is already carried by `dc:creator` (emitting both duplicates the
 * author). Names are trimmed and XML-escaped; several authors each get
 * a tag.
 */
export function dcCreatorTags(names: string[]): string {
  return names
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => `<dc:creator>${escapeXml(name)}</dc:creator>`)
    .join("\n");
}

/**
 * Newest change across posts (`dateModified` else `datePublished`) as
 * a Date, so rebuilds do not make readers think the feed changed.
 * Returns undefined when no post carries a date — the caller omits
 * `lastBuildDate` / `<updated>` instead of substituting the build
 * time. (Previously this fell back to build time; that leaked a
 * fabricated timestamp into every feed on dateless content.)
 */
export function latestChangeDate(
  posts: {
    data: {
      dateCreated?: Date | string | null;
      datePublished?: Date | string | null;
      dateModified?: Date | string | null;
    };
  }[],
): Date | undefined {
  let latest = 0;
  for (const post of posts) {
    const changed = lastChangeDate(resolveContentDates(post.data));
    if (!changed) {
      continue;
    }
    const time = changed.valueOf();
    if (time > latest) {
      latest = time;
    }
  }
  return latest > 0 ? new Date(latest) : undefined;
}

/**
 * Feed order: newest first, undated posts last, and posts sharing a
 * date ordered by id so the order is stable across builds (four demo
 * posts share one timestamp). Publication date is the sort key
 * (creation only as a fallback).
 */
export function sortFeedPosts<
  T extends {
    id: string;
    data: {
      dateCreated?: Date | string | null;
      datePublished?: Date | string | null;
    };
  },
>(posts: T[]): T[] {
  return [...posts].sort((a, b) => {
    const aTime = publicationDate(resolveContentDates(a.data))?.valueOf() ?? 0;
    const bTime = publicationDate(resolveContentDates(b.data))?.valueOf() ?? 0;
    return bTime - aTime || a.id.localeCompare(b.id);
  });
}

/**
 * Pixel dimensions of a local image for `media:thumbnail` /
 * `media:content` width/height. Accepts the image's absolute site URL
 * (as returned by `resolveOgImage`) or a site-relative path; the file
 * is read from `public/`. Returns null for remote URLs,
 * protocol-relative URLs and unreadable files — dimensions are never
 * invented, they are omitted when unknown.
 */
export async function localImageDimensions(
  url: string,
): Promise<{ width: number; height: number } | null> {
  const baseUrl = String(config.site.base_url ?? "").replace(/\/+$/, "");
  const basePathRaw = String(config.site.base_path ?? "/");
  const basePath =
    basePathRaw === "/" ? "" : `/${basePathRaw.replace(/^\/+|\/+$/g, "")}`;
  const prefix = `${baseUrl}${basePath}`;
  let pathname: string | null = null;
  if (prefix && url.startsWith(`${prefix}/`)) {
    pathname = url.slice(prefix.length);
  } else if (url.startsWith("/") && !url.startsWith("//")) {
    pathname = url;
  }
  if (!pathname) {
    return null;
  }
  const clean = decodeURIComponent(pathname.split(/[?#]/, 1)[0]);
  const candidates = [
    path.join(process.cwd(), "public", clean),
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "public",
      clean,
    ),
  ];
  for (const file of candidates) {
    try {
      const meta = await sharp(file).metadata();
      if (meta.width && meta.height) {
        return { width: meta.width, height: meta.height };
      }
    } catch {
      // Unreadable here — try the next candidate, else omit dimensions.
    }
  }
  return null;
}

/**
 * Shiki highlights code as
 * `<pre class="astro-code one-dark-pro"><code><span class="line"><span ...>...`
 * — a span per token, per line (the second class is the Shiki theme name,
 * so the match is on the `astro-code` prefix, not the whole attribute).
 * Feed readers do not render those colours, so the spans are pure weight
 * (a feed with full posts runs to megabytes). Replace each highlighted
 * block with plain `<pre><code>text</code></pre>`: the inner tags are
 * stripped and the code text is kept exactly as Shiki escaped it
 * (entities like `&lt;` are already escaped, so nothing is re-escaped
 * and nothing is lost). A `<pre>` without the astro-code class is left
 * alone, and a block that does not match the Shiki shape passes through
 * untouched — this never drops content, it only fails to slim.
 */
export function stripCodeHighlighting(html: string): string {
  return html.replace(
    /<pre[^>]*class="astro-code[^"]*"[^>]*><code>([\s\S]*?)<\/code><\/pre>/g,
    (_match, inner: string) =>
      `<pre><code>${inner.replace(/<[^>]+>/g, "")}</code></pre>`,
  );
}

/**
 * Sanitize rendered post HTML for `content:encoded`: strips scripts,
 * event handlers and `javascript:` links, keeps semantic markup and
 * code-highlighting classes (and heading ids, so in-content anchor links
 * keep working), and absolutizes relative image/link URLs so feed
 * readers — which have no site base — can resolve them. Code blocks are
 * slimmed to plain text first (see `stripCodeHighlighting`): readers
 * ignore Shiki's colours, so the spans only add weight.
 */
export function sanitizeFeedHtml(html: string): string {
  return sanitizeHtml(stripCodeHighlighting(html), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "math",
      "semantics",
      "annotation",
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "title", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading", "decoding"],
      "*": ["class", "id"],
    },
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          ...(attribs.href?.startsWith("/")
            ? { href: absoluteUrl(attribs.href) }
            : {}),
        },
      }),
      img: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          ...(attribs.src?.startsWith("/")
            ? { src: absoluteUrl(attribs.src) }
            : {}),
        },
      }),
    },
  });
}
