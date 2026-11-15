// Wave B tests — slug routing, canonical/OG priority, JSON-LD, authors,
// noindex sitemap exclusion, search-index links and R2 image URLs.
// Every test imports the REAL helpers (no re-implemented logic).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { register } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  authorUrl,
  checkDuplicateSlugs,
  normalizeSlug,
  pageUrl,
  postSlug,
  postUrl,
  publicSlug,
} from "../src/lib/utils/slug.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// seo.ts / authors.ts / jsonld.ts import `@/` aliases and JSON — the
// loader hooks (./json-hooks.mjs) resolve those for plain Node, as in
// astro-config.test.js. (jsonld.ts is dynamic for the same reason:
// a static import resolves before register() runs.)
register("./json-hooks.mjs", import.meta.url);
const seo = await import("../src/lib/utils/seo.ts");
const authorsMod = await import("../src/lib/utils/authors.ts");
const { displayAuthorNames, resolveAuthors, postBelongsToAuthor } = authorsMod;
const {
  buildBlogPostingJsonLd,
  buildBreadcrumbJsonLd,
  buildOrganizationJsonLd,
  buildWebPageJsonLd,
  buildWebsiteJsonLd,
} = await import("../src/lib/utils/jsonld.ts");

// ─── Slug normalisation ────────────────────────────────────────────────────

test("normalizeSlug: spaces/punctuation become hyphens, case folds", () => {
  assert.equal(normalizeSlug("  My First Guide! "), "my-first-guide");
  assert.equal(normalizeSlug("Hello   World"), "hello-world");
  assert.equal(normalizeSlug("a--b___c  d"), "a-b-c-d");
  assert.equal(normalizeSlug("post-1"), "post-1");
});

test("normalizeSlug: Unicode letters are preserved, not stripped", () => {
  assert.equal(normalizeSlug("Café & Crème Brûlée"), "café-crème-brûlée");
  assert.equal(normalizeSlug("Über-cool Guide"), "über-cool-guide");
});

test("normalizeSlug: nested paths and stray slashes survive cleanly", () => {
  assert.equal(normalizeSlug("/guides//my-post/"), "guides/my-post");
  assert.equal(normalizeSlug("guides/my-post"), "guides/my-post");
  assert.equal(normalizeSlug("!!!"), "");
});

test("publicSlug: custom slug wins, empty custom slug falls back to id", () => {
  assert.equal(
    publicSlug({ id: "post-1", data: { slug: "My Guide!" } }),
    "my-guide",
  );
  assert.equal(publicSlug({ id: "post-1", data: {} }), "post-1");
  assert.equal(publicSlug({ id: "post-1", data: { slug: "   " } }), "post-1");
  assert.equal(publicSlug({ id: "post-1", data: { slug: "!!!" } }), "post-1");
  assert.equal(
    publicSlug({ id: "guides/deep-post.md", data: {} }),
    "guides/deep-post",
  );
});

test("postSlug/postUrl: leading blog/ prefix is forgiven, URLs are /blog/<slug>", () => {
  assert.equal(
    postSlug({ id: "post-1", data: { slug: "blog/my-guide" } }),
    "my-guide",
  );
  assert.equal(
    postUrl({ id: "post-1", data: { slug: "My Guide!" } }),
    "/blog/my-guide",
  );
  assert.equal(postUrl({ id: "post-1", data: {} }), "/blog/post-1");
  assert.equal(
    postUrl({ id: "x", data: { slug: "guides/my-post" } }),
    "/blog/guides/my-post",
  );
  assert.equal(pageUrl({ id: "privacy-policy", data: {} }), "/privacy-policy");
  assert.equal(
    pageUrl({ id: "privacy-policy", data: { slug: "Privacy & Legal" } }),
    "/privacy-legal",
  );
  assert.equal(authorUrl({ id: "john-doe" }), "/authors/john-doe");
});

test("checkDuplicateSlugs: throws listing every conflicting file", () => {
  let thrown;
  try {
    checkDuplicateSlugs(
      [
        { id: "post-1", data: { slug: "my-guide" } },
        { id: "post-2", data: {} },
        { id: "my-guide", data: {} },
      ],
      postUrl,
      "blog post",
    );
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof Error, "expected a duplicate-slug error");
  assert.match(thrown.message, /Duplicate blog post URL/);
  assert.match(thrown.message, /\/blog\/my-guide/);
  assert.match(thrown.message, /post-1/);
  assert.match(thrown.message, /my-guide/);
  assert.doesNotThrow(() =>
    checkDuplicateSlugs(
      [
        { id: "post-1", data: {} },
        { id: "post-2", data: { slug: "other" } },
      ],
      postUrl,
      "blog post",
    ),
  );
});

// ─── Canonical URLs ────────────────────────────────────────────────────────

test("canonicalFor: live domain, no trailing slash (trailing_slash: false)", () => {
  assert.equal(
    seo.canonicalFor("/blog/post-1"),
    "https://astroplate.jadoo.bond/blog/post-1",
  );
  assert.equal(
    seo.canonicalFor("/blog/post-1/"),
    "https://astroplate.jadoo.bond/blog/post-1",
  );
  assert.equal(seo.canonicalFor("/"), "https://astroplate.jadoo.bond/");
  assert.equal(
    seo.canonicalFor("/blog/café-guide"),
    "https://astroplate.jadoo.bond/blog/café-guide",
  );
});

test("buildCanonical: explicit absolute canonical is trailing-slash normalised", () => {
  assert.equal(
    seo.buildCanonical("https://astroplate.jadoo.bond/blog/x/", "/blog/x"),
    "https://astroplate.jadoo.bond/blog/x",
  );
  assert.equal(
    seo.buildCanonical("/blog/custom", "/blog/x"),
    "https://astroplate.jadoo.bond/blog/custom",
  );
  assert.equal(
    seo.buildCanonical(undefined, "/blog/x"),
    "https://astroplate.jadoo.bond/blog/x",
  );
});

// ─── OG / Twitter priority ─────────────────────────────────────────────────

test("OG priority: og_title > meta_title > title; og_title is NOT a <title> fallback", () => {
  assert.equal(
    seo.resolveOgTitle({ og_title: "OG", meta_title: "Meta", title: "T" }),
    "OG",
  );
  assert.equal(seo.resolveOgTitle({ meta_title: "Meta", title: "T" }), "Meta");
  assert.equal(seo.resolveOgTitle({ title: "T" }), "T");
  assert.equal(seo.resolvePageTitle({ og_title: "OG", title: "T" }), "T");
  assert.equal(
    seo.resolvePageTitle({ meta_title: "Meta", title: "T" }),
    "Meta",
  );
});

test("OG description priority: og_description > description > excerpt > default", () => {
  assert.equal(
    seo.resolveOgDescription({
      og_description: "OGD",
      description: "D",
      excerpt: "E",
    }),
    "OGD",
  );
  assert.equal(
    seo.resolveOgDescription({ description: "D", excerpt: "E" }),
    "D",
  );
  assert.equal(seo.resolveOgDescription({ excerpt: "E" }), "E");
  assert.equal(seo.resolveOgDescription({}), "Astro and Tailwind boilerplate");
  assert.equal(seo.resolvePageDescription({ excerpt: "E" }), "E");
});

test("resolveOgImage: R2 https URLs pass through unchanged; local paths get the live domain", () => {
  const r2 = seo.resolveOgImage({
    og_image: "https://media.csofts.tech/images/r2-example-og.jpg",
  });
  assert.equal(r2.url, "https://media.csofts.tech/images/r2-example-og.jpg");
  assert.equal(r2.isPageImage, true);
  const local = seo.resolveOgImage({ image: "/images/image-placeholder.webp" });
  assert.equal(
    local.url,
    "https://astroplate.jadoo.bond/images/image-placeholder.webp",
  );
  const fallback = seo.resolveOgImage({});
  assert.equal(
    fallback.url,
    "https://astroplate.jadoo.bond/images/og-image.webp",
  );
  assert.equal(fallback.isPageImage, false);
});

test("resolveTwitterHandles: no handles configured means no invented tags", () => {
  assert.deepEqual(seo.resolveTwitterHandles(), {
    site: undefined,
    creator: undefined,
  });
});

// ─── JSON-LD ───────────────────────────────────────────────────────────────

test("BlogPosting JSON-LD: url + mainEntityOfPage are the canonical URL, authors are Persons with URLs", () => {
  const block = buildBlogPostingJsonLd(
    {
      headline: "My Guide",
      description: "Desc",
      image: "https://astroplate.jadoo.bond/images/x.png",
      dateCreated: "2022-04-03T05:00:00.000Z",
      datePublished: "2022-04-04T05:00:00.000Z",
      dateModified: "2022-04-05T05:00:00.000Z",
      authors: [
        {
          name: "John Doe",
          url: "https://astroplate.jadoo.bond/authors/john-doe",
        },
        { name: "Ghost Writer", url: null },
      ],
      publisher: {
        name: "Astroplate",
        type: "Organization",
        logo: "https://astroplate.jadoo.bond/logo.png",
        url: "https://astroplate.jadoo.bond",
      },
      url: "https://astroplate.jadoo.bond/blog/my-guide",
    },
    "https://astroplate.jadoo.bond",
  );
  assert.equal(block["@type"], "BlogPosting");
  assert.equal(block.url, "https://astroplate.jadoo.bond/blog/my-guide");
  assert.deepEqual(block.mainEntityOfPage, {
    "@type": "WebPage",
    "@id": "https://astroplate.jadoo.bond/blog/my-guide",
  });
  assert.deepEqual(block.author, [
    {
      "@type": "Person",
      name: "John Doe",
      url: "https://astroplate.jadoo.bond/authors/john-doe",
    },
    { "@type": "Person", name: "Ghost Writer" },
  ]);
  assert.equal(block.publisher.name, "Astroplate");
  // All three content dates, never invented: created < published < modified.
  assert.equal(block.dateCreated, "2022-04-03T05:00:00.000Z");
  assert.equal(block.datePublished, "2022-04-04T05:00:00.000Z");
  assert.equal(block.dateModified, "2022-04-05T05:00:00.000Z");
  // Round-trips through JSON with hostile characters intact.
  const tricky = buildBlogPostingJsonLd(
    {
      headline: 'Quote "test" </script> & <b>bold</b>',
      authors: [{ name: "A", url: null }],
      publisher: null,
      url: "https://astroplate.jadoo.bond/blog/x",
    },
    "https://astroplate.jadoo.bond",
  );
  assert.equal(
    JSON.parse(JSON.stringify(tricky)).headline,
    'Quote "test" </script> & <b>bold</b>',
  );
});

test("WebPage JSON-LD: static pages carry the three dates, no article fields", () => {
  const block = buildWebPageJsonLd({
    name: "Privacy Policy",
    url: "https://astroplate.jadoo.bond/privacy-policy",
    description: "How Astroplate handles data.",
    dateCreated: "2026-11-15T19:04:03.000Z",
    datePublished: "2026-11-15T19:04:03.000Z",
    dateModified: "2026-11-15T19:04:03.000Z",
  });
  assert.equal(block["@type"], "WebPage");
  assert.equal(block.name, "Privacy Policy");
  assert.equal(block.dateCreated, "2026-11-15T19:04:03.000Z");
  assert.equal(block.datePublished, "2026-11-15T19:04:03.000Z");
  assert.equal(block.dateModified, "2026-11-15T19:04:03.000Z");
  // Missing dates are omitted, never null or fabricated.
  const undated = buildWebPageJsonLd({
    name: "Draft",
    url: "https://astroplate.jadoo.bond/draft",
  });
  assert.ok(!("dateCreated" in undated));
  assert.ok(!("datePublished" in undated));
  assert.ok(!("dateModified" in undated));
});

test("WebSite JSON-LD has no SearchAction (no search results page exists)", () => {
  const site = buildWebsiteJsonLd(
    "https://astroplate.jadoo.bond",
    "Astroplate",
  );
  assert.equal(site["@type"], "WebSite");
  assert.ok(
    !("potentialAction" in site),
    "SearchAction must not be fabricated",
  );
});

test("Organization JSON-LD comes from configured data only; null publisher yields null", () => {
  assert.equal(
    buildOrganizationJsonLd(null, "https://astroplate.jadoo.bond"),
    null,
  );
  const org = buildOrganizationJsonLd(
    {
      name: "Astroplate",
      type: "Organization",
      url: "https://astroplate.jadoo.bond",
    },
    "https://astroplate.jadoo.bond",
  );
  assert.equal(org["@type"], "Organization");
  assert.equal(org["@id"], "https://astroplate.jadoo.bond/#organization");
});

test("BreadcrumbList JSON-LD positions items in order", () => {
  const crumbs = buildBreadcrumbJsonLd([
    { name: "Home", url: "https://astroplate.jadoo.bond/" },
    { name: "Blog", url: "https://astroplate.jadoo.bond/blog" },
    { name: "My Guide", url: "https://astroplate.jadoo.bond/blog/my-guide" },
  ]);
  assert.equal(crumbs["@type"], "BreadcrumbList");
  assert.equal(crumbs.itemListElement.length, 3);
  assert.equal(crumbs.itemListElement[2].position, 3);
});

// ─── Authors ───────────────────────────────────────────────────────────────

const fakeAuthors = [
  { id: "john-doe", data: { title: "John Doe" } },
  { id: "wj", data: { title: "William Jacob" } },
  { id: "sam-wilson", data: { title: "Sam Wilson" } },
];

test("resolveAuthors: file-id match first, legacy title-slug fallback, missing ref has no link", () => {
  const resolved = resolveAuthors(
    ["John Doe", "William Jacob", "Nobody Here", "John Doe"],
    fakeAuthors,
  );
  // Deduped: John Doe appears once despite being listed twice.
  assert.equal(resolved.length, 3);
  assert.equal(resolved[0].url, "/authors/john-doe");
  assert.equal(resolved[0].entry.id, "john-doe");
  // "wj" file has title "William Jacob": legacy title-slug fallback.
  assert.equal(resolved[1].url, "/authors/wj");
  assert.equal(resolved[1].entry.id, "wj");
  // Missing author: plain name, no link, no invented entry.
  assert.equal(resolved[2].entry, null);
  assert.equal(resolved[2].url, null);
});

test("displayAuthorNames: authors array wins, else [author], default Admin", () => {
  assert.deepEqual(
    displayAuthorNames({
      data: { author: "John Doe", authors: ["Sam Wilson"] },
    }),
    ["Sam Wilson"],
  );
  assert.deepEqual(
    displayAuthorNames({ data: { author: "John Doe", authors: [] } }),
    ["John Doe"],
  );
  assert.deepEqual(displayAuthorNames({ data: {} }), ["Admin"]);
});

test("postBelongsToAuthor: resolves by entry id, not by bare display name", () => {
  const post = { data: { author: "William Jacob" } };
  assert.equal(postBelongsToAuthor(post, fakeAuthors[1], fakeAuthors), true);
  assert.equal(postBelongsToAuthor(post, fakeAuthors[0], fakeAuthors), false);
  assert.equal(
    postBelongsToAuthor(
      { data: { author: "Nobody Here" } },
      fakeAuthors[0],
      fakeAuthors,
    ),
    false,
  );
});

// ─── Search index generator ────────────────────────────────────────────────

function writeMd(dir, rel, frontmatter, body = "Body text.\n") {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\n${frontmatter}\n---\n\n${body}`);
}

test("jsonGenerator: emits public-slug links, drops noindex/future/draft posts", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "seo-search-"));
  try {
    writeMd(
      tmp,
      "src/content/blog/with-slug.md",
      'title: With Slug\ndatePublished: 2022-04-04T05:00:00Z\nslug: "My Guide!"',
    );
    writeMd(
      tmp,
      "src/content/blog/plain.md",
      "title: Plain\ndatePublished: 2022-04-04T05:00:00Z",
    );
    writeMd(
      tmp,
      "src/content/blog/hidden.md",
      "title: Hidden\ndatePublished: 2022-04-04T05:00:00Z\nnoindex: true",
    );
    writeMd(
      tmp,
      "src/content/blog/future.md",
      "title: Future\ndatePublished: 2999-01-01T00:00:00Z",
    );
    writeMd(tmp, "src/content/blog/draft.md", "title: Draft\ndraft: true");

    const run = spawnSync(
      process.execPath,
      [path.join(repoRoot, "scripts/jsonGenerator.js")],
      { cwd: tmp, encoding: "utf8" },
    );
    assert.equal(run.status, 0, `jsonGenerator failed: ${run.stderr}`);
    const search = JSON.parse(
      fs.readFileSync(path.join(tmp, ".json/search.json"), "utf8"),
    );
    const slugs = search.map((item) => item.slug).sort();
    assert.deepEqual(slugs, ["blog/my-guide", "blog/plain"]);
    assert.ok(!slugs.some((s) => s === "/my-guide" || s.includes("hidden")));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("jsonGenerator: duplicate public slugs fail the run", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "seo-search-dup-"));
  try {
    writeMd(
      tmp,
      "src/content/blog/a.md",
      'title: A\ndatePublished: 2022-04-04T05:00:00Z\nslug: "same"',
    );
    writeMd(
      tmp,
      "src/content/blog/same.md",
      "title: Same\ndatePublished: 2022-04-04T05:00:00Z",
    );
    const run = spawnSync(
      process.execPath,
      [path.join(repoRoot, "scripts/jsonGenerator.js")],
      { cwd: tmp, encoding: "utf8" },
    );
    assert.notEqual(run.status, 0, "duplicate slugs must fail the run");
    assert.match(run.stderr + run.stdout, /Duplicate blog post URLs/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── Dynamic robots.txt ──────────────────────────────────────────────────

test("robots.txt: dynamic endpoint, no hard-coded domain, no public copy", () => {
  const src = fs.readFileSync(
    path.join(repoRoot, "src/pages/robots.txt.ts"),
    "utf8",
  );
  assert.ok(
    src.includes("getSitemapSettings().index_filename"),
    "robots.txt must take the sitemap index filename from config (sitemap.index_filename)",
  );
  assert.ok(
    src.includes("absoluteUrl("),
    "robots.txt must build its Sitemap line with absoluteUrl()",
  );
  assert.ok(
    !src.includes("jadoo.bond"),
    "robots.txt must not hard-code the domain",
  );
  assert.ok(!src.includes("https://"), "robots.txt must not hard-code any URL");
  assert.ok(
    !fs.existsSync(path.join(repoRoot, "public/robots.txt")),
    "public/robots.txt must be gone — it would shadow the endpoint in dist/",
  );
});

test("robots.txt: GET renders a config-driven robots file", async () => {
  const { GET } = await import("../src/pages/robots.txt.ts");
  const res = await GET();
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/plain/);
  const body = await res.text();
  const config = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "src/config/config.json"), "utf8"),
  );
  const base = String(config.site.base_url).replace(/\/+$/, "");
  assert.ok(body.startsWith("User-agent: *\nAllow: /\n"));
  assert.ok(
    body.includes(`Sitemap: ${base}/sitemap_index.xml`),
    `Sitemap line must follow config.site.base_url, got: ${body}`,
  );
  assert.ok(
    !body.includes("/sitemap.xml"),
    "sitemap must be /sitemap_index.xml, not /sitemap.xml",
  );
});
