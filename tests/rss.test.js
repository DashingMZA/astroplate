// RSS feed tests — the pure helpers in src/lib/utils/rss.ts are tested
// directly (no re-implemented logic), and the endpoint file is covered by
// source-marker tests: `astro:content` / `astro/container` cannot run
// under plain `node --test`, so the endpoint itself is verified by the
// production build + dist/rss.xml validation instead.
import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// rss.ts imports `@/` aliases and JSON — the loader hooks (./json-hooks.mjs)
// resolve those for plain Node, as in seo.test.js.
register("./json-hooks.mjs", import.meta.url);
const rssHelpers = await import("../src/lib/utils/rss.ts");
const {
  authorElements,
  mediaMimeType,
  mediaTags,
  sanitizeFeedHtml,
  toRssLanguage,
} = rssHelpers;

// ─── Feed language ───────────────────────────────────────────────────────

test("toRssLanguage: locale wins, underscore becomes hyphen, lowercased", () => {
  assert.equal(toRssLanguage("en_US", "en"), "en-us");
  assert.equal(toRssLanguage("fr_FR", "fr"), "fr-fr");
  assert.equal(toRssLanguage(null, "fr"), "fr");
  assert.equal(toRssLanguage(null, null), "en");
  assert.equal(toRssLanguage("EN_us", null), "en-us");
});

// ─── Media MIME types ────────────────────────────────────────────────────

test("mediaMimeType: image extensions map to MIME types", () => {
  assert.equal(mediaMimeType("https://x.test/a.jpg"), "image/jpeg");
  assert.equal(mediaMimeType("https://x.test/a.jpeg"), "image/jpeg");
  assert.equal(mediaMimeType("https://x.test/a.PNG"), "image/png");
  assert.equal(mediaMimeType("https://x.test/a.webp"), "image/webp");
  assert.equal(mediaMimeType("https://x.test/a.gif"), "image/gif");
  assert.equal(mediaMimeType("https://x.test/a.avif"), "image/avif");
  assert.equal(mediaMimeType("https://x.test/a.svg"), "image/svg+xml");
});

test("mediaMimeType: query/fragment ignored, unknown types return null", () => {
  assert.equal(mediaMimeType("https://x.test/a.jpg?v=2#frag"), "image/jpeg");
  assert.equal(mediaMimeType("https://x.test/a.bmp"), null);
  assert.equal(mediaMimeType("https://x.test/noext"), null);
});

// ─── Media RSS tags ──────────────────────────────────────────────────────

test("mediaTags: og_image wins, absolutized, with type + thumbnail", () => {
  const tags = mediaTags({
    og_image: "/images/r2-example-og.jpg",
    image: "/images/r2-example.jpg",
  });
  assert.match(
    tags,
    /media:content url="https:\/\/astroplate\.jadoo\.bond\/images\/r2-example-og\.jpg" medium="image" type="image\/jpeg"/,
  );
  assert.match(
    tags,
    /media:thumbnail url="https:\/\/astroplate\.jadoo\.bond\/images\/r2-example-og\.jpg"/,
  );
});

test("mediaTags: image alone is used; remote URLs pass through unchanged", () => {
  const tags = mediaTags({ image: "https://media.csofts.tech/images/x.png" });
  assert.match(
    tags,
    /media:content url="https:\/\/media\.csofts\.tech\/images\/x\.png" medium="image" type="image\/png"/,
  );
  assert.match(
    tags,
    /media:thumbnail url="https:\/\/media\.csofts\.tech\/images\/x\.png"/,
  );
});

test("mediaTags: no own image means no tags (site default is not a featured image)", () => {
  assert.equal(mediaTags({}), "");
  assert.equal(mediaTags({ og_image: null, image: null }), "");
});

test("mediaTags: unknown extension omits type but keeps url + medium", () => {
  const tags = mediaTags({ image: "/images/x.bmp" });
  assert.match(tags, /media:content url="[^"]+" medium="image" \/>/);
  assert.doesNotMatch(tags, /type=/);
});

// ─── Author elements ─────────────────────────────────────────────────────

test("authorElements: email author gets <author>, name gets dc:creator", () => {
  const result = authorElements([
    {
      name: "John Doe",
      entry: { data: { email: "johndoe@email.com" } },
      url: "/authors/john-doe",
    },
  ]);
  assert.equal(result.author, "johndoe@email.com (John Doe)");
  assert.equal(result.dcCreators, "<dc:creator>John Doe</dc:creator>");
});

test("authorElements: no email means no <author>, dc:creator still emitted", () => {
  const result = authorElements([{ name: "Admin", entry: null, url: null }]);
  assert.equal("author" in result, false);
  assert.equal(result.dcCreators, "<dc:creator>Admin</dc:creator>");
});

test("authorElements: several authors, first email wins <author>", () => {
  const result = authorElements([
    { name: "Admin", entry: null, url: null },
    {
      name: "John Doe",
      entry: { data: { email: "johndoe@email.com" } },
      url: "/authors/john-doe",
    },
    {
      name: "Sam Wilson",
      entry: { data: { email: "sam@email.com" } },
      url: "/authors/sam-wilson",
    },
  ]);
  assert.equal(result.author, "johndoe@email.com (John Doe)");
  assert.equal(
    result.dcCreators,
    [
      "<dc:creator>Admin</dc:creator>",
      "<dc:creator>John Doe</dc:creator>",
      "<dc:creator>Sam Wilson</dc:creator>",
    ].join("\n"),
  );
});

test("authorElements: names are XML-escaped", () => {
  const result = authorElements([
    { name: "Tom & Jerry", entry: null, url: null },
  ]);
  assert.equal(result.dcCreators, "<dc:creator>Tom &amp; Jerry</dc:creator>");
});

// ─── Feed HTML sanitization ──────────────────────────────────────────────

test("sanitizeFeedHtml: scripts, event handlers and javascript: links are stripped", () => {
  const out = sanitizeFeedHtml(
    '<p onclick="evil()">Hi</p><script>alert(1)</script><a href="javascript:evil()">x</a>',
  );
  assert.doesNotMatch(out, /script|onclick|javascript:/i);
  assert.match(out, /<p>Hi<\/p>/);
  assert.match(out, /<a>x<\/a>/);
});

test("sanitizeFeedHtml: markup, code classes and heading ids survive", () => {
  const out = sanitizeFeedHtml(
    '<h2 id="creative-design">Creative Design</h2><pre><code class="language-js">const a = 1;</code></pre><blockquote>quoted</blockquote>',
  );
  assert.match(out, /<h2 id="creative-design">Creative Design<\/h2>/);
  assert.match(out, /<code class="language-js">/);
  assert.match(out, /<blockquote>quoted<\/blockquote>/);
});

test("sanitizeFeedHtml: relative image/link URLs become absolute", () => {
  const out = sanitizeFeedHtml(
    '<p><img src="/images/r2-example.jpg" alt="demo" /><a href="/blog/post-1">post</a></p>',
  );
  assert.match(
    out,
    /src="https:\/\/astroplate\.jadoo\.bond\/images\/r2-example\.jpg"/,
  );
  assert.match(out, /href="https:\/\/astroplate\.jadoo\.bond\/blog\/post-1"/);
});

test("sanitizeFeedHtml: absolute remote URLs pass through unchanged", () => {
  const out = sanitizeFeedHtml(
    '<img src="https://media.csofts.tech/images/x.jpg" alt="x" />',
  );
  assert.match(out, /src="https:\/\/media\.csofts\.tech\/images\/x\.jpg"/);
});

// ─── Endpoint markers ────────────────────────────────────────────────────

test("rss.xml.ts: renders real post HTML, sanitizes it, emits media + author metadata", () => {
  const src = fs.readFileSync(
    path.join(repoRoot, "src/pages/rss.xml.ts"),
    "utf8",
  );
  for (const marker of [
    "experimental_AstroContainer",
    "render(post)",
    "renderToString(Content)",
    "sanitizeFeedHtml",
    "content",
    "mediaTags(post.data)",
    "authorElements(",
    "displayAuthorNames(post)",
    "toRssLanguage(config.site.locale",
    "absoluteUrl(FEED_PATH)",
    "trailingSlash: Boolean(config.site.trailing_slash)",
    "<lastBuildDate>",
    "<ttl>",
    "<atom:link",
    'media: "http://search.yahoo.com/mrss/"',
  ]) {
    assert.ok(src.includes(marker), `rss.xml.ts must contain: ${marker}`);
  }
});

test("rss.xml.ts: no hard-coded domain, language, or invalid author", () => {
  const src = fs.readFileSync(
    path.join(repoRoot, "src/pages/rss.xml.ts"),
    "utf8",
  );
  assert.ok(!src.includes("jadoo.bond"), "must not hard-code the domain");
  assert.ok(!src.includes('"en-us"'), "language must come from config");
  assert.ok(
    !src.includes("author: post.data.author"),
    "display names must not go into RSS <author>",
  );
  assert.ok(
    !src.includes("new URL(FEED_PATH"),
    "feed URL must keep base_path (absoluteUrl, not new URL)",
  );
});
