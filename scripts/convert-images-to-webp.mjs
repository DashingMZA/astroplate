// Automatic image-to-webp pipeline.
//
// Scope: location-based only
// ---------------------------
// This pipeline operates ONLY under `assets/images/` and
// `public/images/`. It never reads, moves, converts, or deletes
// anything elsewhere under `public/`. Files placed directly in
// `public/` (root level — e.g. `public/favicon.png`,
// `public/site.webmanifest`, `public/apple-touch-icon.png`) are
// completely out of scope and are never touched. There are NO
// filename-pattern exclusions: every `.jpg` / `.jpeg` / `.png`
// under `public/images/` and `assets/images/` is converted to
// webp — including logos. Icon files belong at the `public/` root,
// not under `public/images/` (see README.md).
//
// How it works
// ------------
// Originals live in `assets/images/` (git-tracked, mirrored against
// `public/images/`). Every build — and `pnpm images` on its own —
// converts each original into a `.webp` file at the mirrored path
// under `public/images/`, which is what the site actually serves:
//
//   assets/images/blog/<slug>-feature.jpg
//     -> public/images/blog/<slug>-feature.webp
//
// The original is never modified or deleted; only the generated
// `.webp` is served, so the site always ships the small modern
// format while the full-quality original stays in the repo.
//
// Adopting uploads dropped into public/images/
// -------------------------------------------
// Images uploaded straight into `public/images/` (a file dropped
// in, or committed there by hand) are adopted before conversion:
// for each `.jpg` / `.jpeg` / `.png` found under `public/images/`,
//   - no matching source in `assets/images/` (same relative path):
//     the file is MOVED into `assets/images/` at the same relative
//     path, then converted back to `.webp` in `public/images/`;
//   - a matching source already exists in `assets/images/`: the
//     public original is a duplicate and is DELETED from `public/`,
//     and the `.webp` is generated from the `assets/` source.
// Only `.jpg` / `.jpeg` / `.png` are adoption candidates.
// Adoption runs before conversion on every run.
//
// Referenced images are adopted too — and their references follow.
// -----------------------------------------------------------------
// A file that the site loads by exact path (config.json, frontmatter,
// .astro templates, lib code — e.g. `/images/about-banner.jpg`,
// `/images/logo.png`, `/images/profile.png`, `/images/og-image.jpg`)
// is adopted and converted like any other image, and every reference
// to its old path under `src/` is rewritten to the new `.webp` path
// (see "Rewriting references" below). The site ends up with ALL
// images under `public/images/` as webp.
//
// Rewriting references
// ---------------------
// After adoption, `rewriteImageReferences` rewrites every occurrence
// of each adopted file's old public path (`/images/<relative path>`)
// to its new `.webp` path, in every text file under `src/`. In
// `.md` / `.mdx` files, references inside fenced code blocks
// (``` ... ```) are left untouched — code samples stay exactly as
// written. External URLs are never touched (only `/images/...`
// paths are rewritten). The rewrite is idempotent: once a reference
// says `.webp`, there is nothing left to rewrite.
//
// `pnpm images` moves the file and rewrites references in the working
// tree, so both persist and can be committed (original in `assets/`,
// `.webp` in `public/`, references updated). In an ephemeral build
// (CI / Vercel) the move and the rewrite only live for that build —
// the checked-out repo is untouched — and `dist/` still gets only
// the `.webp`, which is what is served.
//
// Conversion rules (same as the one-off manual conversion of the
// 40 blog images)
// -----------------------------------------------
// - `.jpg` / `.jpeg` -> webp, quality 82
// - `.png`           -> webp, lossless
// - Same width/height as the source — no resize, no crop.
// - `.svg` / `.gif` are skipped entirely (vector / animation —
//   converting them would lose what makes them useful).
// - `.webp` / `.avif` sources are already optimised; they are
//   copied through unchanged instead of being re-encoded.
// - Any other file in `assets/images/` is ignored.
//
// Skip rule (unchanged sources are not re-encoded)
// ------------------------------------------------
// A source is skipped when its output already exists and is newer
// than the source (output mtime >= source mtime). Touch or replace
// the source and it converts again on the next run. This is a plain
// mtime comparison — no manifest file is kept — so deleting an
// output and re-running regenerates it.
//
// Stale outputs
// -------------
// A `.webp` under `public/images/` with no matching source in
// `assets/images/` is only reported as a warning, so nothing is
// ever removed by surprise. The one exception is the adopt step
// above: it removes a public `.jpg` / `.jpeg` / `.png` that is a
// duplicate of an `assets/` source. It never deletes `.webp`
// outputs.
//
// Failures
// ---------
// A corrupt or unreadable source is logged as an error and the
// run continues with the remaining files, but the process exits
// non-zero at the end so CI / the build fails loudly instead of
// silently shipping a site with a missing image.
//
// "Upload" means adding a file either to `assets/images/` (git or
// the GitHub web UI) or straight into `public/images/` — the adopt
// step moves the latter into `assets/images/` first and rewrites
// its references to `.webp`. There is no server-side upload hook
// in this static site; conversion happens at build time (the
// `prebuild` step) and on demand via `pnpm images`. A file-watch
// mode that converts on save during `pnpm dev` is a possible
// follow-up, not built here.
//
// Usage:
//   node scripts/convert-images-to-webp.mjs [--source-dir <dir>] [--output-dir <dir>] [--src-dir <dir>]
//   pnpm images
// Env overrides (used by tests): WEBP_SOURCE_DIR, WEBP_OUTPUT_DIR, WEBP_SRC_DIR.
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export const JPEG_QUALITY = 82;

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const DEFAULT_SOURCE_DIR = path.join(repoRoot, "assets", "images");
export const DEFAULT_OUTPUT_DIR = path.join(repoRoot, "public", "images");
export const DEFAULT_SRC_DIR = path.join(repoRoot, "src");

// Extensions the pipeline converts (lowercase, with leading dot).
export const CONVERTIBLE_EXTS = new Set([".jpg", ".jpeg", ".png"]);
// Skipped on purpose: vectors and animations must stay as they are.
export const SKIPPED_EXTS = new Set([".svg", ".gif"]);
// Already optimised: copied through verbatim, never re-encoded.
export const PASSTHROUGH_EXTS = new Set([".webp", ".avif"]);

/** Mirror a source path into the output tree, swapping the extension to `.webp`. */
export function outputPathFor(sourcePath, sourceDir, outputDir) {
  const relative = path.relative(sourceDir, sourcePath);
  const parsed = path.parse(relative);
  return path.join(outputDir, parsed.dir, `${parsed.name}.webp`);
}

/** Mirror a source path into the output tree, keeping its filename. */
export function passthroughPathFor(sourcePath, sourceDir, outputDir) {
  return path.join(outputDir, path.relative(sourceDir, sourcePath));
}

/** True when the output already exists and is at least as new as the source. */
export function isUpToDate(sourcePath, outputPath) {
  if (!fsSync.existsSync(outputPath)) return false;
  const source = fsSync.statSync(sourcePath);
  const output = fsSync.statSync(outputPath);
  return output.mtimeMs >= source.mtimeMs;
}

export async function walkFiles(dir) {
  const found = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return found;
    throw error;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walkFiles(full)));
    else if (entry.isFile()) found.push(full);
  }
  return found.sort();
}

/**
 * Adopt `.jpg` / `.jpeg` / `.png` files found under `outputDir`
 * (public/images/) into `sourceDir` (assets/images/).
 *
 * Runs BEFORE conversion. For each candidate:
 * - no matching source at the same relative path -> MOVE the file
 *   into `sourceDir` (same relative path); the conversion step
 *   below then generates its `.webp` back into `outputDir`.
 * - a matching source already exists -> the public file is a
 *   duplicate: DELETE it from `outputDir`; the `.webp` is
 *   generated from the `assets/` source.
 * `.webp` / `.avif` / `.svg` / `.gif` are never candidates and
 * are left exactly where they are. Nothing outside `outputDir`
 * is ever read, moved, or deleted — files at the `public/` root
 * are out of scope.
 *
 * Returns `{ adopted, removed }` — relative paths, sorted.
 */
export async function adoptUploads({
  sourceDir,
  outputDir,
  logger = console,
} = {}) {
  const adopted = [];
  const removed = [];
  for (const outputPath of await walkFiles(outputDir)) {
    const ext = path.extname(outputPath).toLowerCase();
    if (!CONVERTIBLE_EXTS.has(ext)) continue;
    const relative = path.relative(outputDir, outputPath);
    const sourcePath = path.join(sourceDir, relative);
    if (fsSync.existsSync(sourcePath)) {
      await fs.rm(outputPath);
      logger.log(
        `adopt: duplicate ${relative} — source already in assets/images, removed from public`,
      );
      removed.push(relative);
    } else {
      await fs.mkdir(path.dirname(sourcePath), { recursive: true });
      await fs.rename(outputPath, sourcePath);
      logger.log(`adopt: moved ${relative} -> assets/images/${relative}`);
      adopted.push(relative);
    }
  }
  return { adopted, removed };
}

/**
 * True when the occurrence of a path at `index` in `text` is part
 * of an absolute URL (`https://host/...` or `//host/...`) rather
 * than a local `/images/...` path: the text just before it ends
 * with a URL prefix (scheme + `//` + host) and no whitespace,
 * quote or closing bracket intervenes.
 */
function isExternalUrl(text, index) {
  const before = text.slice(0, index);
  return /(?:[a-zA-Z][a-zA-Z0-9+.-]*:)?\/\/[^\s"')\]]*$/.test(before);
}

/**
 * Replace each `from` with its `to`, but only for local paths —
 * occurrences that are part of an absolute URL are left untouched.
 * Returns the new text plus the replacements that actually applied.
 */
function applyReplacements(text, replacements) {
  let out = text;
  const applied = [];
  for (const [from, to] of replacements) {
    let result = "";
    let start = 0;
    let idx;
    let did = false;
    while ((idx = out.indexOf(from, start)) !== -1) {
      if (isExternalUrl(out, idx)) {
        result += out.slice(start, idx + from.length);
      } else {
        result += out.slice(start, idx) + to;
        did = true;
      }
      start = idx + from.length;
    }
    result += out.slice(start);
    if (did) applied.push([from, to]);
    out = result;
  }
  return { text: out, applied };
}

/**
 * Rewrite `replacements` ([from, to] pairs) in `content`, leaving
 * fenced code blocks (``` ... ```) untouched. Returns the new
 * content plus the replacements that actually applied.
 */
export function rewriteOutsideFences(content, replacements) {
  const lines = content.split("\n");
  let inFence = false;
  const appliedAll = [];
  const out = lines.map((line) => {
    if (/^```/.test(line.trimStart())) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    const { text, applied } = applyReplacements(line, replacements);
    for (const pair of applied) {
      if (!appliedAll.some(([from]) => from === pair[0])) {
        appliedAll.push(pair);
      }
    }
    return text;
  });
  return { content: out.join("\n"), applied: appliedAll };
}

/**
 * Rewrite each adopted file's old public path to its new `.webp`
 * path in every text file under `srcDir`.
 * `replacements` is a list of `[oldPath, newPath]` pairs such as
 * `["/images/about-banner.jpg", "/images/about-banner.webp"]`.
 * `.md` / `.mdx` files are rewritten outside fenced code blocks
 * only; other files are rewritten wholesale. External URLs are
 * never touched (only `/images/...` paths are replaced).
 * Returns the list of files that were changed (absolute paths).
 */
export async function rewriteImageReferences({
  srcDir,
  replacements,
  logger = console,
} = {}) {
  const changedFiles = [];
  if (replacements.length === 0) return changedFiles;
  for (const file of await walkFiles(srcDir)) {
    let content;
    try {
      content = await fs.readFile(file, "utf8");
    } catch {
      continue; // Binary or unreadable — cannot hold a reference.
    }
    const ext = path.extname(file).toLowerCase();
    let next;
    let applied;
    if (ext === ".md" || ext === ".mdx") {
      ({ content: next, applied } = rewriteOutsideFences(
        content,
        replacements,
      ));
    } else {
      ({ text: next, applied } = applyReplacements(content, replacements));
    }
    if (applied.length === 0) continue;
    await fs.writeFile(file, next, "utf8");
    const rel = path.relative(repoRoot, file);
    logger.log(
      `rewrite: ${rel} (${applied.map(([from, to]) => `${from} -> ${to}`).join(", ")})`,
    );
    changedFiles.push(file);
  }
  return changedFiles;
}

/**
 * Convert one source file. Returns `{ width, height }` of the output
 * for a real conversion, `{ copied: true }` when the file was copied
 * through unchanged (already-optimised format), or `null` when it
 * was skipped (already up to date).
 * Throws on a corrupt / unreadable source — the caller records it.
 */
export async function convertImage(sourcePath, sourceDir, outputDir) {
  const ext = path.extname(sourcePath).toLowerCase();
  const passthrough = PASSTHROUGH_EXTS.has(ext);
  const outputPath = passthrough
    ? passthroughPathFor(sourcePath, sourceDir, outputDir)
    : outputPathFor(sourcePath, sourceDir, outputDir);
  if (isUpToDate(sourcePath, outputPath)) return null;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  if (passthrough) {
    await fs.copyFile(sourcePath, outputPath);
    return { copied: true };
  }
  const pipeline = sharp(sourcePath);
  if (ext === ".png") pipeline.webp({ lossless: true });
  else pipeline.webp({ quality: JPEG_QUALITY });
  // No resize: the output keeps the source width/height.
  await pipeline.toFile(outputPath);
  const meta = await sharp(outputPath).metadata();
  return { width: meta.width, height: meta.height };
}

/** Find `.webp` outputs under `outputDir` with no source in `sourceDir`. */
export async function findStaleOutputs(sourceDir, outputDir) {
  const stale = [];
  for (const outputPath of await walkFiles(outputDir)) {
    if (path.extname(outputPath).toLowerCase() !== ".webp") continue;
    const relative = path.relative(outputDir, outputPath);
    const base = relative.slice(0, -".webp".length);
    const hasSource = [...CONVERTIBLE_EXTS, ...PASSTHROUGH_EXTS].some((ext) =>
      fsSync.existsSync(path.join(sourceDir, `${base}${ext}`)),
    );
    if (!hasSource) stale.push(outputPath);
  }
  return stale;
}

/**
 * Adopt uploads from `outputDir`, rewrite their references in
 * `srcDir`, then convert every image under `sourceDir` into
 * `outputDir`.
 * Returns `{ converted, skipped, ignored, stale, errors, adopted,
 * duplicatesRemoved, rewrittenFiles }`.
 * `errors` is a list of `{ file, message }` — non-empty means the
 * caller must fail (the CLI exits 1).
 */
export async function convertImages({
  sourceDir = DEFAULT_SOURCE_DIR,
  outputDir = DEFAULT_OUTPUT_DIR,
  srcDir = DEFAULT_SRC_DIR,
  logger = console,
} = {}) {
  const stats = {
    converted: 0,
    skipped: 0,
    ignored: 0,
    stale: [],
    errors: [],
    adopted: [],
    duplicatesRemoved: [],
    rewrittenFiles: [],
  };

  // 1. Adopt uploads dropped directly into public/images/ first,
  // so they become assets/ sources before conversion runs.
  const adoption = await adoptUploads({ sourceDir, outputDir, logger });
  stats.adopted = adoption.adopted;
  stats.duplicatesRemoved = adoption.removed;

  // 2. References to adopted/removed originals now point at the
  // new .webp paths (fenced code samples untouched).
  const replacements = [...adoption.adopted, ...adoption.removed].map(
    (relative) => {
      const parsed = path.parse(relative);
      const webp = parsed.dir
        ? `${parsed.dir}/${parsed.name}.webp`
        : `${parsed.name}.webp`;
      return [`/images/${relative}`, `/images/${webp}`];
    },
  );
  stats.rewrittenFiles = await rewriteImageReferences({
    srcDir,
    replacements,
    logger,
  });

  // 3. Convert every image under sourceDir into outputDir.
  for (const sourcePath of await walkFiles(sourceDir)) {
    const relative = path.relative(sourceDir, sourcePath);
    const ext = path.extname(sourcePath).toLowerCase();
    if (SKIPPED_EXTS.has(ext)) {
      logger.log(`skip (not converted): ${relative}`);
      stats.ignored += 1;
      continue;
    }
    if (!CONVERTIBLE_EXTS.has(ext) && !PASSTHROUGH_EXTS.has(ext)) {
      logger.log(`ignore: ${relative}`);
      stats.ignored += 1;
      continue;
    }
    try {
      const result = await convertImage(sourcePath, sourceDir, outputDir);
      if (result === null) {
        logger.log(`skip (up to date): ${relative}`);
        stats.skipped += 1;
      } else if (result.copied) {
        logger.log(`copy (unchanged): ${relative}`);
        stats.converted += 1;
      } else {
        logger.log(
          `convert: ${relative} -> ${result.width}x${result.height} webp`,
        );
        stats.converted += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`error: ${relative}: ${message}`);
      stats.errors.push({ file: relative, message });
    }
  }

  // v1 never deletes generated outputs: orphaned .webp files are
  // only warned about (the adopt step above is the one exception,
  // and it only ever removes public .jpg/.jpeg/.png duplicates —
  // never `.webp` outputs).
  stats.stale = await findStaleOutputs(sourceDir, outputDir);
  for (const stalePath of stats.stale) {
    logger.warn(
      `stale output (no source in ${path.relative(repoRoot, sourceDir)}): ${path.relative(repoRoot, stalePath)}`,
    );
  }
  return stats;
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--source-dir" && argv[i + 1]) {
      options.sourceDir = path.resolve(argv[i + 1]);
      i += 1;
    } else if (argv[i] === "--output-dir" && argv[i + 1]) {
      options.outputDir = path.resolve(argv[i + 1]);
      i += 1;
    } else if (argv[i] === "--src-dir" && argv[i + 1]) {
      options.srcDir = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return options;
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const sourceDir =
    cli.sourceDir ?? process.env.WEBP_SOURCE_DIR ?? DEFAULT_SOURCE_DIR;
  const outputDir =
    cli.outputDir ?? process.env.WEBP_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const srcDir = cli.srcDir ?? process.env.WEBP_SRC_DIR ?? DEFAULT_SRC_DIR;
  const stats = await convertImages({ sourceDir, outputDir, srcDir });
  console.log(
    `images: ${stats.converted} converted, ${stats.skipped} up to date, ` +
      `${stats.ignored} ignored, ${stats.adopted.length} adopted, ` +
      `${stats.duplicatesRemoved.length} duplicate original(s) removed, ` +
      `${stats.rewrittenFiles.length} reference file(s) rewritten, ` +
      `${stats.stale.length} stale output(s), ` +
      `${stats.errors.length} error(s)`,
  );
  if (stats.errors.length > 0) {
    console.error(
      `images: failing — ${stats.errors.length} source file(s) could not be converted`,
    );
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
