# Content Dates — Migration Report

Internal migration report for the move from `date` / `updated` /
`lastmod` frontmatter to `dateCreated` / `datePublished` /
`dateModified` (ISO 8601 UTC, `…Z`).

Run: `node scripts/manage-content-dates.mjs --migrate` on 2026-11-15.
Provisional timestamp used by this run: **`2026-11-15T19:04:03Z`**
(the migration run time, one consistent value for every provisional
record).

## Status legend

- **Historical (exact)** — value copied verbatim from the old `date`
  field; the original timestamp is preserved.
- **Git first-add** — no old date field existed; the value is the
  file's first-add commit date from git history (in-era only).
- **PROVISIONAL** — no historical date could be recovered. The value
  is the migration timestamp above, NOT a verified historical date.
  These records must be reviewed and corrected before production
  launch. Correcting one is a frontmatter-only edit: change the three
  values in that file, nothing else moves.

## Migrated files (20)

### Blog posts — historical, exact (10)

Old `date` → `dateCreated` + `datePublished` + `dateModified`
(same value). The old `date` line was removed.

| File | dateCreated / datePublished / dateModified |
| --- | --- |
| `src/content/blog/astro-content-collections-complete-guide-managing-blog-content.md` | 2026-11-14T05:00:00Z |
| `src/content/blog/astro-islands-architecture-explained-partial-hydration-works.md` | 2026-11-13T05:00:00Z |
| `src/content/blog/technical-seo-astro-websites-sitemaps-canonicals-structured-data.md` | 2026-11-12T05:00:00Z |
| `src/content/blog/image-optimization-astro-webp-avif-responsive-images-cdn-delivery.md` | 2026-11-11T05:00:00Z |
| `src/content/blog/improve-core-web-vitals-astro-websites.md` | 2026-11-10T05:00:00Z |
| `src/content/blog/building-responsive-websites-tailwind-css-practical-guide.md` | 2026-11-09T05:00:00Z |
| `src/content/blog/deploying-astro-websites-cloudflare-workers-step-by-step-guide.md` | 2026-11-08T05:00:00Z |
| `src/content/blog/rss-vs-atom-vs-json-feed-which-format-should-website-support.md` | 2026-11-07T05:00:00Z |
| `src/content/blog/web-accessibility-astro-semantic-html-aria-keyboard-navigation.md` | 2026-11-06T05:00:00Z |
| `src/content/blog/build-scalable-website-design-system-astro-tailwind-css.md` | 2026-11-05T05:00:00Z |

Note: git first-add dates for these posts contradict the frontmatter
(all 10 were bulk-added in one commit, `606c6c6`, on 2026-11-14), so
git was not used for them — the frontmatter `date` is the source of
truth and was preserved exactly.

### Author profiles — git first-add (3)

`dateCreated` + `dateModified` from the file's first-add commit
(2026-11-14T13:23:35-08:00 = 2026-11-14T21:23:35Z, commit "fix:
feeds slim code blocks, llms.txt overhaul, real author/dates/
categories"). `datePublished` stays unset — author profiles are not
published articles.

| File | dateCreated / dateModified |
| --- | --- |
| `src/content/authors/muhammad-zaheer-ahmad.md` | 2026-11-14T21:23:35Z |
| `src/content/authors/muhammad-zaheer.md` | 2026-11-14T21:23:35Z |
| `src/content/authors/zaheer-ahmad.md` | 2026-11-14T21:23:35Z |

### Legal pages — git first-add (3)

`dateCreated` + `datePublished` + `dateModified` from the file's
first-add commit (2026-11-14T14:14:06-08:00 = 2026-11-14T22:14:06Z,
commit "feat: real About page + AdSense legal pages, footer links
via menu.json").

| File | dateCreated / datePublished / dateModified |
| --- | --- |
| `src/content/pages/cookie-policy.md` | 2026-11-14T22:14:06Z |
| `src/content/pages/disclaimer.md` | 2026-11-14T22:14:06Z |
| `src/content/pages/terms-of-service.md` | 2026-11-14T22:14:06Z |

## PROVISIONAL records (4) — review before production launch

These files existed in the 2023 theme import ("initialize project",
2023-04-17), so their git first-add dates are theme dates, not
content dates, and were rejected by the migration guard (first-add
must be ≥ 2026-11-01). Their content was rewritten in November 2026,
but no reliable timestamp for that rewrite exists in git, so all
three fields carry the migration timestamp.

| File | dateCreated / datePublished / dateModified |
| --- | --- |
| `src/content/about/-index.md` | **2026-11-15T19:04:03Z (PROVISIONAL)** |
| `src/content/contact/-index.md` | **2026-11-15T19:04:03Z (PROVISIONAL)** |
| `src/content/pages/elements.mdx` | **2026-11-15T19:04:03Z (PROVISIONAL)** |
| `src/content/pages/privacy-policy.md` | **2026-11-15T19:04:03Z (PROVISIONAL)** |

To correct a provisional record, edit the three frontmatter values
in that file to the real dates (creation, first publication, last
meaningful modification). Nothing else changes — no other file, no
URL, no sitemap filename. After correcting, run
`pnpm dates:check` to confirm the values are consistent
(`datePublished >= dateCreated`, `dateModified >= datePublished`).

Note: the 4 legal pages still carry hardcoded body lines
"_Last updated: November 14, 2026_". Those lines predate this
migration and were left untouched; they will be removed once the
regular page template renders `dateModified` from frontmatter.

## Untouched files (5) — dateless by design

| File | Reason |
| --- | --- |
| `src/content/blog/-index.md` | Listing stub (blog index) |
| `src/content/authors/-index.md` | Listing stub (authors index) |
| `src/content/homepage/-index.md` | Homepage (generated content, no dates) |
| `src/content/sections/call-to-action.md` | Section (generated content) |
| `src/content/sections/testimonial.md` | Section (generated content) |

## Verification

- `pnpm dates:check` after migration: OK — 25 files, all required
  dates present and consistent.
- No `date:` / `updated:` / `lastmod:` frontmatter remains in
  `src/content/` (only the three new fields).
- The migration changed frontmatter only: no body text, URL, slug,
  or image reference was touched (20 files, frontmatter lines only).
