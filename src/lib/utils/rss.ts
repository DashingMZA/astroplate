// Pure helpers for the RSS feed (`src/pages/rss.xml.ts`). Everything here
// is unit-tested in `tests/rss.test.js`; the endpoint itself only
// orchestrates (collections, rendering, container) and is covered by
// marker tests, because `astro:content` / `astro/container` cannot run
// under plain `node --test`.
import sanitizeHtml from "sanitize-html";
import type { ResolvedAuthor } from "@/lib/utils/authors";
import { absoluteUrl, resolveOgImage } from "@/lib/utils/seo";

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

/** MIME type for a media URL from its extension, or null when unknown. */
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
 * Media RSS tags for a post's own featured image (`og_image` else
 * `image`, same priority as `resolveOgImage`). Returns "" when the post
 * has no own image — the site-default OG image is not a post's featured
 * image, so it is never emitted here.
 */
export function mediaTags(input: {
  og_image?: string | null;
  image?: string | null;
}): string {
  const { url, isPageImage } = resolveOgImage(input);
  if (!isPageImage) {
    return "";
  }
  const type = mediaMimeType(url);
  const content = type
    ? `<media:content url="${escapeXml(url)}" medium="image" type="${type}" />`
    : `<media:content url="${escapeXml(url)}" medium="image" />`;
  return `${content}\n<media:thumbnail url="${escapeXml(url)}" />`;
}

/**
 * Author elements for a resolved author list. RSS 2.0 `<author>` is an
 * email address, so it is only emitted when a resolved author has an
 * email (format `email (Name)`); display names always go to Dublin Core
 * `dc:creator` instead. With several authors, `<author>` carries the
 * first email found and every name gets a `dc:creator`.
 */
export function authorElements(resolved: ResolvedAuthor[]): {
  author?: string;
  dcCreators: string;
} {
  const dcCreators = resolved
    .map((a) => `<dc:creator>${escapeXml(a.name)}</dc:creator>`)
    .join("\n");
  const withEmail = resolved.find((a) => a.entry?.data.email?.trim());
  const email = withEmail?.entry?.data.email?.trim();
  return {
    ...(email && withEmail ? { author: `${email} (${withEmail.name})` } : {}),
    dcCreators,
  };
}

/**
 * Sanitize rendered post HTML for `content:encoded`: strips scripts,
 * event handlers and `javascript:` links, keeps semantic markup and
 * code-highlighting classes (and heading ids, so in-content anchor links
 * keep working), and absolutizes relative image/link URLs so feed
 * readers — which have no site base — can resolve them.
 */
export function sanitizeFeedHtml(html: string): string {
  return sanitizeHtml(html, {
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
