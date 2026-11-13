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
import {
  buildBlogPostingJsonLd,
  buildBreadcrumbJsonLd,
  buildOrganizationJsonLd,
  buildWebsiteJsonLd,
} from "../src/lib/utils/jsonld.ts";
import { buildSitemapManifest } from "../scripts/seoManifest.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// Site base URL + default description come from the REAL config, not a
// hardcoded domain: multilingual serves from
// astroplate-multilang.netlify.app, main from astroplate.jadoo.bond.
// (The JSON-LD fixtures below keep jadoo.bond as INPUT data — those
// strings are arguments, not config-derived expectations.)
const siteConfig = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "src/config/config.json"), "utf8"),
);
const SITE = siteConfig.site.base_url;
const DEFAULT_DESC = siteConfig.metadata.meta_description;

// seo.ts / authors.ts import `@/` aliases and JSON — the loader hooks
// (./json-hooks.mjs) resolve those for plain Node, as in astro-config.test.js.
register("./json-hooks.mjs", import.meta.url);
const seo = await import("../src/lib/utils/seo.ts");
const authorsMod = await import("../src/lib/utils/authors.ts");
const { displayAuthorNames, resolveAuthors, postBelongsToAuthor } = authorsMod;

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
    `${SITE}/blog/post-1`,
  );
  assert.equal(
    seo.canonicalFor("/blog/post-1/"),
    `${SITE}/blog/post-1`,
  );
  assert.equal(seo.canonicalFor("/"), `${SITE}/`);
  assert.equal(
    seo.canonicalFor("/blog/café-guide"),
    `${SITE}/blog/café-guide`,
  );
});

test("buildCanonical: explicit absolute canonical is trailing-slash normalised", () => {
  assert.equal(
    seo.buildCanonical("https://astroplate.jadoo.bond/blog/x/", "/blog/x"),
    "https://astroplate.jadoo.bond/blog/x",
  );
  assert.equal(
    seo.buildCanonical("/blog/custom", "/blog/x"),
    `${SITE}/blog/custom`,
  );
  assert.equal(
    seo.buildCanonical(undefined, "/blog/x"),
    `${SITE}/blog/x`,
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
  assert.equal(seo.resolveOgDescription({}), DEFAULT_DESC);
  assert.equal(seo.resolvePageDescription({ excerpt: "E" }), "E");
});

test("resolveOgImage: R2 https URLs pass through unchanged; local paths get the live domain", () => {
  const r2 = seo.resolveOgImage({
    og_image: "https://media.csofts.tech/images/r2-example-og.jpg",
  });
  assert.equal(r2.url, "https://media.csofts.tech/images/r2-example-og.jpg");
  assert.equal(r2.isPageImage, true);
  const local = seo.resolveOgImage({ image: "/images/image-placeholder.png" });
  assert.equal(
    local.url,
    `${SITE}/images/image-placeholder.png`,
  );
  const fallback = seo.resolveOgImage({});
  assert.equal(
    fallback.url,
    `${SITE}/images/og-image.jpg`,
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
        logo: "https://astroplate.jadoo.bond/images/logo.png",
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

// ─── Sitemap manifest (noindex exclusion + lastmod) ────────────────────────

function writeMd(dir, rel, frontmatter, body = "Body text.\n") {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\n${frontmatter}\n---\n\n${body}`);
}

test("buildSitemapManifest: noindex paths excluded, lastmod emitted, duplicates throw", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "seo-manifest-"));
  try {
    writeMd(
      tmp,
      "blog/visible.md",
      "title: Visible\ndate: 2022-04-04T05:00:00Z",
    );
    writeMd(
      tmp,
      "blog/hidden.md",
      "title: Hidden\ndate: 2022-04-04T05:00:00Z\nnoindex: true",
    );
    writeMd(tmp, "blog/draft-post.md", "title: Draft\ndraft: true");
    writeMd(tmp, "blog/future.md", "title: Future\ndate: 2999-01-01T00:00:00Z");
    writeMd(tmp, "pages/privacy-policy.md", "title: Privacy\nnoindex: true");
    writeMd(tmp, "pages/terms.md", "title: Terms\ndate: 2022-01-01T00:00:00Z");
    writeMd(tmp, "authors/jane-doe.md", "title: Jane Doe\nnoindex: true");
    writeMd(tmp, "about/-index.md", "title: About\nnoindex: true");

    const manifest = buildSitemapManifest(tmp);
    assert.ok(manifest.excludedPaths.has("/blog/hidden"));
    assert.ok(manifest.excludedPaths.has("/privacy-policy"));
    assert.ok(manifest.excludedPaths.has("/authors/jane-doe"));
    assert.ok(manifest.excludedPaths.has("/about"));
    assert.ok(!manifest.excludedPaths.has("/blog/visible"));
    assert.ok(!manifest.excludedPaths.has("/terms"));
    // Drafts / future posts never reach the manifest at all.
    assert.ok(!("/blog/draft-post" in manifest.lastmodByPath));
    assert.ok(!("/blog/future" in manifest.lastmodByPath));
    assert.equal(manifest.lastmodByPath["/blog/visible"], "2022-04-04");
    assert.equal(manifest.lastmodByPath["/terms"], "2022-01-01");

    // Duplicate public slugs throw.
    writeMd(
      tmp,
      "blog/visible-copy.md",
      "title: Copy\nslug: visible\ndate: 2022-04-04T05:00:00Z",
    );
    assert.throws(() => buildSitemapManifest(tmp), /Duplicate public URL/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── Search index generator ────────────────────────────────────────────────

test("jsonGenerator: emits public-slug links, drops noindex/future/draft posts", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "seo-search-"));
  try {
    writeMd(
      tmp,
      "src/content/blog/english/with-slug.md",
      'title: With Slug\ndate: 2022-04-04T05:00:00Z\nslug: "My Guide!"',
    );
    writeMd(
      tmp,
      "src/content/blog/english/plain.md",
      "title: Plain\ndate: 2022-04-04T05:00:00Z",
    );
    writeMd(
      tmp,
      "src/content/blog/english/hidden.md",
      "title: Hidden\ndate: 2022-04-04T05:00:00Z\nnoindex: true",
    );
    writeMd(
      tmp,
      "src/content/blog/english/future.md",
      "title: Future\ndate: 2999-01-01T00:00:00Z",
    );
    writeMd(
      tmp,
      "src/content/blog/english/draft.md",
      "title: Draft\ndraft: true",
    );
    // The generator reads EVERY language dir from language.json
    // (english + french), so the fixture needs the french dir too
    // (empty here — no french posts in this case).
    fs.mkdirSync(path.join(tmp, "src/content/blog/french"), {
      recursive: true,
    });

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
      "src/content/blog/english/a.md",
      'title: A\ndate: 2022-04-04T05:00:00Z\nslug: "same"',
    );
    writeMd(
      tmp,
      "src/content/blog/english/same.md",
      "title: Same\ndate: 2022-04-04T05:00:00Z",
    );
    // See above: the generator also reads the french dir.
    fs.mkdirSync(path.join(tmp, "src/content/blog/french"), {
      recursive: true,
    });
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
