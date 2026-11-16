/**
 * Inject explicit dimensions (+ responsive srcset) into Markdown images.
 *
 * PageSpeed flags content images twice: "Image elements do not have
 * explicit width and height" (no layout space reserved) and "Improve
 * image delivery" (1200w files served where ~687px is displayed).
 * Both are fixed here, once, in the content files themselves — the
 * way the user asked: when images are converted at build time and
 * `.md` references are rewritten to `.webp`, take the sizes then and
 * write them into the `.md` file, so the check problem ends for good.
 *
 * For every Markdown image `![alt](/images/...)` in `.md` / `.mdx`
 * under `src/content/` (outside fenced code blocks and inline code):
 *   `![alt](/images/blog/foo.webp)`
 * becomes:
 *   `<img src="/images/blog/foo.webp" alt="alt" width="1200"
 *     height="675" loading="lazy" decoding="async"
 *     srcset="/images/blog/foo-800.webp 800w, /images/blog/foo.webp 1200w"
 *     sizes="(max-width: 768px) 100vw, 768px" />`
 * Dimensions come from sharp (the real file under `public/`); the
 * srcset entry is added only when the `-800.webp` variant exists
 * (see `generate-responsive-variants.mjs`). Remote, relative and
 * missing images are left exactly as written.
 *
 * Idempotent: an image already rewritten to `<img ... width height>`
 * no longer matches the Markdown-image pattern, so a second run
 * changes nothing. Generated `.md` changes are COMMITTED, like the
 * webp rewrites — the build never has to redo them.
 *
 * Usage:
 *   node scripts/inject-image-dimensions.mjs [--check]
 * `--check` exits 1 when an image would change (CI guard); without
 * it the script rewrites the files in place.
 */

import { promises as fs } from "node:fs";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { walkFiles } from "./convert-images-to-webp.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = path.join(repoRoot, "src", "content");
const PUBLIC_DIR = path.join(repoRoot, "public");

/** Variant widths the srcset can reference (must match the generator). */
export const SRCSET_WIDTHS = [800];

/** sizes for body images: full width on mobile, article column on desktop. */
export const BODY_IMAGE_SIZES = "(max-width: 768px) 100vw, 768px";

/** Markdown image: ![alt](src) — alt without ], src without space or ). */
export const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

export function escapeAttr(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Variant path for a public image URL at `width` (same folder + ext). */
export function variantUrlFor(src, width) {
  const dot = src.lastIndexOf(".");
  if (dot === -1) return null;
  return `${src.slice(0, dot)}-${width}${src.slice(dot)}`;
}

/**
 * Build the replacement `<img>` for one Markdown image.
 * `dims` is { width, height } from sharp; `variantSrc` is the -800
 * URL when its file exists, else null.
 */
export function imgTagFor({ src, alt, dims, variantSrc }) {
  const attrs = [
    `src="${src}"`,
    `alt="${escapeAttr(alt)}"`,
    `width="${dims.width}"`,
    `height="${dims.height}"`,
    `loading="lazy"`,
    `decoding="async"`,
  ];
  if (variantSrc) {
    attrs.push(
      `srcset="${variantSrc} 800w, ${src} ${dims.width}w"`,
      `sizes="${BODY_IMAGE_SIZES}"`,
    );
  }
  return `<img ${attrs.join(" ")} />`;
}

/** Split a line into [text, isCode] segments on inline-code spans. */
export function splitInlineCode(line) {
  const parts = line.split(/(`[^`]*`)/g);
  return parts.map((text, i) => [text, i % 2 === 1]);
}

/**
 * Rewrite Markdown images in one line (outside fences — the caller
 * tracks those). `probe` maps a public image URL to
 * { width, height } | null, and `hasVariant` reports whether the
 * -800 variant file exists. Returns { line, changed }.
 */
export function injectInLine(line, { probe, hasVariant }) {
  let changed = false;
  const out = splitInlineCode(line)
    .map(([text, isCode]) => {
      if (isCode) return text;
      return text.replace(MD_IMAGE_RE, (whole, alt, src) => {
        if (!src.startsWith("/")) return whole; // relative or remote
        const dims = probe(src);
        if (!dims) return whole;
        const variantSrc =
          dims.width > Math.max(...SRCSET_WIDTHS) &&
          hasVariant(variantUrlFor(src, SRCSET_WIDTHS[0]))
            ? variantUrlFor(src, SRCSET_WIDTHS[0])
            : null;
        changed = true;
        return imgTagFor({ src, alt, dims, variantSrc });
      });
    })
    .join("");
  return { line: out, changed };
}

/**
 * Rewrite every `.md` / `.mdx` file under `srcDir`.
 * Returns the list of files that were changed (absolute paths).
 * With `dryRun`, nothing is written — the return value is the list
 * of files that WOULD change.
 */
export async function injectImageDimensions({
  srcDir = CONTENT_DIR,
  publicDir = PUBLIC_DIR,
  logger = console,
  dryRun = false,
} = {}) {
  const changedFiles = [];
  // Resolve all probes up front (sharp is async; the line pass is sync).
  const probeAll = async (sources) => {
    const out = new Map();
    for (const src of sources) {
      const file = path.join(publicDir, src.replace(/^\//, ""));
      if (!fsSync.existsSync(file)) {
        out.set(src, null);
        continue;
      }
      try {
        const meta = await sharp(file).metadata();
        out.set(
          src,
          meta.width && meta.height
            ? { width: meta.width, height: meta.height }
            : null,
        );
      } catch {
        out.set(src, null);
      }
    }
    return out;
  };
  const hasVariant = (variantSrc) =>
    variantSrc !== null &&
    fsSync.existsSync(path.join(publicDir, variantSrc.replace(/^\//, "")));

  for (const file of await walkFiles(srcDir)) {
    if (![".md", ".mdx"].includes(path.extname(file).toLowerCase())) {
      continue;
    }
    let content;
    try {
      content = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    // Collect the distinct local image URLs first (outside fences
    // and inline code), so sharp probes each file once.
    const sources = new Set();
    {
      const lines = content.split("\n");
      let inFence = false;
      for (const line of lines) {
        if (/^```/.test(line.trimStart())) {
          inFence = !inFence;
          continue;
        }
        if (inFence) continue;
        for (const [text, isCode] of splitInlineCode(line)) {
          if (isCode) continue;
          for (const m of text.matchAll(MD_IMAGE_RE)) {
            if (m[2].startsWith("/")) sources.add(m[2]);
          }
        }
      }
    }
    if (sources.size === 0) continue;
    const dimsBySrc = await probeAll(sources);
    const syncProbe = (src) => dimsBySrc.get(src) ?? null;

    const lines = content.split("\n");
    let inFence = false;
    let fileChanged = false;
    const out = lines.map((line) => {
      if (/^```/.test(line.trimStart())) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      const { line: next, changed } = injectInLine(line, {
        probe: syncProbe,
        hasVariant,
      });
      if (changed) fileChanged = true;
      return next;
    });
    if (!fileChanged) continue;
    const next = out.join("\n");
    if (!dryRun) await fs.writeFile(file, next, "utf8");
    const rel = path.relative(repoRoot, file);
    logger.log(`inject: ${rel}${dryRun ? " (would change)" : ""}`);
    changedFiles.push(file);
  }
  return changedFiles;
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const check = process.argv.includes("--check");
  const changed = await injectImageDimensions({ dryRun: check });
  if (check) {
    if (changed.length > 0) {
      console.error(
        `inject-image-dimensions: ${changed.length} file(s) would change:\n${changed
          .map((f) => `  ${path.relative(repoRoot, f)}`)
          .join("\n")}`,
      );
      process.exit(1);
    }
    console.log("inject-image-dimensions: OK");
  } else if (changed.length === 0) {
    console.log("inject-image-dimensions: 0 files changed");
  }
}
