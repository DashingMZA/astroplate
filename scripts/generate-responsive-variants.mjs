/**
 * Generate responsive `-<width>.webp` variants for blog images.
 *
 * The PageSpeed "Improve image delivery" audit flags the 1200x675 blog
 * images because mobile renders them at ~687px wide: a 1200w file is
 * larger than it needs to be. This script writes a smaller variant
 * next to each source (e.g. `foo-800.webp` beside `foo.webp`) so the
 * markup can serve it via srcset (see `inject-image-dimensions.mjs`
 * for body images and `ImageMod.astro` for the post hero).
 *
 * Scope is deliberately narrow: `public/images/blog/*.webp` wider
 * than the variant width. Other folders (avatars, testimonials) are
 * already small. Generated variants are COMMITTED, like the `.webp`
 * files themselves — the build never generates them on the fly.
 *
 * Idempotent: a variant is skipped when it exists and is newer than
 * its source (same `isUpToDate` rule as the webp converter).
 *
 * Usage:
 *   node scripts/generate-responsive-variants.mjs [--check]
 * `--check` exits 1 when a variant is missing or stale (CI guard);
 * without it the script writes the missing variants.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { isUpToDate } from "./convert-images-to-webp.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BLOG_DIR = path.join(repoRoot, "public", "images", "blog");

/** Variant widths to generate for each wide blog image. */
export const VARIANT_WIDTHS = [800];

/** webp quality, matching the converter's JPEG_QUALITY (82). */
export const VARIANT_QUALITY = 82;

/** Variant path for `sourcePath` at `width` (same folder + extension). */
export function variantPathFor(sourcePath, width) {
  const parsed = path.parse(sourcePath);
  return path.join(parsed.dir, `${parsed.name}-${width}${parsed.ext}`);
}

/**
 * Generate the missing/stale variants under `blogDir`.
 * Returns the list of variant paths that were written.
 */
export async function generateVariants({
  blogDir = BLOG_DIR,
  widths = VARIANT_WIDTHS,
  logger = console,
} = {}) {
  const written = [];
  let entries;
  try {
    entries = await fs.readdir(blogDir, { withFileTypes: true });
  } catch {
    return written; // No blog images — nothing to do.
  }
  for (const entry of entries) {
    if (!entry.isFile() || !/\.webp$/i.test(entry.name)) continue;
    // Never generate a variant of a variant (a file already ending
    // in -<width>.webp for a configured width). NOTE: do NOT match
    // /-\d+\.webp$/ — real sources end in -1 / -2 (diagram-1.webp).
    if (widths.some((w) => entry.name.endsWith(`-${w}.webp`))) continue;
    const sourcePath = path.join(blogDir, entry.name);
    const meta = await sharp(sourcePath).metadata();
    if (!meta.width || meta.width <= Math.max(...widths)) continue;
    for (const width of widths) {
      if (meta.width <= width) continue;
      const variantPath = variantPathFor(sourcePath, width);
      if (isUpToDate(sourcePath, variantPath)) continue;
      await sharp(sourcePath)
        .resize(width, null, { kernel: sharp.kernel.lanczos3 })
        .webp({ quality: VARIANT_QUALITY })
        .toFile(variantPath);
      logger.log(
        `variant: ${path.relative(repoRoot, variantPath)} (${width}w)`,
      );
      written.push(variantPath);
    }
  }
  return written;
}

/** Missing/stale variants (for --check). */
export async function findMissingVariants({
  blogDir = BLOG_DIR,
  widths = VARIANT_WIDTHS,
} = {}) {
  const missing = [];
  let entries;
  try {
    entries = await fs.readdir(blogDir, { withFileTypes: true });
  } catch {
    return missing;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !/\.webp$/i.test(entry.name)) continue;
    if (widths.some((w) => entry.name.endsWith(`-${w}.webp`))) continue;
    const sourcePath = path.join(blogDir, entry.name);
    const meta = await sharp(sourcePath).metadata();
    if (!meta.width || meta.width <= Math.max(...widths)) continue;
    for (const width of widths) {
      if (meta.width <= width) continue;
      if (!isUpToDate(sourcePath, variantPathFor(sourcePath, width))) {
        missing.push(variantPathFor(sourcePath, width));
      }
    }
  }
  return missing;
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const check = process.argv.includes("--check");
  if (check) {
    const missing = await findMissingVariants({});
    if (missing.length > 0) {
      console.error(
        `responsive variants: ${missing.length} missing/stale:\n${missing
          .map((p) => `  ${path.relative(repoRoot, p)}`)
          .join("\n")}`,
      );
      process.exit(1);
    }
    console.log("responsive variants: OK");
  } else {
    const written = await generateVariants({});
    if (written.length === 0) console.log("responsive variants: 0 written");
  }
}
