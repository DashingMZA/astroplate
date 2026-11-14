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
  dcCreatorTags,
  latestChangeDate,
  localImageDimensions,
  mediaMimeType,
  mediaTags,
  sanitizeFeedHtml,
  sortFeedPosts,
  stripCodeHighlighting,
  toBcp47,
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
test("toBcp47: locale wins, underscore becomes hyphen, region keeps case", () => {
  assert.equal(toBcp47("en_US", "en"), "en-US");
  assert.equal(toBcp47("fr_FR", "fr"), "fr-FR");
  assert.equal(toBcp47(null, "fr"), "fr");
  assert.equal(toBcp47(null, null), "en");
  assert.equal(toBcp47("EN_us", null), "EN-us");
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

// ─── Creator tags (no <author> — emails are never exposed) ───────────────

test("dcCreatorTags: each author name gets one dc:creator", () => {
  assert.equal(
    dcCreatorTags(["John Doe", "Admin"]),
    "<dc:creator>John Doe</dc:creator>\n<dc:creator>Admin</dc:creator>",
  );
});

test("dcCreatorTags: names are trimmed and XML-escaped, empty list gives empty string", () => {
  assert.equal(
    dcCreatorTags(["  Tom & Jerry  ", ""]),
    "<dc:creator>Tom &amp; Jerry</dc:creator>",
  );
  assert.equal(dcCreatorTags([]), "");
});

// ─── Stable lastBuildDate ──────────────────────────────────────────────────

test("latestChangeDate: newest change wins (updated > lastmod > date)", () => {
  const now = new Date("2026-11-14T00:00:00Z");
  assert.equal(
    latestChangeDate(
      [
        { data: { date: new Date("2022-04-04T05:00:00Z") } },
        {
          data: {
            date: new Date("2022-04-05T05:00:00Z"),
            updated: new Date("2022-04-06T05:00:00Z"),
          },
        },
        {
          data: {
            date: new Date("2022-04-03T05:00:00Z"),
            lastmod: new Date("2022-04-07T05:00:00Z"),
          },
        },
      ],
      now,
    ).toUTCString(),
    "Thu, 07 Apr 2022 05:00:00 GMT",
  );
});

test("latestChangeDate: undated posts fall back to build time", () => {
  const now = new Date("2026-11-14T00:00:00Z");
  assert.equal(
    latestChangeDate(
      [{ data: {} }, { data: { date: null } }],
      now,
    ).toUTCString(),
    "Sat, 14 Nov 2026 00:00:00 GMT",
  );
  assert.equal(
    latestChangeDate([], now).toUTCString(),
    "Sat, 14 Nov 2026 00:00:00 GMT",
  );
});

// ─── Stable sort ─────────────────────────────────────────────────────────

test("sortFeedPosts: newest first, same date by id, undated last, input untouched", () => {
  const a = {
    id: "post-2.md",
    data: { date: new Date("2022-04-04T05:00:00Z") },
  };
  const b = {
    id: "post-1.md",
    data: { date: new Date("2022-04-04T05:00:00Z") },
  };
  const c = {
    id: "post-r2-example.md",
    data: { date: new Date("2022-04-05T05:00:00Z") },
  };
  const d = { id: "undated.md", data: { date: null } };
  const input = [a, b, c, d];
  const sorted = sortFeedPosts(input);
  assert.deepEqual(
    sorted.map((p) => p.id),
    ["post-r2-example.md", "post-1.md", "post-2.md", "undated.md"],
  );
  assert.deepEqual(
    input.map((p) => p.id),
    ["post-2.md", "post-1.md", "post-r2-example.md", "undated.md"],
  );
});

// ─── Local image dimensions ──────────────────────────────────────────────

test("localImageDimensions: real local file returns real pixels", async () => {
  assert.deepEqual(
    await localImageDimensions("/images/image-placeholder.png"),
    {
      width: 1096,
      height: 480,
    },
  );
  assert.deepEqual(
    await localImageDimensions(
      "https://astroplate.jadoo.bond/images/r2-example-og.jpg",
    ),
    { width: 2192, height: 1152 },
  );
});

test("localImageDimensions: remote, protocol-relative and missing files return null", async () => {
  assert.equal(
    await localImageDimensions("https://media.csofts.tech/images/x.jpg"),
    null,
  );
  assert.equal(
    await localImageDimensions("//media.csofts.tech/images/x.jpg"),
    null,
  );
  assert.equal(await localImageDimensions("/images/does-not-exist.png"), null);
});

// ─── Media tags with dimensions ───────────────────────────────────────────

test("mediaTags: dimensions add width/height to both tags", () => {
  const tags = mediaTags(
    { image: "/images/image-placeholder.png" },
    { width: 1096, height: 480 },
  );
  assert.match(
    tags,
    /media:content url="[^"]+" medium="image" type="image\/png" width="1096" height="480"/,
  );
  assert.match(tags, /media:thumbnail url="[^"]+" width="1096" height="480"/);
});

test("mediaTags: no dimensions means no width/height attributes", () => {
  const tags = mediaTags({ image: "/images/image-placeholder.png" });
  assert.doesNotMatch(tags, /width=|height=/);
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

// ─── Code highlighting is slimmed out of feeds ───────────────────────────

test("stripCodeHighlighting: Shiki block becomes plain <pre><code>text</code></pre>", () => {
  const out = stripCodeHighlighting(
    '<pre class="astro-code one-dark-pro" style="background-color:#0f172a" tabindex="0" data-language="ts"><code>' +
      '<span class="line"><span style="color:#f8fafc">const x = 1 &lt; 2 &amp;&amp; y;</span></span>' +
      '<span class="line"><span style="color:#7dd3fc">console.log(x);</span></span>' +
      "</code></pre>",
  );
  assert.equal(
    out,
    "<pre><code>const x = 1 &lt; 2 &amp;&amp; y;console.log(x);</code></pre>",
  );
  // A bare astro-code class (no theme suffix) is slimmed the same way.
  assert.equal(
    stripCodeHighlighting(
      '<pre class="astro-code"><code><span class="line">a</span></code></pre>',
    ),
    "<pre><code>a</code></pre>",
  );
});

test("stripCodeHighlighting: only astro-code blocks change, the rest passes through", () => {
  const out = stripCodeHighlighting(
    '<p>Intro with <span class="katex">math</span></p>' +
      '<pre class="astro-code"><code><span class="line">a</span></code></pre>' +
      '<pre><code class="language-js">const b = 1;</code></pre>' +
      '<pre class="astro-code"><code></code></pre>',
  );
  assert.match(out, /<p>Intro with <span class="katex">math<\/span><\/p>/);
  assert.match(out, /<pre><code>a<\/code><\/pre>/);
  assert.match(
    out,
    /<pre><code class="language-js">const b = 1;<\/code><\/pre>/,
  );
  assert.match(out, /<pre><code><\/code><\/pre>/);
  assert.doesNotMatch(out, /astro-code|class="line"/);
});

test("sanitizeFeedHtml: highlighted code is slimmed to plain text", () => {
  const out = sanitizeFeedHtml(
    '<p>Example</p><pre class="astro-code"><code><span class="line"><span>npm run build</span></span></code></pre>',
  );
  assert.match(out, /<p>Example<\/p>/);
  assert.match(out, /<pre><code>npm run build<\/code><\/pre>/);
  assert.doesNotMatch(out, /astro-code|<span/);
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
    "getFeedEntries()",
    "dcCreatorTags(entry.authors.map((a) => a.name))",
    "entry.mediaXml",
    "entry.contentHtml",
    "updated.toUTCString()",
    "toRssLanguage(config.site.locale",
    "absoluteUrl(FEED_PATH)",
    "trailingSlash: Boolean(config.site.trailing_slash)",
    "<lastBuildDate>",
    "<ttl>",
    "<atom:link",
    "<image>",
    'media: "http://search.yahoo.com/mrss/"',
  ]) {
    assert.ok(src.includes(marker), `rss.xml.ts must contain: ${marker}`);
  }
});

test("rss.xml.ts: no hard-coded domain, language, or <author> email", () => {
  const src = fs.readFileSync(
    path.join(repoRoot, "src/pages/rss.xml.ts"),
    "utf8",
  );
  assert.ok(!src.includes("jadoo.bond"), "must not hard-code the domain");
  assert.ok(!src.includes('"en-us"'), "language must come from config");
  assert.ok(
    !src.includes("{ author }"),
    "RSS <author> must not be emitted (emails stay private)",
  );
  assert.ok(
    !src.includes("getCollection("),
    "entries must come from the shared pipeline (getFeedEntries), not a second collection read",
  );
  assert.ok(
    !src.includes("experimental_AstroContainer"),
    "rendering must happen once in the shared pipeline, not per endpoint",
  );
  assert.ok(
    !src.includes("new URL(FEED_PATH"),
    "feed URL must keep base_path (absoluteUrl, not new URL)",
  );
});
