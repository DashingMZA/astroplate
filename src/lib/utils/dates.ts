// Centralized date handling for Astroplate content.
//
// Single source of truth: every layout, page, feed and sitemap endpoint
// resolves its dates through here. Nothing here invents a date — a
// missing value stays missing (undefined) and callers omit the
// corresponding metadata instead of substituting "now" or the build
// time. All generated timestamps are ISO 8601 UTC ending in `Z`.
//
// The three frontmatter fields:
//   dateCreated   — set once at creation, never changes.
//   datePublished — set on first publication, never changes. Drafts
//                   have none.
//   dateModified  — latest meaningful modification; `datePublished`
//                   is the fallback where a modification date is
//                   required but none was ever recorded.

export interface ContentDatesInput {
  dateCreated?: Date | string | null;
  datePublished?: Date | string | null;
  dateModified?: Date | string | null;
}

export interface ResolvedContentDates {
  dateCreated?: Date;
  datePublished?: Date;
  /** Raw modification date — undefined when the content was never edited after publication. */
  dateModified?: Date;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Parse a frontmatter date value into a Date, or undefined when the
 * value is missing or invalid. Accepts Date objects (what Zod's
 * `z.coerce.date()` and gray-matter produce), ISO 8601 strings, and
 * legacy date-only values (`2026-11-14` parses as midnight UTC).
 * Never throws; never returns an invalid Date.
 */
export function parseContentDate(value: unknown): Date | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? undefined : value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const date = new Date(trimmed);
    return Number.isNaN(date.valueOf()) ? undefined : date;
  }
  return undefined;
}

/** ISO 8601 UTC string (`…Z`) for a date value, or undefined when invalid/missing. */
export function toIso(value?: Date | string | null): string | undefined {
  const date = parseContentDate(value);
  return date ? date.toISOString() : undefined;
}

/** Parse the three frontmatter fields; no fallbacks are applied here. */
export function resolveContentDates(
  input: ContentDatesInput,
): ResolvedContentDates {
  return {
    dateCreated: parseContentDate(input.dateCreated),
    datePublished: parseContentDate(input.datePublished),
    dateModified: parseContentDate(input.dateModified),
  };
}

/**
 * Latest meaningful modification: `dateModified`, else `datePublished`.
 * This is the value used for JSON-LD `dateModified`, Atom `<updated>`,
 * JSON Feed `date_modified` and sitemap `<lastmod>` — it is always a
 * genuine content date, never "now".
 */
export function lastChangeDate(dates: ResolvedContentDates): Date | undefined {
  return dates.dateModified ?? dates.datePublished;
}

/** Publication date, falling back to creation when nothing was ever published. */
export function publicationDate(dates: ResolvedContentDates): Date | undefined {
  return dates.datePublished ?? dates.dateCreated;
}

/** Sitemap `<lastmod>` for a post/page: `dateModified ?? datePublished`. */
export function contentLastmod(input: ContentDatesInput): Date | undefined {
  return lastChangeDate(resolveContentDates(input));
}

/** Sitemap `<lastmod>` for an author page: `dateModified ?? dateCreated` (authors have no publication date). */
export function authorLastmod(input: ContentDatesInput): Date | undefined {
  const dates = resolveContentDates(input);
  return dates.dateModified ?? dates.dateCreated;
}

/**
 * Display date in UTC, so a local build and a Vercel build (UTC) render
 * identically. The old `date-fns` formatting used the build machine's
 * local timezone, so the same post could show a different day.
 * Supported tokens: `dd`, `MMM`, `MM`, `yyyy`, `yy` (default pattern
 * matches the previous display format).
 */
export function formatDisplayDate(
  value: Date | string,
  pattern: string = "dd MMM, yyyy",
): string {
  const date = parseContentDate(value);
  if (!date) {
    return "";
  }
  const day = String(date.getUTCDate()).padStart(2, "0");
  const monthIndex = date.getUTCMonth();
  const month = String(monthIndex + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear());
  return pattern
    .replace("yyyy", year)
    .replace("yy", year.slice(-2))
    .replace("dd", day)
    .replace("MMM", MONTHS[monthIndex])
    .replace("MM", month);
}

/** Current UTC timestamp in ISO 8601 `Z` form, seconds precision (for generated frontmatter values — matches the existing content style, e.g. `2026-11-14T05:00:00Z`). */
export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
