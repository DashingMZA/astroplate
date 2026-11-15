// Sitemap engine — turns resolved config + collected entries into the
// filename -> XML map the route serves. Pure except for
// `buildSitemapFilesAsync`, which runs the collectors.
//
// Rules:
//   - Master switch off -> no files at all.
//   - A disabled type -> no file and no index entry for it.
//   - An enabled type with no entries -> no file and no index entry
//     (never an empty sitemap).
//   - All types disabled or empty -> no index either (never an empty index).
//   - An enabled type with no collected entries at all (e.g. a type
//     enabled in config but with no collector) fails loudly.
//   - Chunking: at most `max_urls_per_sitemap` URLs and `max_bytes`
//     uncompressed bytes per file; when a type splits, chunks are
//     named `<stem>1.xml`, `<stem>2.xml`, … (numbered from 1, no
//     hyphen) and the bare filename is not generated. A type that fits
//     in one file keeps its configured filename. Never truncated: a
//     single entry larger than the byte limit still gets its own chunk.
//   - Every generated chunk is registered in the index. Index entries
//     carry `<lastmod>` = the newest genuine lastmod inside that chunk
//     (same as the old @astrojs/sitemap behaviour); never the build date.
//   - `lastmod: false` in config strips `<lastmod>` everywhere, files
//     and index alike.
//   - Duplicate URLs inside one file fail the build. (The images file
//     legitimately repeats post URLs that also appear in the posts file —
//     that is the image-sitemap format, so the check is per-file.)
import { getSitemapSettings } from "@/lib/seo/sitemap/config";
import { collectAllEntries } from "@/lib/seo/sitemap/collectors";
import type {
  SitemapEntry,
  SitemapIndexEntry,
  SitemapSettings,
  SitemapTypeKey,
} from "@/lib/seo/sitemap/types";
import { SITEMAP_TYPE_KEYS } from "@/lib/seo/sitemap/types";
import { canonicalFor } from "@/lib/utils/seo";
import {
  URLSET_FOOTER,
  serializeSitemapIndex,
  serializeUrlEntry,
  serializeUrlset,
  urlsetHeader,
} from "@/lib/seo/sitemap/xml";

/**
 * Chunk filename. A type that fits in one file keeps its configured
 * filename. When it splits, every chunk is numbered from 1 with no
 * hyphen — `<stem>1.xml`, `<stem>2.xml`, … — and the bare filename is
 * NOT generated (Rank Math style: `post-sitemap1.xml`, ...).
 */
export function chunkFilename(
  filename: string,
  chunkIndex: number,
  chunkCount: number,
): string {
  if (chunkCount <= 1) {
    return filename;
  }
  return filename.replace(/\.xml$/, `${chunkIndex + 1}.xml`);
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Split entries into chunks honouring both limits, measured on the exact
 * serialized bytes (header + entries + footer). Deterministic: entries
 * are taken in order, never reordered or dropped.
 */
export function chunkEntries(
  entries: SitemapEntry[],
  settings: SitemapSettings,
  hasImages: boolean,
): SitemapEntry[][] {
  const overhead =
    byteLength(`${urlsetHeader(hasImages)}\n`) +
    byteLength(`${URLSET_FOOTER}\n`);
  const chunks: SitemapEntry[][] = [];
  let current: SitemapEntry[] = [];
  let currentBytes = overhead;
  for (const entry of entries) {
    const entryBytes = byteLength(`${serializeUrlEntry(entry)}\n`);
    if (
      current.length > 0 &&
      (current.length >= settings.max_urls_per_sitemap ||
        currentBytes + entryBytes > settings.max_bytes)
    ) {
      chunks.push(current);
      current = [];
      currentBytes = overhead;
    }
    current.push(entry);
    currentBytes += entryBytes;
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

function newestLastmod(entries: SitemapEntry[]): Date | undefined {
  let newest: Date | undefined;
  for (const entry of entries) {
    if (entry.lastmod && (!newest || entry.lastmod > newest)) {
      newest = entry.lastmod;
    }
  }
  return newest;
}

/**
 * Build every sitemap file from collected entries. Returns a map of
 * output filename -> XML string (index first, then the type files).
 */
export function buildSitemapFiles(
  settings: SitemapSettings,
  collected: Partial<Record<SitemapTypeKey, SitemapEntry[]>>,
): Map<string, string> {
  const files = new Map<string, string>();
  if (!settings.enable) {
    return files;
  }
  const indexEntries: SitemapIndexEntry[] = [];
  for (const key of SITEMAP_TYPE_KEYS) {
    const type = settings.types[key];
    if (!type.enable) {
      continue;
    }
    if (!(key in collected)) {
      throw new Error(
        `sitemap: type "${key}" is enabled but no entries were collected ` +
          `for it — the collector is missing or was not run.`,
      );
    }
    const entries = [...(collected[key] ?? [])];
    if (entries.length === 0) {
      continue;
    }
    // Deterministic order within each file, and no duplicate URLs.
    entries.sort((a, b) => a.loc.localeCompare(b.loc));
    const seen = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.loc)) {
        throw new Error(
          `sitemap: duplicate URL ${entry.loc} in ${type.filename} — ` +
            `two entries resolve to the same public URL.`,
        );
      }
      seen.add(entry.loc);
    }
    const dated = settings.lastmod
      ? entries
      : entries.map((entry) => ({ ...entry, lastmod: undefined }));
    const hasImages = dated.some(
      (entry) => entry.images && entry.images.length > 0,
    );
    const chunks = chunkEntries(dated, settings, hasImages);
    for (const [i, chunk] of chunks.entries()) {
      const filename = chunkFilename(type.filename, i, chunks.length);
      files.set(filename, serializeUrlset(chunk));
      const lastmod = settings.lastmod ? newestLastmod(chunk) : undefined;
      indexEntries.push({
        loc: canonicalFor(`/${filename}`),
        ...(lastmod ? { lastmod } : {}),
      });
    }
  }
  if (files.size === 0) {
    return files;
  }
  const ordered = new Map<string, string>();
  ordered.set(settings.index_filename, serializeSitemapIndex(indexEntries));
  for (const [filename, xml] of files) {
    ordered.set(filename, xml);
  }
  return ordered;
}

/** Collect all enabled types and build the files (what the route calls). */
export async function buildSitemapFilesAsync(
  settings: SitemapSettings = getSitemapSettings(),
  now: Date = new Date(),
): Promise<Map<string, string>> {
  const collected = await collectAllEntries(settings, now);
  return buildSitemapFiles(settings, collected);
}
