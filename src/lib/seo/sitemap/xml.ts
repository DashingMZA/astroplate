// Central XML serialization for the sitemap system. One place builds
// every sitemap document, so the declaration, namespaces, escaping and
// date format can never drift between files.
//
// Rules:
//   - XML declaration + UTF-8 on every document.
//   - Only namespaces that are actually used are declared: the sitemap
//     protocol namespace always, the image namespace only when at least
//     one entry carries images (the old @astrojs/sitemap output declared
//     news/xhtml/image/video namespaces it never used).
//   - Values are escaped with the shared `escapeXml` from rss.ts — no
//     second escaper.
//   - `<lastmod>` is a full ISO 8601 timestamp (`toISOString()`).
//   - An empty or non-absolute `<loc>` fails loudly instead of shipping
//     malformed XML.
import { escapeXml } from "@/lib/utils/rss";
import type { SitemapEntry, SitemapIndexEntry } from "@/lib/seo/sitemap/types";

export const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
export const IMAGE_NS = "http://www.google.com/schemas/sitemap-image/1.1";

/** Full ISO 8601 timestamp, e.g. `2026-11-14T05:00:00.000Z`. */
export function formatLastmod(date: Date): string {
  return date.toISOString();
}

function assertLoc(loc: string | undefined, what: string): string {
  if (!loc || !/^https?:\/\//i.test(loc)) {
    throw new Error(
      `sitemap: refusing to serialize an invalid ${what}: ${JSON.stringify(loc)}`,
    );
  }
  return loc;
}

/** One `<url>` block (without the surrounding `<urlset>`). */
export function serializeUrlEntry(entry: SitemapEntry): string {
  const loc = assertLoc(entry.loc, "<loc>");
  const lines = ["  <url>", `    <loc>${escapeXml(loc)}</loc>`];
  if (entry.lastmod) {
    lines.push(
      `    <lastmod>${escapeXml(formatLastmod(entry.lastmod))}</lastmod>`,
    );
  }
  for (const image of entry.images ?? []) {
    const imageLoc = assertLoc(image.loc, "<image:loc>");
    lines.push("    <image:image>");
    lines.push(`      <image:loc>${escapeXml(imageLoc)}</image:loc>`);
    if (image.title) {
      lines.push(`      <image:title>${escapeXml(image.title)}</image:title>`);
    }
    lines.push("    </image:image>");
  }
  lines.push("  </url>");
  return lines.join("\n");
}

/** Opening lines of a `<urlset>` (declaration + root element). */
export function urlsetHeader(hasImages: boolean): string {
  const imageNs = hasImages ? ` xmlns:image="${IMAGE_NS}"` : "";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="${SITEMAP_NS}"${imageNs}>`
  );
}

export const URLSET_FOOTER = "</urlset>";

/** A complete `<urlset>` document for one sitemap file. */
export function serializeUrlset(entries: SitemapEntry[]): string {
  const hasImages = entries.some(
    (entry) => entry.images && entry.images.length > 0,
  );
  const body = entries.map(serializeUrlEntry).join("\n");
  return `${urlsetHeader(hasImages)}\n${body}\n${URLSET_FOOTER}\n`;
}

/** A complete `<sitemapindex>` document. Never empty — the engine skips the index when nothing was generated. */
export function serializeSitemapIndex(files: SitemapIndexEntry[]): string {
  if (files.length === 0) {
    throw new Error("sitemap: refusing to serialize an empty sitemap index");
  }
  const body = files
    .map((file) => {
      const loc = assertLoc(file.loc, "<loc>");
      const lines = ["  <sitemap>", `    <loc>${escapeXml(loc)}</loc>`];
      if (file.lastmod) {
        lines.push(
          `    <lastmod>${escapeXml(formatLastmod(file.lastmod))}</lastmod>`,
        );
      }
      lines.push("  </sitemap>");
      return lines.join("\n");
    })
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="${SITEMAP_NS}">\n${body}\n</sitemapindex>\n`
  );
}
