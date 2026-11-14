// JSON Feed tests — the endpoint shapes the shared entries into JSON
// Feed 1.1, so source-marker tests pin the required structure, and the
// production build + dist/feed.json validation verifies the live output
// instead (`astro:content` / `astro/container` cannot run under plain
// `node --test`).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

// ─── JSON Feed endpoint ────────────────────────────────────────────────────

test("feed.json.ts: JSON Feed 1.1 structure from the shared pipeline", () => {
  const src = read("src/pages/feed.json.ts");
  for (const marker of [
    "getFeedEntries()",
    'version: "https://jsonfeed.org/version/1.1"',
    'home_page_url: absoluteUrl("/")',
    "feed_url: absoluteUrl(FEED_PATH)",
    "language: toBcp47(config.site.locale",
    "icon: absoluteUrl(config.site.logo)",
    "favicon: absoluteUrl(config.site.favicon)",
    "id: e.url",
    "url: e.url",
    "content_html: e.contentHtml",
    "content_text: e.summary || e.title",
    "summary: e.summary",
    "image: e.image",
    "date_published: e.published.toISOString()",
    "date_modified: e.modified.toISOString()",
    "authors: e.authors.map((a) => ({",
    "tags: e.categories",
    '"Content-Type": "application/feed+json; charset=utf-8"',
    "JSON.stringify(feed, null, 2)",
  ]) {
    assert.ok(src.includes(marker), `feed.json.ts must contain: ${marker}`);
  }
});

test("feed.json.ts: no non-standard top-level description, no emails, no hard-coded domain", () => {
  const src = read("src/pages/feed.json.ts");
  assert.ok(
    !src.includes("description"),
    "JSON Feed 1.1 has no top-level description field",
  );
  assert.ok(!src.includes("jadoo.bond"), "must not hard-code the domain");
  assert.ok(!src.includes("mailto:"), "must not expose emails");
  assert.ok(
    !src.includes("getCollection("),
    "entries must come from the shared pipeline (getFeedEntries)",
  );
  assert.ok(
    !src.includes("experimental_AstroContainer"),
    "rendering must happen once in the shared pipeline, not per endpoint",
  );
});
