// Sitemap tests — config defaults/validation, XML serialization, the
// engine (chunking, limits, index contents) and the pure collector
// transforms (exclusion rules, lastmod priority, canonical handling).
// The live collectors call `astro:content`, which is stubbed under plain
// `node --test` (tests/stubs/astro-content.mjs); their output is verified
// through the production build instead (see SEO_GUIDE.md).
import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

register("./json-hooks.mjs", import.meta.url);
const sitemapConfig = await import("../src/lib/seo/sitemap/config.ts");
const sitemapXml = await import("../src/lib/seo/sitemap/xml.ts");
const sitemapEngine = await import("../src/lib/seo/sitemap/index.ts");
const sitemapCollectors = await import("../src/lib/seo/sitemap/collectors.ts");
const seo = await import("../src/lib/utils/seo.ts");

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const { resolveSitemapSettings, getSitemapSettings, isExcludedPath } =
  sitemapConfig;
const {
  serializeUrlset,
  serializeSitemapIndex,
  serializeUrlEntry,
  formatLastmod,
} = sitemapXml;
const { buildSitemapFiles, chunkFilename, chunkEntries } = sitemapEngine;
const {
  contentLastmod,
  isSitemapVisible,
  isExternalCanonical,
  stripFencedCodeBlocks,
  extractBodyImagePaths,
  postImageUrls,
  isPublicFile,
  postsToEntries,
  authorsToEntries,
  categoriesToEntries,
  tagsToEntries,
  imagesToEntries,
  pagesToEntries,
} = sitemapCollectors;

// Fixed "now" so future-date tests are deterministic (real content is Nov 5-14 2026).
const NOW = new Date("2026-11-15T00:00:00.000Z");
const BASE = "https://astroplate.jadoo.bond";

/** Fresh clone of the defaults (safe to mutate per test). */
const liveSettings = () => resolveSitemapSettings(undefined);

/** Collected entries for every enabled type (empty unless overridden). */
const collected = (overrides = {}) => ({
  pages: [],
  posts: [],
  categories: [],
  tags: [],
  authors: [],
  images: [],
  ...overrides,
});

const post = (id, data = {}, body = undefined) => ({
  id,
  body,
  data: {
    title: "My Post",
    date: new Date("2026-11-14T05:00:00Z"),
    image: "/images/blog/my-post-feature.webp",
    og_image: "/images/blog/my-post-og.webp",
    ...data,
  },
});

const page = (id, data = {}) => ({
  id,
  data: { title: "Page", draft: false, ...data },
});

const indexEntry = (data = {}) => ({
  id: "-index",
  data: { title: "Index", draft: false, ...data },
});

const entry = (loc, lastmod) => ({
  loc,
  ...(lastmod ? { lastmod: new Date(lastmod) } : {}),
});

const locsIn = (xml) =>
  [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
const urlCountIn = (xml) => (xml.match(/<url>/g) ?? []).length;
const byteLength = (text) => new TextEncoder().encode(text).length;

// ─── Config defaults ───────────────────────────────────────────────────────

test("config defaults: missing sitemap object yields the documented defaults", () => {
  const s = resolveSitemapSettings(undefined);
  assert.equal(s.enable, true);
  assert.equal(s.index_filename, "sitemap_index.xml");
  assert.equal(s.lastmod, true);
  assert.deepEqual(s.exclude, ["/404"]);
  assert.deepEqual(s.exclude_segments, ["draft", "drafts", "preview", "private"]);
  assert.equal(s.max_urls_per_sitemap, 1000);
  assert.equal(s.max_bytes, 52428800);
  for (const key of ["pages", "posts", "categories", "tags", "authors", "images"]) {
    assert.equal(s.types[key].enable, true, `${key} must default on`);
  }
  for (const key of ["videos", "news", "products", "locales", "locations"]) {
    assert.equal(s.types[key].enable, false, `${key} must default off`);
  }
  assert.equal(s.types.posts.filename, "post-sitemap.xml");
  assert.equal(s.types.images.filename, "image-sitemap.xml");
});

test("config defaults: live config.json matches the defaults (6 types on, 5 off)", () => {
  const s = getSitemapSettings();
  assert.equal(s.enable, true);
  assert.equal(s.index_filename, "sitemap_index.xml");
  assert.equal(s.types.posts.enable, true);
  assert.equal(s.types.posts.filename, "post-sitemap.xml");
  assert.equal(s.types.videos.enable, false);
  assert.equal(s.types.news.enable, false);
  assert.equal(s.types.products.enable, false);
  assert.equal(s.types.locales.enable, false);
  assert.equal(s.types.locations.enable, false);
});

test("config: partial objects merge with defaults; unknown keys ignored", () => {
  const s = resolveSitemapSettings({
    types: { posts: { enable: false } },
    max_urls_per_sitemap: 100,
    bogus: 1,
  });
  assert.equal(s.types.posts.enable, false);
  assert.equal(s.types.pages.enable, true);
  assert.equal(s.max_urls_per_sitemap, 100);
  assert.equal(s.max_bytes, 52428800);
  assert.equal(s.types.posts.filename, "post-sitemap.xml");
});

// ─── Config validation ─────────────────────────────────────────────────────

test("config validation: filenames must be plain .xml names", () => {
  assert.throws(
    () => resolveSitemapSettings({ index_filename: "../evil.xml" }),
    /plain \.xml filename/,
  );
  assert.throws(
    () => resolveSitemapSettings({ index_filename: "sitemap-index" }),
    /plain \.xml filename/,
  );
  assert.throws(
    () =>
      resolveSitemapSettings({
        types: { posts: { filename: "dir/post-sitemap.xml" } },
      }),
    /plain \.xml filename/,
  );
  assert.throws(
    () => resolveSitemapSettings({ types: { posts: { filename: ".xml" } } }),
    /plain \.xml filename/,
  );
});

test("config validation: duplicate filenames fail (index vs type, type vs type)", () => {
  assert.throws(
    () =>
      resolveSitemapSettings({
        types: { posts: { filename: "page-sitemap.xml" } },
      }),
    /duplicate filename "page-sitemap\.xml"/,
  );
  assert.throws(
    () => resolveSitemapSettings({ index_filename: "post-sitemap.xml" }),
    /duplicate filename "post-sitemap\.xml"/,
  );
});

test("config validation: filenames colliding with chunk names fail", () => {
  // Chunks are <stem>1.xml, <stem>2.xml, ... — a file whose name equals
  // another type's chunk name would be overwritten when that type splits.
  assert.throws(
    () =>
      resolveSitemapSettings({
        types: { videos: { filename: "post-sitemap1.xml" } },
      }),
    /collides with a chunk filename/,
  );
  assert.throws(
    () =>
      resolveSitemapSettings({ index_filename: "page-sitemap2.xml" }),
    /collides with a chunk filename/,
  );
  // A filename ending in digits that matches no type stem is fine, and
  // a type's own digit-suffixed name is fine too: posts as
  // "post-sitemap1.xml" chunks to "post-sitemap11.xml", ... — it
  // collides with nothing.
  const s = resolveSitemapSettings({
    types: { posts: { filename: "posts2.xml" } },
  });
  assert.equal(s.types.posts.filename, "posts2.xml");
  const own = resolveSitemapSettings({
    types: { posts: { filename: "post-sitemap1.xml" } },
  });
  assert.equal(own.types.posts.filename, "post-sitemap1.xml");
});

test("config validation: bad limits and wrong types fail clearly", () => {
  assert.throws(
    () => resolveSitemapSettings({ max_urls_per_sitemap: 0 }),
    /max_urls_per_sitemap/,
  );
  assert.throws(
    () => resolveSitemapSettings({ max_urls_per_sitemap: -5 }),
    /max_urls_per_sitemap/,
  );
  assert.throws(
    () => resolveSitemapSettings({ max_urls_per_sitemap: 1.5 }),
    /max_urls_per_sitemap/,
  );
  assert.throws(
    () => resolveSitemapSettings({ max_urls_per_sitemap: "1000" }),
    /max_urls_per_sitemap/,
  );
  assert.throws(() => resolveSitemapSettings({ max_bytes: -1 }), /max_bytes/);
  assert.throws(() => resolveSitemapSettings({ enable: "yes" }), /enable/);
  assert.throws(() => resolveSitemapSettings({ exclude: "/404" }), /exclude/);
  assert.throws(
    () => resolveSitemapSettings({ types: { posts: "yes" } }),
    /types\.posts/,
  );
  assert.throws(
    () => resolveSitemapSettings("sitemap"),
    /"sitemap" must be an object/,
  );
});

// ─── Path exclusion ────────────────────────────────────────────────────────

test("isExcludedPath: exact excludes + segment rule", () => {
  const s = liveSettings();
  assert.equal(isExcludedPath("/404", s), true);
  assert.equal(isExcludedPath("/blog/x", s), false);
  assert.equal(isExcludedPath("/draft/x", s), true);
  assert.equal(isExcludedPath("/x/drafts/y", s), true);
  assert.equal(isExcludedPath("/blog/draft-post", s), false);
  const custom = resolveSitemapSettings({ exclude: ["/about"] });
  assert.equal(isExcludedPath("/about", custom), true);
  assert.equal(isExcludedPath("/about/", custom), true);
  assert.equal(isExcludedPath("/about-us", custom), false);
});

// ─── XML serialization ─────────────────────────────────────────────────────

test("xml: urlset has declaration, sitemap namespace, no image namespace without images", () => {
  const xml = serializeUrlset([entry(`${BASE}/blog/a`)]);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(
    xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'),
  );
  assert.ok(!xml.includes("xmlns:image"));
  assert.ok(xml.includes(`<loc>${BASE}/blog/a</loc>`));
  assert.ok(xml.endsWith("</urlset>\n"));
});

test("xml: image entries declare the image namespace and emit image:image", () => {
  const xml = serializeUrlset([
    {
      loc: `${BASE}/blog/a`,
      images: [{ loc: `${BASE}/images/a.webp`, title: "A & B" }],
    },
  ]);
  assert.ok(
    xml.includes(
      'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"',
    ),
  );
  assert.ok(
    xml.includes(`<image:loc>${BASE}/images/a.webp</image:loc>`),
  );
  assert.ok(xml.includes("<image:title>A &amp; B</image:title>"));
});

test("xml: escaping covers &, <, >, double and single quotes", () => {
  const xml = serializeUrlset([
    {
      loc: `${BASE}/blog/a?x=1&y=2`,
      images: [{ loc: `${BASE}/images/a.webp`, title: `<Tag> "quoted" 'single'` }],
    },
  ]);
  assert.ok(xml.includes(`${BASE}/blog/a?x=1&amp;y=2`));
  assert.ok(
    xml.includes("&lt;Tag&gt; &quot;quoted&quot; &apos;single&apos;"),
  );
  assert.ok(!xml.includes("<Tag>"));
});

test("xml: lastmod serializes as ISO 8601; missing lastmod omits the tag", () => {
  assert.equal(
    formatLastmod(new Date("2026-11-14T05:00:00.000Z")),
    "2026-11-14T05:00:00.000Z",
  );
  const dated = serializeUrlset([
    entry(`${BASE}/x`, "2026-11-14T05:00:00.000Z"),
  ]);
  assert.ok(dated.includes("<lastmod>2026-11-14T05:00:00.000Z</lastmod>"));
  const undated = serializeUrlset([entry(`${BASE}/x`)]);
  assert.ok(!undated.includes("<lastmod>"));
});

test("xml: empty urlset is valid; empty index throws; invalid loc throws", () => {
  const empty = serializeUrlset([]);
  assert.ok(empty.includes("<urlset"));
  assert.ok(empty.includes("</urlset>"));
  assert.ok(!empty.includes("<url>"));
  assert.throws(() => serializeSitemapIndex([]), /empty sitemap index/);
  assert.throws(() => serializeUrlEntry({ loc: "" }), /invalid <loc>/);
  assert.throws(() => serializeUrlEntry({ loc: "/relative" }), /invalid <loc>/);
});

test("xml: sitemap index lists files with newest lastmod", () => {
  const xml = serializeSitemapIndex([
    { loc: `${BASE}/post-sitemap.xml`, lastmod: new Date("2026-11-14T05:00:00.000Z") },
    { loc: `${BASE}/page-sitemap.xml` },
  ]);
  assert.ok(
    xml.includes('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'),
  );
  assert.deepEqual(locsIn(xml), [
    `${BASE}/post-sitemap.xml`,
    `${BASE}/page-sitemap.xml`,
  ]);
  assert.equal((xml.match(/<lastmod>/g) ?? []).length, 1);
  assert.ok(xml.includes("<lastmod>2026-11-14T05:00:00.000Z</lastmod>"));
});

// ─── Engine ────────────────────────────────────────────────────────────────

test("engine: master disabled generates nothing", () => {
  const s = resolveSitemapSettings({ enable: false });
  const files = buildSitemapFiles(s, collected({ posts: [entry(`${BASE}/blog/a`)] }));
  assert.equal(files.size, 0);
});

test("engine: a disabled type generates no file and no index entry", () => {
  const s = resolveSitemapSettings({ types: { posts: { enable: false } } });
  const files = buildSitemapFiles(
    s,
    collected({
      posts: [entry(`${BASE}/blog/a`)],
      pages: [entry(`${BASE}/`)],
    }),
  );
  assert.equal(files.has("post-sitemap.xml"), false);
  assert.equal(files.has("page-sitemap.xml"), true);
  assert.ok(!files.get("sitemap_index.xml").includes("post-sitemap.xml"));
});

test("engine: all types disabled generates no index", () => {
  const s = liveSettings();
  for (const key of Object.keys(s.types)) {
    s.types[key].enable = false;
  }
  assert.equal(buildSitemapFiles(s, collected()).size, 0);
});

test("engine: enabled type with no entries generates no file; all empty means no index", () => {
  assert.equal(buildSitemapFiles(liveSettings(), collected()).size, 0);
  const files = buildSitemapFiles(
    liveSettings(),
    collected({ pages: [entry(`${BASE}/`)] }),
  );
  assert.equal(files.has("page-sitemap.xml"), true);
  assert.equal(files.has("sitemap_index.xml"), true);
  assert.equal(files.has("post-sitemap.xml"), false);
});

test("engine: enabled type missing from collected throws", () => {
  assert.throws(
    () =>
      buildSitemapFiles(liveSettings(), {
        pages: [entry(`${BASE}/`)],
        categories: [],
        tags: [],
        authors: [],
        images: [],
      }),
    /no entries were collected/,
  );
});

test("engine: duplicate URLs inside one file throw", () => {
  assert.throws(
    () =>
      buildSitemapFiles(
        liveSettings(),
        collected({
          posts: [entry(`${BASE}/blog/a`), entry(`${BASE}/blog/a`)],
        }),
      ),
    /duplicate URL/,
  );
});

test("engine: index references only generated files, with newest lastmod per file", () => {
  const files = buildSitemapFiles(
    liveSettings(),
    collected({
      posts: [
        entry(`${BASE}/blog/b`, "2026-11-05T05:00:00.000Z"),
        entry(`${BASE}/blog/a`, "2026-11-14T05:00:00.000Z"),
      ],
      pages: [entry(`${BASE}/`)],
    }),
  );
  assert.deepEqual([...files.keys()], [
    "sitemap_index.xml",
    "page-sitemap.xml",
    "post-sitemap.xml",
  ]);
  const indexXml = files.get("sitemap_index.xml");
  assert.deepEqual(locsIn(indexXml), [
    `${BASE}/page-sitemap.xml`,
    `${BASE}/post-sitemap.xml`,
  ]);
  assert.equal((indexXml.match(/<lastmod>/g) ?? []).length, 1);
  assert.ok(indexXml.includes("<lastmod>2026-11-14T05:00:00.000Z</lastmod>"));
});

test("engine: lastmod disabled strips lastmod everywhere", () => {
  const s = resolveSitemapSettings({ lastmod: false });
  const files = buildSitemapFiles(
    s,
    collected({ posts: [entry(`${BASE}/blog/a`, "2026-11-14T05:00:00.000Z")] }),
  );
  for (const xml of files.values()) {
    assert.ok(!xml.includes("<lastmod>"), `lastmod leaked into ${xml.slice(0, 60)}`);
  }
});

test("engine: custom filenames are used in files and index", () => {
  const s = resolveSitemapSettings({
    index_filename: "index.xml",
    types: { posts: { filename: "posts.xml" } },
  });
  const files = buildSitemapFiles(
    s,
    collected({
      posts: [entry(`${BASE}/blog/a`)],
      pages: [entry(`${BASE}/`)],
    }),
  );
  assert.equal(files.has("index.xml"), true);
  assert.equal(files.has("posts.xml"), true);
  assert.equal(files.has("page-sitemap.xml"), true);
  assert.ok(files.get("index.xml").includes(`${BASE}/posts.xml`));
});

test("engine: chunkFilename numbers chunks from 1 with no hyphen (single file keeps the name)", () => {
  assert.equal(chunkFilename("post-sitemap.xml", 0, 1), "post-sitemap.xml");
  assert.equal(chunkFilename("post-sitemap.xml", 0, 2), "post-sitemap1.xml");
  assert.equal(chunkFilename("post-sitemap.xml", 1, 2), "post-sitemap2.xml");
  assert.equal(chunkFilename("post-sitemap.xml", 2, 3), "post-sitemap3.xml");
  assert.equal(chunkFilename("page-sitemap.xml", 0, 2), "page-sitemap1.xml");
});

test("engine: chunkEntries splits at max_urls_per_sitemap", () => {
  const s = resolveSitemapSettings({ max_urls_per_sitemap: 3 });
  const entries = Array.from({ length: 7 }, (_, i) =>
    entry(`${BASE}/blog/p${i + 1}`),
  );
  const chunks = chunkEntries(entries, s, false);
  assert.deepEqual(
    chunks.map((c) => c.length),
    [3, 3, 1],
  );
});

test("engine: chunking splits at max_urls_per_sitemap into 1/2/3 names, no bare file, all URLs present once", () => {
  const s = resolveSitemapSettings({ max_urls_per_sitemap: 3 });
  const all = Array.from({ length: 7 }, (_, i) =>
    entry(`${BASE}/blog/p${i + 1}`),
  );
  const files = buildSitemapFiles(s, collected({ posts: all }));
  assert.equal(files.has("post-sitemap.xml"), false);
  assert.equal(files.has("post-sitemap1.xml"), true);
  assert.equal(files.has("post-sitemap2.xml"), true);
  assert.equal(files.has("post-sitemap3.xml"), true);
  assert.equal(urlCountIn(files.get("post-sitemap1.xml")), 3);
  assert.equal(urlCountIn(files.get("post-sitemap2.xml")), 3);
  assert.equal(urlCountIn(files.get("post-sitemap3.xml")), 1);
  const listed = [
    ...locsIn(files.get("post-sitemap1.xml")),
    ...locsIn(files.get("post-sitemap2.xml")),
    ...locsIn(files.get("post-sitemap3.xml")),
  ].sort();
  assert.deepEqual(
    listed,
    all.map((e) => e.loc).sort(),
  );
  const indexLocs = locsIn(files.get("sitemap_index.xml"));
  assert.deepEqual(indexLocs, [
    `${BASE}/post-sitemap1.xml`,
    `${BASE}/post-sitemap2.xml`,
    `${BASE}/post-sitemap3.xml`,
  ]);
});

test("engine: chunking splits at max_bytes and never truncates", () => {
  const s = resolveSitemapSettings({ max_bytes: 300 });
  const all = Array.from({ length: 5 }, (_, i) =>
    entry(`${BASE}/blog/p${i + 1}`),
  );
  const files = buildSitemapFiles(s, collected({ posts: all }));
  const postFiles = [...files.keys()].filter((name) =>
    name.startsWith("post-sitemap"),
  );
  assert.ok(postFiles.length > 1, `expected a byte split, got ${postFiles}`);
  for (const name of postFiles) {
    const xml = files.get(name);
    assert.ok(
      byteLength(xml) <= 300 || urlCountIn(xml) === 1,
      `${name} is ${byteLength(xml)} bytes — over the limit without being a single-entry chunk`,
    );
  }
  const listed = postFiles.flatMap((name) => locsIn(files.get(name))).sort();
  assert.deepEqual(
    listed,
    all.map((e) => e.loc).sort(),
  );
});

test("engine: default max_urls_per_sitemap is 1000 and the configured value is respected", () => {
  const s = liveSettings();
  assert.equal(s.max_urls_per_sitemap, 1000);
  // 1001 entries with the default limit split into 1000 + 1.
  const all = Array.from({ length: 1001 }, (_, i) =>
    entry(`${BASE}/blog/p${i + 1}`),
  );
  const files = buildSitemapFiles(s, collected({ posts: all }));
  assert.equal(files.has("post-sitemap.xml"), false);
  assert.equal(urlCountIn(files.get("post-sitemap1.xml")), 1000);
  assert.equal(urlCountIn(files.get("post-sitemap2.xml")), 1);
  assert.equal(files.has("post-sitemap3.xml"), false);
  // A configured limit of 100 splits 250 entries into 100 + 100 + 50.
  const s100 = resolveSitemapSettings({ max_urls_per_sitemap: 100 });
  const entries250 = Array.from({ length: 250 }, (_, i) =>
    entry(`${BASE}/blog/q${i + 1}`),
  );
  const files100 = buildSitemapFiles(s100, collected({ posts: entries250 }));
  assert.equal(files100.has("post-sitemap.xml"), false);
  assert.equal(files100.has("post-sitemap1.xml"), true);
  assert.equal(files100.has("post-sitemap2.xml"), true);
  assert.equal(files100.has("post-sitemap3.xml"), true);
  assert.equal(files100.has("post-sitemap4.xml"), false);
  assert.equal(urlCountIn(files100.get("post-sitemap1.xml")), 100);
  assert.equal(urlCountIn(files100.get("post-sitemap3.xml")), 50);
  const listed = [
    ...locsIn(files100.get("post-sitemap1.xml")),
    ...locsIn(files100.get("post-sitemap2.xml")),
    ...locsIn(files100.get("post-sitemap3.xml")),
  ].sort();
  assert.deepEqual(
    listed,
    entries250.map((e) => e.loc).sort(),
  );
});

// ─── Collector transforms ──────────────────────────────────────────────────

test("lastmod priority: updated > lastmod > date; invalid/missing yields undefined", () => {
  const d1 = new Date("2026-11-14T05:00:00.000Z");
  const d2 = new Date("2026-11-13T05:00:00.000Z");
  const d3 = new Date("2026-11-12T05:00:00.000Z");
  assert.deepEqual(
    contentLastmod({ updated: d1, lastmod: d2, date: d3 }),
    d1,
  );
  assert.deepEqual(contentLastmod({ lastmod: d2, date: d3 }), d2);
  assert.deepEqual(contentLastmod({ date: d3 }), d3);
  assert.equal(contentLastmod({}), undefined);
  assert.equal(contentLastmod({ date: "not-a-date" }), undefined);
  assert.deepEqual(
    contentLastmod({ date: "2026-11-14T05:00:00Z" }),
    new Date("2026-11-14T05:00:00.000Z"),
  );
});

test("isSitemapVisible: draft, noindex, future and -index are out", () => {
  assert.equal(isSitemapVisible(post("a"), NOW), true);
  assert.equal(isSitemapVisible(post("a", { draft: true }), NOW), false);
  assert.equal(isSitemapVisible(post("a", { noindex: true }), NOW), false);
  assert.equal(
    isSitemapVisible(post("a", { date: new Date("2999-01-01") }), NOW),
    false,
  );
  assert.equal(
    isSitemapVisible({ id: "-index", data: { title: "X" } }, NOW),
    false,
  );
});

test("isExternalCanonical: off-site absolute canonicals only", () => {
  assert.equal(isExternalCanonical(undefined), false);
  assert.equal(isExternalCanonical("/blog/x"), false);
  assert.equal(isExternalCanonical(`${BASE}/blog/x`), false);
  assert.equal(isExternalCanonical("https://example.com/blog/x"), true);
  assert.equal(isExternalCanonical("http://other.test/x"), true);
});

test("postsToEntries: absolute canonical URLs, custom slugs, exclusions", () => {
  const entries = postsToEntries(
    [
      post("a"),
      post("b", { slug: "My Guide!" }),
      post("c", { draft: true }),
      post("d", { noindex: true }),
      post("e", { date: new Date("2999-01-01") }),
      post("f", { canonical: "https://example.com/x" }),
      post("g", { canonical: "/blog/elsewhere" }),
    ],
    liveSettings(),
    NOW,
  );
  assert.deepEqual(
    entries.map((e) => e.loc),
    [`${BASE}/blog/a`, `${BASE}/blog/my-guide`, `${BASE}/blog/g`],
  );
  // Absolute URLs, no double domain, and exactly what canonicalFor builds
  // (base_path / trailing_slash are canonicalFor's job — the sitemap
  // defers to it, so a config change flows through unchanged).
  for (const e of entries) {
    assert.ok(e.loc.startsWith(`${BASE}/`), `not absolute: ${e.loc}`);
    assert.ok(!e.loc.includes("jadoo.bondhttps"), `double domain: ${e.loc}`);
  }
  assert.equal(entries[0].loc, seo.canonicalFor("/blog/a"));
  assert.equal(entries[1].loc, seo.canonicalFor("/blog/my-guide"));
  assert.deepEqual(
    entries[0].lastmod,
    new Date("2026-11-14T05:00:00.000Z"),
  );
});

test("postsToEntries: duplicate slugs throw", () => {
  assert.throws(
    () =>
      postsToEntries(
        [post("a", { slug: "same" }), post("same")],
        liveSettings(),
        NOW,
      ),
    /Duplicate blog post URL/,
  );
});

test("authorsToEntries: id-based URLs, noindex dropped", () => {
  const entries = authorsToEntries(
    [
      { id: "jane-doe", data: { title: "Jane" } },
      { id: "hidden", data: { title: "H", noindex: true } },
    ],
    liveSettings(),
    NOW,
  );
  assert.deepEqual(
    entries.map((e) => e.loc),
    [`${BASE}/authors/jane-doe`],
  );
});

test("categoriesToEntries/tagsToEntries: archive URLs from taxonomy slugs", () => {
  assert.deepEqual(
    categoriesToEntries(["astro", "design-systems"], liveSettings()).map(
      (e) => e.loc,
    ),
    [`${BASE}/categories/astro`, `${BASE}/categories/design-systems`],
  );
  assert.deepEqual(
    tagsToEntries(["rss", "seo"], liveSettings()).map((e) => e.loc),
    [`${BASE}/tags/rss`, `${BASE}/tags/seo`],
  );
  const withDraft = resolveSitemapSettings({ exclude: ["/tags/draft"] });
  assert.deepEqual(
    tagsToEntries(["draft", "seo"], withDraft).map((e) => e.loc),
    [`${BASE}/tags/seo`],
  );
});

test("imagesToEntries: og_image wins, page image only, drafts skipped", () => {
  const entries = imagesToEntries(
    [
      post("a"),
      post("b", { image: "/images/b.webp", og_image: undefined }),
      post("c", { image: undefined, og_image: undefined }),
      post("d", { draft: true }),
    ],
    liveSettings(),
    NOW,
  );
  assert.equal(entries.length, 2);
  assert.equal(entries[0].loc, `${BASE}/blog/a`);
  assert.equal(entries[0].images[0].loc, `${BASE}/images/blog/my-post-og.webp`);
  assert.equal(entries[0].images[0].title, "My Post");
  assert.equal(entries[1].images[0].loc, `${BASE}/images/b.webp`);
});

test("pagesToEntries: home, indexes, pagination and standalone pages", () => {
  const entries = pagesToEntries(
    {
      regularPages: [
        page("privacy-policy"),
        page("hidden", { noindex: true }),
        page("ext", { canonical: "https://example.com/x" }),
      ],
      aboutIndex: indexEntry({ title: "About" }),
      contactIndex: null,
      blogIndex: indexEntry({ title: "Blog" }),
      authorsIndex: indexEntry({ title: "Authors" }),
      blogTotalPages: 3,
    },
    liveSettings(),
    NOW,
  );
  assert.deepEqual(
    entries.map((e) => e.loc).sort(),
    [
      `${BASE}/`,
      `${BASE}/about`,
      `${BASE}/authors`,
      `${BASE}/blog`,
      `${BASE}/blog/page/2`,
      `${BASE}/blog/page/3`,
      `${BASE}/categories`,
      `${BASE}/privacy-policy`,
      `${BASE}/tags`,
    ].sort(),
  );
});

test("pagesToEntries: draft about index drops /about; one blog page means no pagination URLs", () => {
  const entries = pagesToEntries(
    {
      regularPages: [],
      aboutIndex: indexEntry({ draft: true }),
      contactIndex: indexEntry({ title: "Contact" }),
      blogIndex: indexEntry({ title: "Blog" }),
      authorsIndex: null,
      blogTotalPages: 1,
    },
    liveSettings(),
    NOW,
  );
  assert.deepEqual(
    entries.map((e) => e.loc).sort(),
    [
      `${BASE}/`,
      `${BASE}/blog`,
      `${BASE}/categories`,
      `${BASE}/contact`,
      `${BASE}/tags`,
    ].sort(),
  );
});

// ─── Image embedding ─────────────────────────────────────────────────────

test("stripFencedCodeBlocks: ``` and ~~~ fences are removed, the rest kept", () => {
  const body = "before\n```js\nconst x = 1;\n```\nbetween\n~~~md\n# hi\n~~~\nafter";
  assert.equal(stripFencedCodeBlocks(body), "before\nbetween\nafter");
});

test("extractBodyImagePaths: markdown refs + img srcs, fences skipped, external/relative dropped, deduped", () => {
  const body = [
    "![Diagram one](/images/blog/a-diagram-1.webp)",
    "![Diagram two](/images/blog/a-diagram-2.webp)",
    "![Diagram one again](/images/blog/a-diagram-1.webp)",
    '<img src="/images/blog/a-photo.webp" alt="photo">',
    '![Titled](/images/blog/titled.webp "A title")',
    "![External](https://example.com/x.webp)",
    "![Relative](images/relative.webp)",
    "![No ext](/images/blog/noext)",
    "```astro",
    "![In a code sample](/images/blog/code-sample.webp)",
    '<img src="/images/blog/code-img.webp">',
    "```",
    "![After the fence](/images/blog/a-diagram-2.webp)",
  ].join("\n");
  assert.deepEqual(extractBodyImagePaths(body), [
    "/images/blog/a-diagram-1.webp",
    "/images/blog/a-diagram-2.webp",
    "/images/blog/a-photo.webp",
    "/images/blog/titled.webp",
  ]);
});

test("postImageUrls: image, og_image, then body refs — absolute and deduped", () => {
  const urls = postImageUrls(
    post(
      "a",
      {},
      "![D1](/images/blog/a-diagram-1.webp)\n![D2](/images/blog/a-diagram-2.webp)\n![D1 again](/images/blog/a-diagram-1.webp)",
    ),
  );
  assert.deepEqual(urls, [
    `${BASE}/images/blog/my-post-feature.webp`,
    `${BASE}/images/blog/my-post-og.webp`,
    `${BASE}/images/blog/a-diagram-1.webp`,
    `${BASE}/images/blog/a-diagram-2.webp`,
  ]);
  // og_image equal to image dedupes; no images at all yields none.
  assert.deepEqual(
    postImageUrls(
      post("b", { og_image: "/images/blog/my-post-feature.webp" }),
    ),
    [`${BASE}/images/blog/my-post-feature.webp`],
  );
  assert.deepEqual(
    postImageUrls(post("c", { image: undefined, og_image: undefined })),
    [],
  );
});

test("postsToEntries: attaches <image:loc>-only images; existence gate filters; no images means no image tags", () => {
  const body =
    "![D1](/images/blog/a-diagram-1.webp)\n![D2](/images/blog/a-diagram-2.webp)";
  const entries = postsToEntries(
    [
      post("a", {}, body),
      post("b", { image: undefined, og_image: undefined }),
    ],
    liveSettings(),
    NOW,
  );
  assert.equal(entries[0].images.length, 4);
  assert.deepEqual(
    entries[0].images.map((img) => img.loc),
    [
      `${BASE}/images/blog/my-post-feature.webp`,
      `${BASE}/images/blog/my-post-og.webp`,
      `${BASE}/images/blog/a-diagram-1.webp`,
      `${BASE}/images/blog/a-diagram-2.webp`,
    ],
  );
  for (const img of entries[0].images) {
    assert.equal(
      img.title,
      undefined,
      "post image tags carry <image:loc> only, no title",
    );
  }
  assert.equal(entries[1].images, undefined);
  // The existence gate drops missing files.
  const gated = postsToEntries(
    [post("a", {}, body)],
    liveSettings(),
    NOW,
    (url) => url.endsWith("-og.webp") || url.endsWith("-diagram-1.webp"),
  );
  assert.deepEqual(
    gated[0].images.map((img) => img.loc),
    [
      `${BASE}/images/blog/my-post-og.webp`,
      `${BASE}/images/blog/a-diagram-1.webp`,
    ],
  );
});

test("isPublicFile: real files under public/ found, everything else not", () => {
  assert.equal(isPublicFile("/images/banner.webp"), true);
  assert.equal(isPublicFile("/images/about-banner.webp"), true);
  assert.equal(isPublicFile(`${BASE}/images/banner.webp`), true);
  assert.equal(isPublicFile("/images/banner.webp?x=1"), true);
  assert.equal(isPublicFile("/images/does-not-exist.webp"), false);
  assert.equal(isPublicFile("https://example.com/images/banner.webp"), false);
  assert.equal(isPublicFile("//images/banner.webp"), false);
  assert.equal(isPublicFile("/images/../banner.webp"), false);
});

test("pagesToEntries: homepage banner, about image, page image attached; imageless pages have none", () => {
  const entries = pagesToEntries(
    {
      regularPages: [
        page("privacy-policy", { image: "/images/privacy.webp" }),
        page("elements"),
      ],
      aboutIndex: indexEntry({
        title: "About",
        image: "/images/about-banner.webp",
      }),
      contactIndex: indexEntry({ title: "Contact", image: "" }),
      blogIndex: indexEntry({ title: "Blog" }),
      authorsIndex: indexEntry({ title: "Authors" }),
      blogTotalPages: 1,
      homepageBannerImage: "/images/banner.webp",
    },
    liveSettings(),
    NOW,
  );
  const byLoc = new Map(entries.map((e) => [e.loc, e]));
  assert.deepEqual(
    byLoc.get(`${BASE}/`).images.map((i) => i.loc),
    [`${BASE}/images/banner.webp`],
  );
  assert.deepEqual(
    byLoc.get(`${BASE}/about`).images.map((i) => i.loc),
    [`${BASE}/images/about-banner.webp`],
  );
  assert.deepEqual(
    byLoc.get(`${BASE}/privacy-policy`).images.map((i) => i.loc),
    [`${BASE}/images/privacy.webp`],
  );
  assert.equal(byLoc.get(`${BASE}/contact`).images, undefined);
  assert.equal(byLoc.get(`${BASE}/blog`).images, undefined);
  assert.equal(byLoc.get(`${BASE}/elements`).images, undefined);
  assert.equal(byLoc.get(`${BASE}/categories`).images, undefined);
});

test("engine: post/page sitemaps declare the image namespace only when they carry images", () => {
  const withImages = buildSitemapFiles(
    liveSettings(),
    collected({
      posts: [
        {
          loc: `${BASE}/blog/a`,
          images: [{ loc: `${BASE}/images/a.webp` }],
        },
      ],
      pages: [entry(`${BASE}/`)],
    }),
  );
  assert.ok(
    withImages
      .get("post-sitemap.xml")
      .includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'),
  );
  assert.ok(
    withImages
      .get("post-sitemap.xml")
      .includes(`<image:loc>${BASE}/images/a.webp</image:loc>`),
  );
  assert.ok(!withImages.get("page-sitemap.xml").includes("xmlns:image"));
  const withoutImages = buildSitemapFiles(
    liveSettings(),
    collected({ posts: [entry(`${BASE}/blog/a`)] }),
  );
  assert.ok(!withoutImages.get("post-sitemap.xml").includes("xmlns:image"));
});

test("images sitemap: format unchanged — one OG image per post, no multi-image embedding", () => {
  // image-sitemap.xml stays as it was: each entry is a post URL with
  // exactly one <image:image> (the OG image, with title). The new
  // multi-image embedding applies to post/page sitemaps only.
  const entries = imagesToEntries(
    [
      post("a"),
      post("b", { image: "/images/b.webp", og_image: undefined }),
    ],
    liveSettings(),
    NOW,
  );
  const files = buildSitemapFiles(
    liveSettings(),
    collected({ images: entries }),
  );
  const xml = files.get("image-sitemap.xml");
  assert.equal(urlCountIn(xml), 2);
  assert.equal((xml.match(/<image:image>/g) ?? []).length, 2);
  assert.ok(
    xml.includes(
      `<image:loc>${BASE}/images/blog/my-post-og.webp</image:loc>`,
    ),
  );
  assert.ok(xml.includes(`<image:loc>${BASE}/images/b.webp</image:loc>`));
});

// ─── Route + config file markers ───────────────────────────────────────────

test("route: single dynamic route serves enabled sitemaps as XML", () => {
  const src = fs.readFileSync(
    path.join(repoRoot, "src/pages/[sitemap].xml.ts"),
    "utf8",
  );
  assert.ok(src.includes("getStaticPaths"), "route must use getStaticPaths()");
  assert.ok(
    src.includes("application/xml; charset=utf-8"),
    "route must serve application/xml; charset=utf-8",
  );
  assert.ok(!src.includes("@astrojs/sitemap"), "old integration must be gone");
  assert.ok(!src.includes("getCollection"), "collectors live in the engine");
});

test("config: config.json carries the sitemap object with 11 types (+ index = 12 files)", () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "src/config/config.json"), "utf8"),
  );
  assert.equal(config.sitemap.enable, true);
  assert.equal(config.sitemap.index_filename, "sitemap_index.xml");
  assert.equal(Object.keys(config.sitemap.types).length, 11);
  for (const key of ["pages", "posts", "categories", "tags", "authors", "images"]) {
    assert.equal(config.sitemap.types[key].enable, true, `${key} on`);
  }
  for (const key of ["videos", "news", "products", "locales", "locations"]) {
    assert.equal(config.sitemap.types[key].enable, false, `${key} off`);
  }
});
