// Atom feed tests — the endpoint builds XML by hand (there is no
// @astrojs/rss equivalent for Atom), so source-marker tests pin the
// required Atom 1.0 structure, and the production build + dist/atom.xml
// validation verifies the live output instead (`astro:content` /
// `astro/container` cannot run under plain `node --test`).
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

// ─── Atom endpoint ─────────────────────────────────────────────────────────

test("atom.xml.ts: Atom 1.0 structure from the shared pipeline", () => {
  const src = read("src/pages/atom.xml.ts");
  for (const marker of [
    "getFeedEntries()",
    '<feed xmlns="http://www.w3.org/2005/Atom"',
    'xmlns:media="http://search.yahoo.com/mrss/"',
    'xml:lang="${escapeXml(language)}"',
    "<title>${escapeXml(config.site.title)}</title>",
    "<subtitle>${escapeXml(config.metadata.meta_description)}</subtitle>",
    '<link rel="self" type="application/atom+xml"',
    "<id>${escapeXml(feedUrl)}</id>",
    "<updated>${updated.toISOString()}</updated>",
    "<generator>Astro</generator>",
    "<icon>${escapeXml(absoluteUrl(feedIcon))}</icon>",
    "<logo>${escapeXml(absoluteUrl(atomLogo))}</logo>",
    "<entry>",
    '<link rel="alternate" type="text/html"',
    "<published>${e.published.toISOString()}</published>",
    "<updated>${entryUpdated.toISOString()}</updated>",
    "<author><name>${escapeXml(a.name)}</name></author>",
    '<content type="html">${escapeXml(e.contentHtml)}</content>',
    '<category term="${escapeXml(c)}" />',
    "e.mediaXml",
    '"Content-Type": "application/atom+xml; charset=utf-8"',
    "toBcp47(config.site.locale",
  ]) {
    assert.ok(src.includes(marker), `atom.xml.ts must contain: ${marker}`);
  }
});

test("atom.xml.ts: no hard-coded domain, no emails, no second render", () => {
  const src = read("src/pages/atom.xml.ts");
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
  assert.ok(
    !src.includes('new URL("/", site'),
    "home URL must keep base_path (absoluteUrl, not new URL)",
  );
});

// ─── Feed brand images ─────────────────────────────────────────────────────

test("atom.xml.ts: feed icon/logo come from config.feeds, not site.logo", () => {
  const src = read("src/pages/atom.xml.ts");
  for (const marker of [
    "const feedIcon = config.feeds?.icon ?? config.site.favicon;",
    "const atomLogo = config.feeds?.atom_logo;",
    // The site logo (154x28) is neither square nor 2:1, so it must
    // never feed <icon> or <logo>.
    "absoluteUrl(feedIcon)",
    "absoluteUrl(atomLogo)",
  ]) {
    assert.ok(src.includes(marker), `atom.xml.ts must contain: ${marker}`);
  }
  assert.ok(
    !src.includes("absoluteUrl(config.site.logo)"),
    "Atom <logo> must not use the site logo (wrong ratio)",
  );
});

test("config.json + images: Atom logo is 2:1, feed icon is square", async () => {
  const sharp = (await import("sharp")).default;
  const cfg = JSON.parse(read("src/config/config.json"));
  assert.equal(cfg.feeds.atom_logo, "/atom-logo.png");
  assert.equal(cfg.feeds.icon, "/feed-icon.png");
  const logoPath = path.join(
    repoRoot,
    "public",
    cfg.feeds.atom_logo.replace(/^\//, ""),
  );
  const iconPath = path.join(
    repoRoot,
    "public",
    cfg.feeds.icon.replace(/^\//, ""),
  );
  const logo = await sharp(logoPath).metadata();
  assert.equal(
    logo.width / logo.height,
    2,
    "Atom <logo> must be twice as wide as it is tall (2:1)",
  );
  const icon = await sharp(iconPath).metadata();
  assert.equal(icon.width, icon.height, "feed icon must be square");
});

// ─── Shared pipeline ───────────────────────────────────────────────────────

test("feed-entries.ts: one render pass, capped, authors resolved, no default image", () => {
  const src = read("src/lib/utils/feed-entries.ts");
  for (const marker of [
    "export const FEED_LIMIT",
    "config.feeds?.limit",
    "Number.isInteger(configuredLimit) && configuredLimit > 0",
    "getFeedEntries()",
    "sortFeedPosts(posts).slice(0, FEED_LIMIT)",
    "latestChangeDate(sorted)",
    "AstroContainer.create()",
    "resolveAuthors(displayAuthorNames(post), authors)",
    "isPageImage ? absoluteUrl(imageUrl) : undefined",
    "mediaTags(post.data, dimensions)",
    "cache ??= load()",
    "if (!import.meta.env.PROD) return load();",
  ]) {
    assert.ok(src.includes(marker), `feed-entries.ts must contain: ${marker}`);
  }
  assert.ok(
    !src.includes("author: post.data.author"),
    "authors must be resolved via the authors collection",
  );
  assert.ok(!src.includes("mailto:"), "must not expose emails");
});

// ─── Autodiscovery ─────────────────────────────────────────────────────────

test("Base.astro: Atom + JSON Feed autodiscovery links next to the RSS one", () => {
  const src = read("src/layouts/Base.astro");
  assert.ok(
    src.includes('type="application/atom+xml"'),
    "head must advertise the Atom feed",
  );
  assert.ok(
    src.includes('href={absoluteUrl("/atom.xml")}'),
    "Atom link must be config-driven",
  );
  assert.ok(
    src.includes('type="application/feed+json"'),
    "head must advertise the JSON Feed",
  );
  assert.ok(
    src.includes('href={absoluteUrl("/feed.json")}'),
    "JSON Feed link must be config-driven",
  );
});
