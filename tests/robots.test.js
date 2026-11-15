// Robots indexing tests — resolveRobotsIndex + robotsMetaContent
// (src/lib/utils/robots.ts). Defaults come from config.json
// (robots.index: pages/blogPosts true, authors/tags/categories/blogArchives false).
import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

register("./json-hooks.mjs", import.meta.url);
const { resolveRobotsIndex, robotsMetaContent } = await import(
  "../src/lib/utils/robots.ts"
);

test("resolveRobotsIndex: frontmatter wins over the config default", () => {
  // Blog posts default to index, but an explicit false opts out.
  assert.equal(resolveRobotsIndex("blogPosts"), true);
  assert.equal(resolveRobotsIndex("blogPosts", false), false);
  // Authors default to noindex, but an explicit true opts in.
  assert.equal(resolveRobotsIndex("authors"), false);
  assert.equal(resolveRobotsIndex("authors", true), true);
  // Unset frontmatter (null/undefined) falls back to the config default.
  assert.equal(resolveRobotsIndex("tags", null), false);
  assert.equal(resolveRobotsIndex("tags", undefined), false);
  assert.equal(resolveRobotsIndex("pages"), true);
  assert.equal(resolveRobotsIndex("categories"), false);
  assert.equal(resolveRobotsIndex("blogArchives"), false);
});

test("robotsMetaContent: exact index / noindex variants", () => {
  assert.equal(
    robotsMetaContent(true),
    "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
  );
  assert.equal(
    robotsMetaContent(false),
    "noindex, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1",
  );
});
