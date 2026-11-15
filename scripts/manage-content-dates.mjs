// Content date manager — the single engine behind automatic frontmatter
// dates (`dateCreated` / `datePublished` / `dateModified`, all ISO 8601
// UTC ending in `Z`).
//
// Modes:
//   (default)  Write mode: stamp missing dates and bump `dateModified`
//              on meaningful edits, using `git show HEAD:<path>` as the
//              baseline. Never overwrites `dateCreated`/`datePublished`.
//   --check    Validate only (what `prebuild` runs): missing, invalid or
//              inconsistent required dates fail the build. Never writes.
//   --dry-run  Write mode without writing files.
//   --migrate  One-time migration: old `date`/`updated`/`lastmod` fields
//              become the three new fields; dateless actual-content
//              files get ONE consistent provisional timestamp (printed
//              in the report — never presented as verified history).
//   --since <sha>  GitHub Action mode: compare each file changed between
//              <sha> and HEAD against its <sha> version and stamp
//              `dateModified` where the body changed.
//   --stage    `git add` every file the script changed (pre-commit hook).
//
// Meaningful change = the Markdown/MDX body (frontmatter stripped,
// whitespace normalized) differs from the baseline. A typo fix and a
// full rewrite both count; Prettier-only reformatting does not. The
// script never invents a historical date: git first-add recovery only
// applies to files added on or after SITE_CONTENT_ERA_START (the 2023
// theme-import dates are not content dates), and anything unrecoverable
// is left unset with a warning (use --migrate for the documented
// provisional fallback).
//
// Writes are surgical frontmatter line edits — the rest of the file is
// preserved byte-for-byte. Reads use gray-matter (already a dependency);
// git access is via the `git` CLI only.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// The git repo the script operates on. Defaults to this script's own
// repo; main() re-anchors it to the content dir's repo (two levels up
// from `src/content`), so `--content-dir <tmp>/src/content` in tests
// diffs against the temp repo, never the real one.
let activeRepoRoot = repoRoot;

export const DEFAULT_CONTENT_DIR = path.join(repoRoot, "src", "content");
/** Files first added before this date are theme imports, not site content — never use their git dates. */
export const SITE_CONTENT_ERA_START = "2026-11-01T00:00:00Z";
export const OLD_DATE_FIELDS = ["date", "updated", "lastmod"];
export const DATE_FIELDS = ["dateCreated", "datePublished", "dateModified"];
/** Collections whose files never carry dates (no standalone URLs). */
export const DATELESS_COLLECTIONS = new Set(["homepage", "sections"]);

export function toFrontmatterIso(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.valueOf())) {
    return undefined;
  }
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function nowIso() {
  return toFrontmatterIso(new Date());
}

function parseArgs(argv) {
  const args = {
    check: false,
    dryRun: false,
    migrate: false,
    stage: false,
    since: null,
    provisional: null,
    contentDir: process.env.CONTENT_DATES_DIR || DEFAULT_CONTENT_DIR,
    files: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") args.check = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--migrate") args.migrate = true;
    else if (arg === "--stage") args.stage = true;
    else if (arg === "--since") args.since = argv[++i] ?? null;
    else if (arg === "--provisional") args.provisional = argv[++i] ?? null;
    else if (arg === "--content-dir")
      args.contentDir = argv[++i] ?? args.contentDir;
    else if (arg.startsWith("--")) throw new Error(`Unknown flag: ${arg}`);
    else args.files.push(arg);
  }
  return args;
}

// ─── Filesystem + git ────────────────────────────────────────────────────

export function listContentFiles(contentDir) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.mdx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(contentDir);
  return out.sort();
}

function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd: cwd ?? activeRepoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

export function gitAvailable() {
  return git(["rev-parse", "--git-dir"]) !== null;
}

function gitShow(rev, relPath) {
  return git(["show", `${rev}:${relPath}`]);
}

function gitHeadCommitIso() {
  const raw = git(["log", "-1", "--format=%aI"]);
  return raw ? toFrontmatterIso(new Date(raw)) : null;
}

/**
 * First-add (creation) commit date of a tracked file, as an ISO `Z`
 * string — or null when the file is untracked, has no history, or was
 * first added before the site-content era (theme import, not content).
 */
export function gitFirstAddIso(relPath) {
  const raw = git([
    "log",
    "--diff-filter=A",
    "--follow",
    "--format=%aI",
    "--",
    relPath,
  ]);
  if (!raw) return null;
  const lines = raw.split("\n").filter(Boolean);
  const first = lines[lines.length - 1];
  if (!first) return null;
  const iso = toFrontmatterIso(new Date(first));
  if (!iso || iso < SITE_CONTENT_ERA_START) return null;
  return iso;
}

function gitChangedSince(baseSha, contentDir) {
  const relDir = path.relative(activeRepoRoot, contentDir);
  const raw = git(["diff", "--name-only", baseSha, "HEAD", "--", relDir]);
  return raw ? raw.split("\n").filter(Boolean) : [];
}

// ─── Frontmatter surgery (text-level: everything else stays byte-identical) ───

/** Split a file into its frontmatter block (without the --- fences) and body. */
export function splitFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { frontmatter: "", body: content, hasFrontmatter: false };
  }
  return {
    frontmatter: match[1],
    body: content.slice(match[0].length),
    hasFrontmatter: true,
  };
}

function upsertField(frontmatter, key, value) {
  const line = `${key}: ${value}`;
  const re = new RegExp(`^${key}:[ \\t]*.*$`, "m");
  if (re.test(frontmatter)) {
    return frontmatter.replace(re, line);
  }
  return frontmatter === "" ? line : `${frontmatter}\n${line}`;
}

function removeField(frontmatter, key) {
  const re = new RegExp(`^${key}:[ \\t]*.*$\\n?`, "m");
  return frontmatter.replace(re, "");
}

function joinFrontmatter(frontmatter, body) {
  return `---\n${frontmatter}\n---\n${body}`;
}

/** Whitespace-normalized body (frontmatter stripped): formatting-only edits compare equal. */
export function normalizeBody(body) {
  return body.replace(/\s+/g, " ").trim();
}

function parseDateValue(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const date = value instanceof Date ? value : new Date(String(value).trim());
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

function fieldRawValue(data, key) {
  const value = data[key];
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return toFrontmatterIso(value);
  return String(value).trim();
}

function isDraft(data) {
  return data.draft === true;
}

function collectionOf(relPath) {
  // relPath is repo-relative (`src/content/blog/x.md`) in the CLI, but
  // tests may pass a content-relative path (`blog/x.md`) — both work.
  const withoutPrefix = relPath.replace(/^src\/content\//, "");
  return withoutPrefix.split(path.sep)[0];
}

function isListingFile(relPath) {
  return path.basename(relPath).startsWith("-");
}

/**
 * Files that must never carry dates: homepage/sections collections,
 * and the `-index` listing stubs of the blog/authors collections.
 * About/contact `-index` files are NOT listings — they ARE the page
 * itself (their routes redirect to /404 when draft, exactly like a
 * regular page), so they carry dates like any published page.
 */
export function isDateExempt(relPath) {
  if (DATELESS_COLLECTIONS.has(collectionOf(relPath))) return true;
  const collection = collectionOf(relPath);
  return (
    isListingFile(relPath) &&
    (collection === "blog" || collection === "authors")
  );
}

// ─── Validation ──────────────────────────────────────────────────────────

/**
 * Validate one parsed file's dates. Returns a list of error strings
 * (empty = valid). Old fields are errors: they must be migrated, not
 * silently accepted.
 */
export function validateDates(relPath, data) {
  const errors = [];
  if (isDateExempt(relPath)) return errors;
  const old = OLD_DATE_FIELDS.filter((key) => data[key] !== undefined);
  if (old.length > 0) {
    errors.push(
      `uses removed field(s) ${old.join(", ")} — run \`pnpm dates:migrate\``,
    );
  }
  const created = parseDateValue(data.dateCreated);
  const published = parseDateValue(data.datePublished);
  const modified = parseDateValue(data.dateModified);
  if (data.dateCreated !== undefined && !created) {
    errors.push(`dateCreated is not a valid date: ${String(data.dateCreated)}`);
  }
  if (data.datePublished !== undefined && !published) {
    errors.push(
      `datePublished is not a valid date: ${String(data.datePublished)}`,
    );
  }
  if (data.dateModified !== undefined && !modified) {
    errors.push(
      `dateModified is not a valid date: ${String(data.dateModified)}`,
    );
  }
  if (!created) {
    errors.push("dateCreated is required");
  }
  const draft = isDraft(data);
  // Authors are profiles, not published articles: datePublished is
  // optional and never auto-set for them.
  const isAuthor = collectionOf(relPath) === "authors";
  if (draft && data.datePublished !== undefined) {
    errors.push("drafts must not have datePublished");
  }
  if (!draft && !isAuthor && !published) {
    errors.push("datePublished is required for published content");
  }
  if (!draft && !modified) {
    errors.push("dateModified is required for published content");
  }
  if (created && published && published < created) {
    errors.push("datePublished is before dateCreated");
  }
  if (published && modified && modified < published) {
    errors.push("dateModified is before datePublished");
  }
  if (created && modified && modified < created) {
    errors.push("dateModified is before dateCreated");
  }
  return errors.map((message) => `${relPath}: ${message}`);
}

// ─── Per-file processing ─────────────────────────────────────────────────

/**
 * Compute the frontmatter updates for one file. Returns
 * `{ changes: [{ key, value, reason }], warnings: [string] }` — the
 * caller applies them with `applyChanges`. `baseline` is the file's
 * content at the comparison revision (HEAD, or --since base); null
 * means the file is new. `now` is the timestamp to stamp with.
 */
export function computeChanges(relPath, content, baseline, now) {
  const warnings = [];
  const changes = [];
  if (isDateExempt(relPath)) return { changes, warnings };

  const parsed = matter(content);
  const data = parsed.data;
  const draft = isDraft(data);
  const isAuthor = collectionOf(relPath) === "authors";

  // 1. Migrate removed fields (same values, verbatim).
  const oldDate = fieldRawValue(data, "date");
  const oldUpdated = fieldRawValue(data, "updated");
  const oldLastmod = fieldRawValue(data, "lastmod");
  if (
    oldDate !== undefined ||
    oldUpdated !== undefined ||
    oldLastmod !== undefined
  ) {
    if (oldDate !== undefined && data.dateCreated === undefined) {
      changes.push({
        key: "dateCreated",
        value: oldDate,
        reason: "migrated from date",
      });
    }
    if (oldDate !== undefined && data.datePublished === undefined && !draft) {
      changes.push({
        key: "datePublished",
        value: oldDate,
        reason: "migrated from date",
      });
    }
    const migratedModified = oldUpdated ?? oldLastmod;
    if (migratedModified !== undefined && data.dateModified === undefined) {
      changes.push({
        key: "dateModified",
        value: migratedModified,
        reason: "migrated from updated/lastmod",
      });
    }
    for (const key of OLD_DATE_FIELDS) {
      if (data[key] !== undefined) {
        changes.push({ key, value: null, reason: "removed field" });
      }
    }
  }

  const effective = { ...data };
  for (const change of changes) {
    if (change.value === null) delete effective[change.key];
    else effective[change.key] = change.value;
  }

  // 2. Creation / first publication (new files, or tracked files missing dates).
  if (baseline === null) {
    if (effective.dateCreated === undefined) {
      changes.push({ key: "dateCreated", value: now, reason: "new file" });
      effective.dateCreated = now;
    }
    if (!draft && !isAuthor && effective.datePublished === undefined) {
      changes.push({
        key: "datePublished",
        value: now,
        reason: "first publication",
      });
      effective.datePublished = now;
    }
    if (!draft && effective.dateModified === undefined) {
      changes.push({
        key: "dateModified",
        value: effective.datePublished ?? now,
        reason: "first publication",
      });
      effective.dateModified = effective.datePublished ?? now;
    }
    return { changes, warnings };
  }

  // 3. Tracked file: recover missing dates from git history where honest.
  if (effective.dateCreated === undefined) {
    const firstAdd = gitFirstAddIso(relPath);
    if (firstAdd) {
      changes.push({
        key: "dateCreated",
        value: firstAdd,
        reason: "recovered from git history",
      });
      effective.dateCreated = firstAdd;
    } else {
      warnings.push(
        `${relPath}: dateCreated is missing and no reliable git creation date exists — left unset (run \`pnpm dates:migrate\` for the documented provisional fallback)`,
      );
    }
  }
  if (!draft && !isAuthor && effective.datePublished === undefined) {
    const firstAdd = gitFirstAddIso(relPath);
    if (firstAdd) {
      changes.push({
        key: "datePublished",
        value: firstAdd,
        reason: "recovered from git history",
      });
      effective.datePublished = firstAdd;
    } else {
      warnings.push(
        `${relPath}: datePublished is missing and no reliable git date exists — left unset (run \`pnpm dates:migrate\`)`,
      );
    }
  }

  // 4. Draft flip: publication sets datePublished (never dateCreated).
  const baselineData = baseline ? matter(baseline).data : {};
  if (
    isDraft(baselineData) &&
    !draft &&
    effective.datePublished === undefined
  ) {
    changes.push({
      key: "datePublished",
      value: now,
      reason: "first publication",
    });
    effective.datePublished = now;
  }
  if (isDraft(baselineData) && !draft && effective.dateModified === undefined) {
    changes.push({
      key: "dateModified",
      value: effective.datePublished ?? now,
      reason: "first publication",
    });
    effective.dateModified = effective.datePublished ?? now;
  }

  // 5. Meaningful edit: normalized body differs from the baseline.
  const bodyChanged =
    normalizeBody(parsed.content) !==
    normalizeBody(baseline ? matter(baseline).content : "");
  if (bodyChanged) {
    const currentModified = fieldRawValue(effective, "dateModified");
    if (currentModified !== now) {
      changes.push({
        key: "dateModified",
        value: now,
        reason: "meaningful content change",
      });
    }
  }
  return { changes, warnings };
}

/** Apply computed changes to file text (surgical frontmatter edits only). */
export function applyChanges(content, changes) {
  const { frontmatter, body, hasFrontmatter } = splitFrontmatter(content);
  let next = frontmatter;
  for (const change of changes) {
    next =
      change.value === null
        ? removeField(next, change.key)
        : upsertField(next, change.key, change.value);
  }
  if (!hasFrontmatter && next !== "") {
    return joinFrontmatter(next, body);
  }
  return joinFrontmatter(next, body);
}

function processOneFile(fullPath, relPath, options, baseline, now) {
  const content = fs.readFileSync(fullPath, "utf8");
  const { changes, warnings } = computeChanges(relPath, content, baseline, now);
  if (changes.length === 0) return { changed: false, changes, warnings };
  if (options.dryRun) return { changed: true, changes, warnings };
  fs.writeFileSync(fullPath, applyChanges(content, changes), "utf8");
  return { changed: true, changes, warnings };
}

// ─── Migration ───────────────────────────────────────────────────────────

/**
 * One-time migration. Like write mode, except dateless actual-content
 * files get ONE consistent provisional timestamp (same value for every
 * file) instead of being left unset. Returns the per-file report lines.
 */
export function migrateFile(relPath, content, provisionalIso) {
  if (isDateExempt(relPath)) return { changed: false, lines: [] };
  const parsed = matter(content);
  const data = parsed.data;
  const draft = isDraft(data);
  const isAuthor = collectionOf(relPath) === "authors";
  const lines = [];
  const changes = [];
  const note = (message) => lines.push(`${relPath}: ${message}`);

  const oldDate = fieldRawValue(data, "date");
  const oldUpdated = fieldRawValue(data, "updated");
  const oldLastmod = fieldRawValue(data, "lastmod");
  if (oldDate !== undefined) {
    changes.push({
      key: "dateCreated",
      value: oldDate,
      reason: "migrated from date",
    });
    if (!draft) {
      changes.push({
        key: "datePublished",
        value: oldDate,
        reason: "migrated from date",
      });
    }
    changes.push({
      key: "dateModified",
      value: oldUpdated ?? oldLastmod ?? oldDate,
      reason: "migrated from date",
    });
    for (const key of OLD_DATE_FIELDS) {
      if (data[key] !== undefined)
        changes.push({ key, value: null, reason: "removed field" });
    }
    note(
      `date ${oldDate} -> dateCreated + datePublished + dateModified (historical, exact)`,
    );
  } else {
    const firstAdd = gitFirstAddIso(relPath);
    const created = firstAdd ?? provisionalIso;
    const createdNote = firstAdd
      ? `git first-add ${firstAdd}`
      : `PROVISIONAL ${provisionalIso}`;
    if (data.dateCreated === undefined) {
      changes.push({ key: "dateCreated", value: created, reason: createdNote });
    }
    if (!draft && !isAuthor && data.datePublished === undefined) {
      changes.push({
        key: "datePublished",
        value: created,
        reason: createdNote,
      });
    }
    if (data.dateModified === undefined) {
      const modifiedValue =
        !draft && !isAuthor ? (data.datePublished ?? created) : created;
      changes.push({
        key: "dateModified",
        value: modifiedValue,
        reason: createdNote,
      });
    }
    note(`no historical date — dateCreated/dateModified set to ${createdNote}`);
  }
  return { changed: changes.length > 0, changes, lines };
}

// ─── CLI ─────────────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const contentDir = path.resolve(options.contentDir);
  // Anchor git to the content dir's repo (two levels up from src/content).
  activeRepoRoot = path.resolve(contentDir, "..", "..");
  const files =
    options.files.length > 0
      ? options.files.map((f) => path.resolve(f))
      : listContentFiles(contentDir);

  const stamp = nowIso();
  let changedCount = 0;
  let errorCount = 0;
  const warnings = [];
  const changedPaths = [];

  if (options.check) {
    for (const fullPath of files) {
      const relPath = path.relative(activeRepoRoot, fullPath);
      let parsed;
      try {
        parsed = matter(fs.readFileSync(fullPath, "utf8"));
      } catch (error) {
        console.error(`${relPath}: unparseable frontmatter: ${error.message}`);
        errorCount++;
        continue;
      }
      for (const error of validateDates(relPath, parsed.data)) {
        console.error(error);
        errorCount++;
      }
    }
    if (errorCount > 0) {
      console.error(
        `\ncontent-dates --check failed: ${errorCount} error(s). Run \`pnpm dates\` or \`pnpm dates:migrate\` to fix.`,
      );
      process.exitCode = 1;
    } else {
      console.log(
        `content-dates --check OK: ${files.length} file(s), all required dates present and consistent.`,
      );
    }
    return;
  }

  if (options.migrate) {
    const provisional = options.provisional
      ? toFrontmatterIso(options.provisional)
      : stamp;
    if (!provisional) {
      console.error("Invalid --provisional timestamp (need ISO 8601).");
      process.exitCode = 1;
      return;
    }
    console.log(
      `content-dates --migrate: provisional timestamp ${provisional}`,
    );
    for (const fullPath of files) {
      const relPath = path.relative(activeRepoRoot, fullPath);
      const content = fs.readFileSync(fullPath, "utf8");
      let result;
      try {
        result = migrateFile(relPath, content, provisional);
      } catch (error) {
        console.error(`${relPath}: ${error.message}`);
        errorCount++;
        continue;
      }
      for (const line of result.lines) console.log(line);
      if (!result.changed) continue;
      if (options.dryRun) {
        changedCount++;
        continue;
      }
      fs.writeFileSync(fullPath, applyChanges(content, result.changes), "utf8");
      changedCount++;
      changedPaths.push(relPath);
    }
    console.log(`content-dates --migrate: ${changedCount} file(s) changed.`);
    if (errorCount > 0) process.exitCode = 1;
    return;
  }

  // Write mode (default) — optionally scoped to a base revision (--since).
  // An all-zeros base (first push / force-push) means "no base": fall
  // back to plain write mode against HEAD instead of treating every
  // file as new.
  const sinceBase =
    options.since && options.since !== "0".repeat(40) ? options.since : null;
  const sinceNow = sinceBase ? (gitHeadCommitIso() ?? stamp) : stamp;
  const sinceChanged = sinceBase
    ? new Set(gitChangedSince(sinceBase, contentDir))
    : null;
  const useGit = gitAvailable();
  if (!useGit) {
    warnings.push(
      "git is not available — meaningful-change detection is skipped; only new-file dates are stamped.",
    );
  }

  for (const fullPath of files) {
    const relPath = path.relative(activeRepoRoot, fullPath);
    if (sinceChanged && !sinceChanged.has(relPath)) continue;
    let baseline = null;
    if (sinceBase) {
      baseline = gitShow(sinceBase, relPath);
    } else if (useGit) {
      baseline = gitShow("HEAD", relPath);
    }
    let result;
    try {
      result = processOneFile(fullPath, relPath, options, baseline, sinceNow);
    } catch (error) {
      console.error(`${relPath}: ${error.message}`);
      errorCount++;
      continue;
    }
    warnings.push(...result.warnings);
    if (!result.changed) continue;
    changedCount++;
    changedPaths.push(relPath);
    for (const change of result.changes) {
      console.log(
        `${relPath}: ${change.key} = ${change.value ?? "(removed)"} (${change.reason})`,
      );
    }
  }
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  if (options.stage && changedPaths.length > 0) {
    for (const relPath of changedPaths) {
      git(["add", "--", relPath]);
    }
    console.log(`staged ${changedPaths.length} file(s).`);
  }
  console.log(
    `content-dates: ${changedCount} file(s) changed, ${warnings.length} warning(s).`,
  );
  if (errorCount > 0) process.exitCode = 1;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
