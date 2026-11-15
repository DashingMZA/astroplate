// Content dates tests — the centralized date utility (src/lib/utils/dates.ts)
// and the auto-generation engine (scripts/manage-content-dates.mjs).
// The engine is exercised through its exported pure functions and through
// real subprocess runs in throwaway git repos under os.tmpdir() (never
// the real repo): the script re-anchors git to the content dir's repo,
// so temp runs cannot touch Astroplate's history.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const scriptPath = path.join(repoRoot, "scripts", "manage-content-dates.mjs");

const dates = await import("../src/lib/utils/dates.ts");
const script = await import("../scripts/manage-content-dates.mjs");
const {
  parseContentDate,
  toIso,
  resolveContentDates,
  lastChangeDate,
  publicationDate,
  contentLastmod,
  authorLastmod,
  formatDisplayDate,
  nowIso,
} = dates;
const {
  splitFrontmatter,
  applyChanges,
  normalizeBody,
  isDateExempt,
  validateDates,
  computeChanges,
} = script;

// ─── dates.ts ────────────────────────────────────────────────────────────

test("parseContentDate: Date, ISO string and date-only values; invalid yields undefined", () => {
  const d = new Date("2026-11-14T05:00:00Z");
  assert.deepEqual(parseContentDate(d), d);
  assert.deepEqual(
    parseContentDate("2026-11-14T05:00:00Z"),
    new Date("2026-11-14T05:00:00.000Z"),
  );
  assert.deepEqual(
    parseContentDate("2026-11-14"),
    new Date("2026-11-14T00:00:00.000Z"),
  );
  assert.equal(parseContentDate("not-a-date"), undefined);
  assert.equal(parseContentDate("2026-13-45T99:99:99Z"), undefined);
  assert.equal(parseContentDate(null), undefined);
  assert.equal(parseContentDate(undefined), undefined);
  assert.equal(parseContentDate(""), undefined);
});

test("toIso: ISO 8601 UTC with Z; invalid yields undefined", () => {
  assert.equal(toIso(new Date("2026-11-14T05:00:00Z")), "2026-11-14T05:00:00.000Z");
  assert.equal(toIso("2026-11-14T05:00:00Z"), "2026-11-14T05:00:00.000Z");
  assert.equal(toIso(null), undefined);
  assert.equal(toIso("garbage"), undefined);
});

test("resolveContentDates + lastChangeDate + publicationDate: documented fallbacks", () => {
  const full = resolveContentDates({
    dateCreated: "2026-11-10T05:00:00Z",
    datePublished: "2026-11-12T05:00:00Z",
    dateModified: "2026-11-15T05:00:00Z",
  });
  assert.deepEqual(lastChangeDate(full), new Date("2026-11-15T05:00:00.000Z"));
  assert.deepEqual(
    publicationDate(full),
    new Date("2026-11-12T05:00:00.000Z"),
  );
  // No modification recorded: last change is the publication date.
  const unmodified = resolveContentDates({
    dateCreated: "2026-11-10T05:00:00Z",
    datePublished: "2026-11-12T05:00:00Z",
  });
  assert.deepEqual(
    lastChangeDate(unmodified),
    new Date("2026-11-12T05:00:00.000Z"),
  );
  // Nothing published: publication falls back to creation.
  const draft = resolveContentDates({ dateCreated: "2026-11-10T05:00:00Z" });
  assert.deepEqual(
    publicationDate(draft),
    new Date("2026-11-10T05:00:00.000Z"),
  );
  assert.equal(lastChangeDate(draft), undefined);
  assert.equal(lastChangeDate(resolveContentDates({})), undefined);
});

test("contentLastmod: dateModified > datePublished; authorLastmod: dateModified > dateCreated", () => {
  assert.deepEqual(
    contentLastmod({
      dateCreated: "2026-11-10T05:00:00Z",
      datePublished: "2026-11-12T05:00:00Z",
      dateModified: "2026-11-15T05:00:00Z",
    }),
    new Date("2026-11-15T05:00:00.000Z"),
  );
  assert.deepEqual(
    contentLastmod({ datePublished: "2026-11-12T05:00:00Z" }),
    new Date("2026-11-12T05:00:00.000Z"),
  );
  assert.equal(contentLastmod({}), undefined);
  assert.equal(contentLastmod({ datePublished: "not-a-date" }), undefined);
  // Authors have no publication date: lastmod falls back to creation.
  assert.deepEqual(
    authorLastmod({
      dateCreated: "2026-11-14T21:23:35Z",
      dateModified: "2026-11-15T09:00:00Z",
    }),
    new Date("2026-11-15T09:00:00.000Z"),
  );
  assert.deepEqual(
    authorLastmod({ dateCreated: "2026-11-14T21:23:35Z" }),
    new Date("2026-11-14T21:23:35.000Z"),
  );
  assert.equal(authorLastmod({}), undefined);
});

test("formatDisplayDate renders in UTC (same date on any build machine)", () => {
  // 00:30 UTC is still the previous day in US timezones — a local-TZ
  // formatter would show "13 Nov, 2026" here.
  assert.equal(formatDisplayDate("2026-11-14T00:30:00Z"), "14 Nov, 2026");
  assert.equal(formatDisplayDate("2026-11-14T23:30:00Z"), "14 Nov, 2026");
  assert.equal(
    formatDisplayDate(new Date("2026-11-05T05:00:00Z")),
    "05 Nov, 2026",
  );
  assert.equal(formatDisplayDate("garbage"), "");
});

test("nowIso: UTC Z, seconds precision (matches existing content style)", () => {
  const value = nowIso();
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.ok(!Number.isNaN(new Date(value).valueOf()));
});

// ─── Script: frontmatter surgery ─────────────────────────────────────────

test("splitFrontmatter + applyChanges: surgical edits, body byte-identical", () => {
  const content = `---\ntitle: "T"\ndraft: false\n---\n\nBody with  *markdown*  and\n\n\ttabs.\n`;
  const { frontmatter, body, hasFrontmatter } = splitFrontmatter(content);
  assert.equal(hasFrontmatter, true);
  assert.equal(frontmatter, 'title: "T"\ndraft: false');
  assert.equal(body, "\nBody with  *markdown*  and\n\n\ttabs.\n");
  const changed = applyChanges(content, [
    { key: "dateCreated", value: "2026-11-14T05:00:00Z", reason: "test" },
    { key: "datePublished", value: "2026-11-14T05:00:00Z", reason: "test" },
  ]);
  assert.ok(changed.includes("dateCreated: 2026-11-14T05:00:00Z"));
  assert.ok(changed.endsWith("\nBody with  *markdown*  and\n\n\ttabs.\n"));
  // Replacing an existing key happens in place; removing one drops the line.
  const replaced = applyChanges(changed, [
    { key: "dateModified", value: "2026-11-15T05:00:00Z", reason: "test" },
    { key: "draft", value: null, reason: "test" },
  ]);
  assert.ok(replaced.includes("dateModified: 2026-11-15T05:00:00Z"));
  assert.ok(!replaced.split("\n").some((line) => line.startsWith("draft:")));
  assert.ok(replaced.includes('title: "T"'));
  // A file without frontmatter gains a block.
  const noFm = applyChanges("Just body.\n", [
    { key: "dateCreated", value: "2026-11-14T05:00:00Z", reason: "test" },
  ]);
  assert.ok(noFm.startsWith("---\ndateCreated: 2026-11-14T05:00:00Z\n---\n"));
  assert.ok(noFm.endsWith("Just body.\n"));
});

test("normalizeBody: formatting-only edits compare equal", () => {
  assert.equal(
    normalizeBody("Hello   world.\n\nSecond   line."),
    normalizeBody("Hello world. Second line."),
  );
  assert.notEqual(normalizeBody("Hello world."), normalizeBody("Hello Mars."));
});

// ─── Script: exemptions + validation ──────────────────────────────────────

test("isDateExempt: listings and generated collections stay dateless; about/contact pages do not", () => {
  assert.equal(isDateExempt("src/content/homepage/-index.md"), true);
  assert.equal(isDateExempt("src/content/sections/call-to-action.md"), true);
  assert.equal(isDateExempt("src/content/blog/-index.md"), true);
  assert.equal(isDateExempt("src/content/authors/-index.md"), true);
  assert.equal(isDateExempt("src/content/about/-index.md"), false);
  assert.equal(isDateExempt("src/content/contact/-index.md"), false);
  assert.equal(isDateExempt("src/content/blog/my-post.md"), false);
  assert.equal(isDateExempt("src/content/pages/privacy-policy.md"), false);
  assert.equal(isDateExempt("src/content/authors/jane.md"), false);
});

test("validateDates: published content needs all three; drafts need no datePublished; authors never need one", () => {
  const post = {
    dateCreated: "2026-11-10T05:00:00Z",
    datePublished: "2026-11-12T05:00:00Z",
    dateModified: "2026-11-15T05:00:00Z",
    draft: false,
  };
  assert.deepEqual(validateDates("src/content/blog/x.md", post), []);
  assert.deepEqual(
    validateDates("src/content/blog/x.md", { draft: false }),
    [
      "src/content/blog/x.md: dateCreated is required",
      "src/content/blog/x.md: datePublished is required for published content",
      "src/content/blog/x.md: dateModified is required for published content",
    ],
  );
  // Drafts: dateCreated only; a datePublished is an error.
  assert.deepEqual(
    validateDates("src/content/blog/x.md", {
      dateCreated: "2026-11-10T05:00:00Z",
      draft: true,
    }),
    [],
  );
  assert.deepEqual(
    validateDates("src/content/blog/x.md", {
      dateCreated: "2026-11-10T05:00:00Z",
      datePublished: "2026-11-12T05:00:00Z",
      draft: true,
    }),
    ["src/content/blog/x.md: drafts must not have datePublished"],
  );
  // Authors: datePublished is optional and never required.
  assert.deepEqual(
    validateDates("src/content/authors/jane.md", {
      dateCreated: "2026-11-14T21:23:35Z",
      dateModified: "2026-11-14T21:23:35Z",
    }),
    [],
  );
  // Inconsistent + invalid + removed fields are all errors.
  const bad = validateDates("src/content/blog/x.md", {
    dateCreated: "2026-11-12T05:00:00Z",
    datePublished: "2026-11-10T05:00:00Z",
    dateModified: "not-a-date",
    date: "2026-11-10T05:00:00Z",
    draft: false,
  });
  assert.ok(bad.some((e) => e.includes("uses removed field(s) date")));
  assert.ok(bad.some((e) => e.includes("not a valid date")));
  assert.ok(bad.some((e) => e.includes("datePublished is before dateCreated")));
  // Exempt files are never validated.
  assert.deepEqual(validateDates("src/content/blog/-index.md", {}), []);
  assert.deepEqual(validateDates("src/content/sections/x.md", {}), []);
});

// ─── Script: computeChanges (pure, no git when dates are present) ────────

test("computeChanges: new file gets all three dates (draft: dateCreated only); existing dates preserved", () => {
  const now = "2026-11-15T19:00:00Z";
  const fresh = computeChanges(
    "src/content/blog/new.md",
    `---\ntitle: New\ndraft: false\n---\n\nHello.\n`,
    null,
    now,
  );
  assert.deepEqual(
    fresh.changes.map((c) => [c.key, c.value]),
    [
      ["dateCreated", now],
      ["datePublished", now],
      ["dateModified", now],
    ],
  );
  const draft = computeChanges(
    "src/content/blog/draft.md",
    `---\ntitle: Draft\ndraft: true\n---\n\nHello.\n`,
    null,
    now,
  );
  assert.deepEqual(
    draft.changes.map((c) => [c.key, c.value]),
    [["dateCreated", now]],
  );
  // An existing dateCreated is never overwritten, even for a new file.
  const kept = computeChanges(
    "src/content/blog/kept.md",
    `---\ntitle: Kept\ndateCreated: 2026-11-01T05:00:00Z\ndraft: false\n---\n\nHello.\n`,
    null,
    now,
  );
  assert.ok(!kept.changes.some((c) => c.key === "dateCreated"));
  assert.ok(kept.changes.some((c) => c.key === "datePublished"));
});

test("computeChanges: tracked file — body change bumps dateModified, format-only does not, draft flip publishes", () => {
  const now = "2026-11-15T19:00:00Z";
  const head = `---\ntitle: Post\ndateCreated: 2026-11-10T05:00:00Z\ndatePublished: 2026-11-12T05:00:00Z\ndateModified: 2026-11-12T05:00:00Z\ndraft: false\n---\n\nOriginal body.\n`;
  const edited = head.replace("Original body.", "Edited body.");
  const bumped = computeChanges("src/content/blog/post.md", edited, head, now);
  assert.deepEqual(
    bumped.changes.map((c) => [c.key, c.value]),
    [["dateModified", now]],
  );
  // Whitespace-only reflow is not a meaningful change.
  const reformatted = head.replace("Original body.", "Original   body.");
  assert.deepEqual(
    computeChanges("src/content/blog/post.md", reformatted, head, now).changes,
    [],
  );
  // Frontmatter-only edit (no body change) does not bump dateModified.
  const fmOnly = head.replace("title: Post", "title: Post (v2)");
  assert.deepEqual(
    computeChanges("src/content/blog/post.md", fmOnly, head, now).changes,
    [],
  );
  // Draft flip: datePublished is set, dateCreated is untouched.
  const draftHead = `---\ntitle: Draft\ndateCreated: 2026-11-10T05:00:00Z\ndraft: true\n---\n\nBody.\n`;
  const published = draftHead.replace("draft: true", "draft: false");
  const flipped = computeChanges("src/content/blog/draft.md", published, draftHead, now);
  assert.ok(
    flipped.changes.some(
      (c) => c.key === "datePublished" && c.value === now,
    ),
  );
  assert.ok(!flipped.changes.some((c) => c.key === "dateCreated"));
  // Old `date` field migrates verbatim in write mode.
  const old = computeChanges(
    "src/content/blog/old.md",
    `---\ntitle: Old\ndate: 2026-11-13T05:00:00Z\ndraft: false\n---\n\nBody.\n`,
    null,
    now,
  );
  assert.ok(
    old.changes.some(
      (c) => c.key === "dateCreated" && c.value === "2026-11-13T05:00:00Z",
    ),
  );
  assert.ok(
    old.changes.some(
      (c) => c.key === "datePublished" && c.value === "2026-11-13T05:00:00Z",
    ),
  );
  assert.ok(old.changes.some((c) => c.key === "date" && c.value === null));
});

// ─── Script: CLI in throwaway git repos ──────────────────────────────────

function makeRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "content-dates-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
  }
  return dir;
}

function git(dir, args, env = {}) {
  return execFileSync("git", args, {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ...env },
  }).trim();
}

function runScript(dir, args) {
  try {
    const stdout = execFileSync("node", [scriptPath, ...args], {
      cwd: dir,
      encoding: "utf8",
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: error.status,
      stdout: error.stdout?.toString() ?? "",
      stderr: error.stderr?.toString() ?? "",
    };
  }
}

function contentDir(dir) {
  return path.join(dir, "src", "content");
}

test("CLI: --migrate converts old date, recovers author dates from git, flags provisional files; --check then passes", () => {
  const dir = makeRepo({
    "src/content/blog/old.md": `---\ntitle: Old\ndate: 2026-11-13T05:00:00Z\ndraft: false\n---\n\nBody.\n`,
    "src/content/authors/jane.md": `---\ntitle: Jane\ndraft: false\n---\n\nBio.\n`,
    "src/content/pages/legal.md": `---\ntitle: Legal\ndraft: false\n---\n\nLegal text.\n`,
    "src/content/blog/-index.md": `---\ntitle: Blog\ndraft: false\n---\n`,
  });
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "initial"], {
    GIT_AUTHOR_DATE: "2026-11-14T10:00:00Z",
    GIT_COMMITTER_DATE: "2026-11-14T10:00:00Z",
  });
  const before = git(dir, ["rev-parse", "HEAD"]);
  assert.ok(before.length === 40);

  const migrated = runScript(dir, [
    "--migrate",
    "--content-dir",
    contentDir(dir),
  ]);
  assert.equal(migrated.status, 0, migrated.stderr);
  assert.match(migrated.stdout, /provisional timestamp \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/);
  const provisional = migrated.stdout.match(
    /provisional timestamp (\S+)/,
  )[1];

  const post = fs.readFileSync(
    path.join(contentDir(dir), "blog", "old.md"),
    "utf8",
  );
  assert.ok(!post.includes("date: 2026-11-13"));
  assert.ok(post.includes("dateCreated: 2026-11-13T05:00:00Z"));
  assert.ok(post.includes("datePublished: 2026-11-13T05:00:00Z"));
  assert.ok(post.includes("dateModified: 2026-11-13T05:00:00Z"));

  // Author: git first-add (the commit above) — never provisional.
  const author = fs.readFileSync(
    path.join(contentDir(dir), "authors", "jane.md"),
    "utf8",
  );
  assert.ok(author.includes("dateCreated: 2026-11-14T10:00:00Z"));
  assert.ok(author.includes("dateModified: 2026-11-14T10:00:00Z"));
  assert.ok(!author.includes("datePublished"));

  // Legal page: first-add is the same commit, so it is historical too.
  const legal = fs.readFileSync(
    path.join(contentDir(dir), "pages", "legal.md"),
    "utf8",
  );
  assert.ok(legal.includes("dateCreated: 2026-11-14T10:00:00Z"));

  // Listing file untouched.
  const index = fs.readFileSync(
    path.join(contentDir(dir), "blog", "-index.md"),
    "utf8",
  );
  assert.ok(!index.includes("dateCreated"));

  const checked = runScript(dir, ["--check", "--content-dir", contentDir(dir)]);
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /--check OK/);
  assert.ok(provisional.endsWith("Z"));
});

test("CLI: write mode bumps dateModified on body edits only, preserves created/published, is idempotent", () => {
  const dir = makeRepo({
    "src/content/blog/post.md": `---\ntitle: Post\ndateCreated: 2026-11-10T05:00:00Z\ndatePublished: 2026-11-12T05:00:00Z\ndateModified: 2026-11-12T05:00:00Z\ndraft: false\n---\n\nOriginal body.\n`,
  });
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "initial"]);

  // Clean tree: no changes at all.
  const clean = runScript(dir, ["--content-dir", contentDir(dir)]);
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /0 file\(s\) changed/);

  // Body edit: dateModified bumps, the other two stay.
  const file = path.join(contentDir(dir), "blog", "post.md");
  fs.writeFileSync(
    file,
    fs.readFileSync(file, "utf8").replace("Original body.", "Edited body."),
    "utf8",
  );
  const edited = runScript(dir, ["--content-dir", contentDir(dir)]);
  assert.equal(edited.status, 0, edited.stderr);
  assert.match(edited.stdout, /1 file\(s\) changed/);
  const after = fs.readFileSync(file, "utf8");
  assert.ok(after.includes("dateCreated: 2026-11-10T05:00:00Z"));
  assert.ok(after.includes("datePublished: 2026-11-12T05:00:00Z"));
  assert.ok(!after.includes("dateModified: 2026-11-12T05:00:00Z"));
  assert.match(after, /dateModified: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/);

  // Once the edit is committed, the tree matches HEAD again and the
  // script is a no-op (idempotent): nothing is re-stamped.
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "edit post"]);
  const again = runScript(dir, ["--content-dir", contentDir(dir)]);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /0 file\(s\) changed/);
});

test("CLI: --since bumps dateModified for the pushed range only, using the commit date", () => {
  const dir = makeRepo({
    "src/content/blog/a.md": `---\ntitle: A\ndateCreated: 2026-11-10T05:00:00Z\ndatePublished: 2026-11-10T05:00:00Z\ndateModified: 2026-11-10T05:00:00Z\ndraft: false\n---\n\nA body.\n`,
    "src/content/blog/b.md": `---\ntitle: B\ndateCreated: 2026-11-10T05:00:00Z\ndatePublished: 2026-11-10T05:00:00Z\ndateModified: 2026-11-10T05:00:00Z\ndraft: false\n---\n\nB body.\n`,
  });
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "initial"], {
    GIT_AUTHOR_DATE: "2026-11-14T10:00:00Z",
    GIT_COMMITTER_DATE: "2026-11-14T10:00:00Z",
  });
  const base = git(dir, ["rev-parse", "HEAD"]);
  // Only A changes in the pushed range.
  const aFile = path.join(contentDir(dir), "blog", "a.md");
  fs.writeFileSync(
    aFile,
    fs.readFileSync(aFile, "utf8").replace("A body.", "A body, edited."),
    "utf8",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "edit A"], {
    GIT_AUTHOR_DATE: "2026-11-15T09:30:00Z",
    GIT_COMMITTER_DATE: "2026-11-15T09:30:00Z",
  });
  const result = runScript(dir, [
    "--since",
    base,
    "--content-dir",
    contentDir(dir),
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 file\(s\) changed/);
  const a = fs.readFileSync(aFile, "utf8");
  assert.ok(a.includes("dateModified: 2026-11-15T09:30:00Z"));
  assert.ok(a.includes("dateCreated: 2026-11-10T05:00:00Z"));
  const b = fs.readFileSync(path.join(contentDir(dir), "blog", "b.md"), "utf8");
  assert.ok(b.includes("dateModified: 2026-11-10T05:00:00Z"));
});

test("CLI: --check fails on a dateless published file; --dry-run changes nothing", () => {
  const dir = makeRepo({
    "src/content/blog/bare.md": `---\ntitle: Bare\ndraft: false\n---\n\nBody.\n`,
  });
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "initial"]);
  const checked = runScript(dir, ["--check", "--content-dir", contentDir(dir)]);
  assert.equal(checked.status, 1);
  assert.match(checked.stderr, /dateCreated is required/);
  const before = fs.readFileSync(
    path.join(contentDir(dir), "blog", "bare.md"),
    "utf8",
  );
  const dry = runScript(dir, [
    "--dry-run",
    "--content-dir",
    contentDir(dir),
  ]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(
    fs.readFileSync(path.join(contentDir(dir), "blog", "bare.md"), "utf8"),
    before,
  );
});

test("rendered Last updated: no hardcoded date line in any legal page", () => {
  for (const file of [
    "privacy-policy.md",
    "cookie-policy.md",
    "disclaimer.md",
    "terms-of-service.md",
  ]) {
    const body = fs.readFileSync(
      path.join(repoRoot, "src", "content", "pages", file),
      "utf8",
    );
    assert.doesNotMatch(body, /_Last updated:/, `${file} still hardcodes a date`);
  }
});

test("rendered Last updated: page templates show dateModified", () => {
  for (const file of ["[regular].astro", "about.astro", "contact.astro"]) {
    const source = fs.readFileSync(
      path.join(repoRoot, "src", "pages", file),
      "utf8",
    );
    assert.ok(source.includes("Last updated"), `${file} has no Last updated line`);
    assert.ok(
      source.includes("lastChangeDate(dates)"),
      `${file} does not derive the line from dateModified`,
    );
    assert.ok(source.includes("<time"), `${file} does not render a <time> element`);
  }
});
