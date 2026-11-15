# Content Dates

Centralized date management for all Astroplate content. One set of
fields, one utility, one automation script — every surface (pages,
JSON-LD, Open Graph, sitemaps, feeds, cards, sorting) reads the same
dates, so the same content can never show different dates in different
places.

## The three fields

| Field | Meaning | Rules |
| --- | --- | --- |
| `dateCreated` | Original creation date | Set once, never changes |
| `datePublished` | First public publication date | Set on first publication, never changes. Drafts have none |
| `dateModified` | Latest meaningful modification | Updated on meaningful content change only |

All three are ISO 8601 UTC timestamps ending in `Z`
(`2026-11-14T05:00:00Z`). Date-only values (`2026-11-14`) are
accepted for backwards compatibility and mean midnight UTC. The old
fields `date`, `updated`, and `lastmod` are removed — the sitemap
`<lastmod>` XML element name is unchanged (serialization only).

### Per content type

| Content type | dateCreated | datePublished | dateModified |
| --- | --- | --- | --- |
| Blog articles | Yes | Yes | Yes |
| Static pages (`pages`, incl. legal) | Yes | Yes | Yes |
| About page | Yes | Yes | Yes |
| Contact page | Yes | Yes | Yes |
| Author profiles | Yes | Optional (never auto-set) | Yes |
| Categories / tags | — | — | — (taxonomy only, no files exist) |
| Homepage, blog/authors `-index`, sections | — | — | — (listing/generated content) |
| 404 / search / pagination | — | — | — |

Author profiles are not published articles: profile creation is
never treated as publication. Category/tag archive pages carry no
`lastmod` in the sitemap because they have no content dates of their
own (their `dateModified` would have to mean "some other article was
published", which is not a change to the category itself).

### Where each date surfaces

| Surface | Value |
| --- | --- |
| Article page display | `datePublished`; "Updated <date>" only when `dateModified` differs from `datePublished` |
| Blog cards | `datePublished` |
| JSON-LD `BlogPosting` | `dateCreated`, `datePublished`, `dateModified` (`dateModified` falls back to `datePublished`) |
| JSON-LD `WebPage` (regular/about/contact pages) | Same three fields |
| JSON-LD `Person` (author pages) | No dates |
| OG `article:published_time` / `article:modified_time` | `datePublished` / `dateModified ?? datePublished`, only when present |
| Sitemap `<lastmod>` | Posts/pages: `dateModified ?? datePublished`; authors: `dateModified ?? dateCreated`; categories/tags: none; homepage: none |
| RSS `pubDate` / channel `lastBuildDate` | `datePublished` / newest `dateModified ?? datePublished` |
| Atom `<published>` / `<updated>` | `datePublished` / `dateModified ?? datePublished` (feed `<updated>` falls back to the feed's newest change) |
| JSON Feed `date_published` / `date_modified` | Same as Atom |
| Sorting (blog lists, related posts, feeds, search index, llms.txt) | `datePublished`, creation only as a fallback |
| Future-date exclusion | `datePublished` (creation as fallback) in the future hides the entry until then |

Missing dates are omitted, never `null`, empty, or the build time.
Display dates render in UTC (`src/lib/utils/dates.ts`
`formatDisplayDate`), so a local build and a Vercel build show the
same day. The only former build-timestamp leak — the RSS
`lastBuildDate` falling back to build time when no post had a date —
is removed: the tag is omitted instead.

## Required-ness: schema vs build validation

The three fields are **optional in the Zod schema**
(`src/content.config.ts`, `z.coerce.date().optional()`). That is
deliberate: `-index` listing files share the same collection schemas
and must stay dateless, so schema-level `required` would break the
build for them. Required-ness is enforced by the prebuild check
instead (see below), which has full file context — collection, path,
draft status, `-index` detection — and fails the build on missing,
invalid, or inconsistent required dates for published content:

- `dateCreated` required for every non-exempt file.
- `datePublished` required when not a draft (and forbidden on drafts);
  never required for authors.
- `dateModified` required when not a draft.
- `datePublished >= dateCreated`, `dateModified >= datePublished`,
  `dateModified >= dateCreated` when both sides exist.

## Central utility — `src/lib/utils/dates.ts`

The single source of truth. No other file parses or formats a content
date.

- `parseContentDate` — Date / ISO string / date-only → `Date`, or
  `undefined` when missing/invalid (never throws).
- `toIso` — ISO 8601 `Z` string, or `undefined`.
- `resolveContentDates` — parses the three fields (no fallbacks).
- `lastChangeDate` — `dateModified ?? datePublished`.
- `publicationDate` — `datePublished ?? dateCreated`.
- `contentLastmod` / `authorLastmod` — sitemap lastmod per type.
- `formatDisplayDate` — UTC display formatting (`dd MMM, yyyy`).
- `nowIso` — current UTC timestamp, seconds precision.

Consumers: `src/lib/utils/jsonld.ts` (`toIso`, `dateCreated`,
`WebPage` builder), `src/layouts/Base.astro` (OG article times),
`src/pages/blog/[single].astro`, `src/pages/[regular].astro`,
`src/pages/about.astro`, `src/pages/contact.astro`,
`src/lib/utils/feed-entries.ts`, `src/lib/utils/rss.ts`
(`latestChangeDate`, `sortFeedPosts`), `src/lib/seo/sitemap/collectors.ts`,
`src/lib/utils/sortFunctions.ts`, `src/lib/utils/similarItems.ts`,
`src/lib/contentParser.ts`, `scripts/jsonGenerator.js`,
`scripts/llmsGenerator.js`, `src/layouts/PostSingle.astro`,
`src/layouts/components/BlogCard.astro`, `src/lib/utils/dateFormat.ts`
(thin delegate — kept so callers don't change).

## Automation — `scripts/manage-content-dates.mjs`

One script, shared by every workflow (local, hook, GitHub Action).
Reads with gray-matter, writes with surgical frontmatter line edits
(the rest of the file stays byte-identical).

```bash
pnpm dates            # stamp missing dates, bump dateModified on edits
pnpm dates:check      # validate only; exit 1 on violations (runs in prebuild)
pnpm dates:migrate    # one-time migration (see CONTENT_DATES_MIGRATION.md)
pnpm dates --dry-run  # show what would change, change nothing
```

Rules:

- **Never overwrite** `dateCreated` / `datePublished` once set.
- **New file** (untracked or missing `dateCreated`): `dateCreated`
  is stamped; a non-draft also gets `datePublished` and
  `dateModified` (both = creation time); a draft gets `dateCreated`
  only.
- **First publication** (draft flips to published): `datePublished`
  is stamped only if missing; `dateCreated` is untouched.
- **Meaningful edit**: the Markdown/MDX body (frontmatter stripped,
  whitespace normalized) is compared against HEAD via
  `git show HEAD:<path>`; a difference bumps `dateModified` to now.
  A typo fix and a full rewrite both count — semantic significance
  cannot be judged. Formatting-only (Prettier) changes and
  frontmatter-only edits do not bump it.
- **Missing dates on tracked files** are recovered from git
  first-add (`git log --diff-filter=A`) only when the first-add date
  is on or after `2026-11-01` (the site-content era). The 2023
  theme-import dates are not content dates and are never used.
  Anything unrecoverable is left unset with a warning — the script
  never invents a historical date (use `--migrate` for the
  documented provisional fallback).
- **Old fields** (`date` / `updated` / `lastmod`) are migrated
  verbatim in write mode (`date` → `dateCreated` + `datePublished`,
  `updated`/`lastmod` → `dateModified`); `--check` errors on them
  instead of silently accepting them.
- **No git available**: write mode skips change detection with a
  warning and still stamps new files; `--check` works (pure
  frontmatter parsing).

### Pre-commit hook (`.husky/pre-commit`)

Runs `node scripts/manage-content-dates.mjs --stage` on every commit
and re-stages the files it touched, so the date stamps land in the
same commit as the edit. Installed by `pnpm install` via the
`prepare` script (`husky`). Note: `git add` stages the whole touched
file — if a content file has unstaged hunks you meant to keep out of
the commit, unstage them after the hook runs.

### GitHub Action (`.github/workflows/content-dates.yml`)

For web-UI edits (and any push that bypasses the local hook): on push
to `main` touching `src/content/**`, it runs the same script with
`--since ${{ github.event.before }}` (body compared against the
pushed base; `dateModified` stamped with the HEAD commit's date, not
the Action run time) and commits the result back as
`chore(content-dates): update dateModified [skip ci]`. Loop
protection: the `[skip ci]` message skips every push-triggered
workflow (including this one), and the job does not run for pushes by
`github-actions[bot]`. An all-zeros base (first push / force-push)
falls back to plain write mode against HEAD.

### Prebuild check (`prebuild` script)

`pnpm build` runs `node scripts/manage-content-dates.mjs --check`
before the WebP converter. On a clean tree (Vercel / CI fresh clone)
the check is pure validation — it never writes, so a build can never
rewrite historical dates. A build fails loudly on a missing, invalid,
or inconsistent required date instead of publishing a dateless page.

## Workflows covered

- Local editing (VS Code, Cursor, Claude Code, manual, git):
  pre-commit hook stamps dates at commit time.
- GitHub web-UI edits: the Action stamps them after push.
- New post / new page: created with all three dates at first commit.
- Draft → publish: `datePublished` stamped, `dateCreated` kept.
- Edit after publication: `dateModified` bumped, the other two kept.
- Formatting-only / frontmatter-only change: no date change.
- Generation scripts / CMS output: run `pnpm dates` after writing
  files; the same rules apply.
- `pnpm dev`: does not run `prebuild`, so dates stamp at commit or
  build time, not while editing in dev.

## Limitations (honest)

- "Meaningful" means any non-whitespace body change. The script
  cannot tell a typo fix from a rewrite, and it cannot detect an
  edit that only rewords without changing the normalized body (it
  does not — whitespace normalization is the only tolerance).
- Edits made outside git (a file copied in with no history) have no
  HEAD to diff against: the file is treated as new, so `dateCreated`
  is stamped at first sight, not at its real creation.
- The Action only runs on pushes to `main` that touch
  `src/content/**`. Content changed on another branch gets stamped
  when the branch merges (the merge push covers it) or by the local
  hook.
- The Action needs `fetch-depth: 0` (full history) to diff against
  the pushed base; a shallow checkout would make `--since` fall back
  to write mode against HEAD.
- Categories/tags have no content files, so they can never have
  frontmatter dates; their sitemap entries carry no `lastmod` and
  their archive pages show no dates. A separate derived listing
  timestamp (newest post in the category) is not tracked.
- The 4 legal pages still carry hardcoded body lines
  "_Last updated: November 14, 2026_". They stay until the regular
  page template renders `dateModified` from frontmatter.
- `date-fns` was removed: display formatting is now the UTC
  formatter in `dates.ts`. Only the `dd MMM, yyyy` pattern (and
  `MM`/`yy` variants) is supported.

## Tests

`tests/content-dates.test.js` (16 tests): the utility, frontmatter
surgery, exemptions/validation, `computeChanges` rules, and CLI
end-to-end runs in throwaway git repos (migration, write-mode
idempotency, `--since`, `--check` failure, `--dry-run`). Updated
suites: `tests/sitemap.test.js` (lastmod priority, author lastmod),
`tests/rss.test.js` (no build-time fallback), `tests/atom.test.js`
(markers), `tests/seo.test.js` (JSON-LD dates, search-index fixtures).
Run with `pnpm test`.
