// Validates the ACTUAL generated production HTML in dist/ (not source
// components) for SEO correctness. Run after `pnpm build`:
//   node scripts/validate-seo.mjs [--dist dist]
// Exit 1 when any ERROR is found; warnings are reported but do not fail.
// External validators that need a public URL (Google Rich Results Test,
// Schema.org Validator, Facebook Sharing Debugger, X Card Validator,
// Google Search Console) cannot run here — see SEO_GUIDE.md for the
// manual checklist.
//
// Checks: missing/duplicate title + description, missing/multiple
// canonical, robots correctness, OG + Twitter presence + duplicates,
// og:image URL validity + emitted dimensions vs the actual file (sharp),
// image alt attributes, exactly one H1 + heading hierarchy, empty
// links, JSON-LD parses + no duplicate @graph entities, structured-data
// dates consistent with RSS + sitemap, sitemap URLs resolve to real
// dist files, every canonical is in a sitemap (except 404 / robotsindex: false).
import fs from "node:fs";
import path from "node:path";
import { parse } from "node-html-parser";
import sharp from "sharp";

const distDir = path.resolve(
  process.cwd(),
  process.argv.includes("--dist")
    ? process.argv[process.argv.indexOf("--dist") + 1]
    : "dist",
);

const errors = [];
const warnings = [];
const error = (file, code, message) =>
  errors.push({ file, code, message });
const warn = (file, code, message) =>
  warnings.push({ file, code, message });

function* walkHtml(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkHtml(full);
    else if (entry.isFile() && entry.name.endsWith(".html")) yield full;
  }
}

function sitePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/** dist file for a site path ("/blog/x" -> dist/blog/x/index.html). */
function distFileForPath(sitePathValue) {
  if (!sitePathValue) return null;
  const rel = sitePathValue.replace(/^\/+/, "");
  const candidates = [
    path.join(distDir, rel, "index.html"),
    path.join(distDir, rel),
    path.join(distDir, `${rel}.html`),
  ];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null;
}

const htmlFiles = [...walkHtml(distDir)];
if (htmlFiles.length === 0) {
  console.error(`No HTML files found under ${distDir} — run pnpm build first.`);
  process.exit(1);
}

// ─── Sitemap + RSS indexes (for cross-output consistency) ──────────────
const sitemapUrls = new Map(); // loc -> lastmod
const sitemapIndex = path.join(distDir, "sitemap_index.xml");
if (fs.existsSync(sitemapIndex)) {
  const indexXml = fs.readFileSync(sitemapIndex, "utf8");
  for (const match of indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const child = sitePath(match[1]);
    const childFile = child ? path.join(distDir, child) : null;
    if (childFile && fs.existsSync(childFile)) {
      const childXml = fs.readFileSync(childFile, "utf8");
      for (const entry of childXml.matchAll(
        /<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g,
      )) {
        sitemapUrls.set(entry[1], entry[2] ?? null);
      }
    }
  }
}

const rssByUrl = new Map(); // link -> pubDate
const rssFile = path.join(distDir, "rss.xml");
if (fs.existsSync(rssFile)) {
  const rss = fs.readFileSync(rssFile, "utf8");
  for (const item of rss.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const link = /<link>([^<]+)<\/link>/.exec(item[1])?.[1];
    const pubDate = /<pubDate>([^<]+)<\/pubDate>/.exec(item[1])?.[1];
    if (link) rssByUrl.set(link, pubDate ?? null);
  }
}

// ─── Per-page checks ────────────────────────────────────────────────────
const titles = new Map();
const descriptions = new Map();
const imageMetaCache = new Map();

async function verifyImageDims(imageUrl) {
  const pathname = sitePath(imageUrl);
  if (!pathname) return null;
  if (imageMetaCache.has(pathname)) return imageMetaCache.get(pathname);
  const result = (async () => {
    const local = path.join(distDir, pathname.replace(/^\/+/, ""));
    if (!fs.existsSync(local)) return null;
    try {
      const meta = await sharp(local).metadata();
      return meta.width && meta.height
        ? { width: meta.width, height: meta.height, type: meta.format }
        : null;
    } catch {
      return null;
    }
  })();
  imageMetaCache.set(pathname, result);
  return result;
}

for (const file of htmlFiles) {
  const rel = path.relative(distDir, file);
  const html = fs.readFileSync(file, "utf8");
  const root = parse(html);
  const head = root.querySelector("head");
  if (!head) {
    error(rel, "missing-head", "No <head> element.");
    continue;
  }
  const htmlEl = root.querySelector("html");
  const lang = htmlEl?.getAttribute("lang");
  if (!lang) {
    error(rel, "missing-lang", "<html> has no lang attribute.");
  }

  // Title + description (exactly one each, non-empty).
  const titleEls = head.querySelectorAll("title");
  if (titleEls.length === 0) error(rel, "missing-title", "No <title>.");
  if (titleEls.length > 1) {
    error(rel, "duplicate-title-tag", `${titleEls.length} <title> elements.`);
  }
  const title = titleEls[0]?.text?.trim() ?? "";
  if (!title) error(rel, "missing-title", "<title> is empty.");
  if (title) {
    titles.set(title, [...(titles.get(title) ?? []), rel]);
  }

  const descEls = head.querySelectorAll('meta[name="description"]');
  if (descEls.length === 0) {
    error(rel, "missing-description", "No meta description.");
  }
  if (descEls.length > 1) {
    error(
      rel,
      "duplicate-description-tag",
      `${descEls.length} meta description tags.`,
    );
  }
  const description = descEls[0]?.getAttribute("content")?.trim() ?? "";
  if (!description) {
    error(rel, "missing-description", "Meta description is empty.");
  }
  if (description) {
    descriptions.set(description, [
      ...(descriptions.get(description) ?? []),
      rel,
    ]);
  }

  // Canonical (exactly one, absolute https).
  const canonicalEls = head.querySelectorAll('link[rel="canonical"]');
  if (canonicalEls.length === 0) {
    error(rel, "missing-canonical", "No canonical link.");
  }
  if (canonicalEls.length > 1) {
    error(
      rel,
      "multiple-canonical",
      `${canonicalEls.length} canonical links.`,
    );
  }
  const canonical = canonicalEls[0]?.getAttribute("href") ?? "";
  if (canonical && !/^https:\/\//i.test(canonical)) {
    error(rel, "invalid-canonical", `Canonical is not absolute https: ${canonical}`);
  }

  // Robots: every page carries a robots meta — the index variant or the
  // noindex variant (both with max-snippet/-image-preview/-video-preview).
  // A noindex page must not be in the sitemap (checked below).
  const robots = head
    .querySelector('meta[name="robots"]')
    ?.getAttribute("content");
  const is404 = rel === "404.html";
  const INDEX_ROBOTS =
    "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1";
  const NOINDEX_ROBOTS =
    "noindex, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1";
  if (!robots) {
    error(rel, "missing-robots", 'No <meta name="robots"> on the page.');
  } else if (robots !== INDEX_ROBOTS && robots !== NOINDEX_ROBOTS) {
    error(rel, "invalid-robots", `Unexpected robots content: ${robots}`);
  }

  // OG + Twitter: presence, no duplicates, image URL + verified dims.
  const metaProp = (property) =>
    head.querySelectorAll(`meta[property="${property}"]`);
  const metaName = (name) =>
    head.querySelectorAll(`meta[name="${name}"]`);
  const requireProp = (property) => {
    const els = metaProp(property);
    if (els.length === 0) {
      error(rel, `missing-${property}`, `No ${property} meta tag.`);
    }
    if (els.length > 1) {
      error(rel, `duplicate-${property}`, `${els.length} ${property} tags.`);
    }
    return els[0]?.getAttribute("content")?.trim() ?? "";
  };
  const requireName = (name) => {
    const els = metaName(name);
    if (els.length === 0) {
      error(rel, `missing-${name}`, `No ${name} meta tag.`);
    }
    if (els.length > 1) {
      error(rel, `duplicate-${name}`, `${els.length} ${name} tags.`);
    }
    return els[0]?.getAttribute("content")?.trim() ?? "";
  };
  requireProp("og:title");
  requireProp("og:description");
  requireProp("og:type");
  requireProp("og:url");
  requireProp("og:site_name");
  requireProp("og:locale");
  const ogImage = requireProp("og:image");
  requireProp("og:image:alt");
  const ogWidth = metaProp("og:image:width")[0]?.getAttribute("content");
  const ogHeight = metaProp("og:image:height")[0]?.getAttribute("content");
  const ogType = metaProp("og:image:type")[0]?.getAttribute("content");
  requireName("twitter:card");
  requireName("twitter:title");
  requireName("twitter:description");
  requireName("twitter:image");
  requireName("twitter:image:alt");
  if (metaName("twitter:site").length === 0) {
    warn(rel, "missing-twitter-site", "No twitter:site (a handle is configured).");
  }
  if (metaName("twitter:creator").length === 0) {
    warn(rel, "missing-twitter-creator", "No twitter:creator (a handle is configured).");
  }

  if (ogImage) {
    if (!/^https:\/\//i.test(ogImage)) {
      error(rel, "invalid-image-url", `og:image is not absolute https: ${ogImage}`);
    } else {
      const verified = await verifyImageDims(ogImage);
      if (verified) {
        if (ogWidth && Number(ogWidth) !== verified.width) {
          error(
            rel,
            "incorrect-og-dimensions",
            `og:image:width is ${ogWidth} but the file is ${verified.width}px wide.`,
          );
        }
        if (ogHeight && Number(ogHeight) !== verified.height) {
          error(
            rel,
            "incorrect-og-dimensions",
            `og:image:height is ${ogHeight} but the file is ${verified.height}px tall.`,
          );
        }
        const expectedType =
          verified.type === "webp"
            ? "image/webp"
            : verified.type === "jpeg"
              ? "image/jpeg"
              : verified.type
                ? `image/${verified.type}`
                : undefined;
        if (ogType && expectedType && ogType !== expectedType) {
          error(
            rel,
            "incorrect-og-type",
            `og:image:type is ${ogType} but the file is ${expectedType}.`,
          );
        }
      } else {
        warn(
          rel,
          "unverified-image-dimensions",
          `og:image file not found in dist, dimensions not verified: ${ogImage}`,
        );
      }
    }
  }

  // hreflang: none are emitted (single-language site); if any appear,
  // their targets must resolve.
  for (const link of head.querySelectorAll('link[rel="alternate"]')) {
    const hreflang = link.getAttribute("hreflang");
    if (!hreflang) continue;
    const href = link.getAttribute("href") ?? "";
    if (href && !distFileForPath(sitePath(href))) {
      error(rel, "broken-hreflang", `hreflang ${hreflang} -> ${href} does not exist.`);
    }
  }

  // Headings: exactly one H1, no skipped levels. (robotsindex: false pages
  // are not indexed, so an H1 defect there is a warning, not an error.)
  const headings = root.querySelectorAll("h1, h2, h3, h4, h5, h6");
  const h1s = headings.filter((h) => h.tagName === "H1");
  const h1Issue = h1s.length === 0
    ? "missing-h1"
    : h1s.length > 1
      ? "multiple-h1"
      : null;
  if (h1Issue) {
    const message =
      h1s.length === 0
        ? "No <h1> on the page."
        : `${h1s.length} <h1> elements on the page.`;
    if (robots?.includes("noindex")) warn(rel, h1Issue, message);
    else error(rel, h1Issue, message);
  }
  let prevLevel = 0;
  for (const h of headings) {
    const level = Number(h.tagName.slice(1));
    if (prevLevel > 0 && level > prevLevel + 1) {
      warn(
        rel,
        "heading-skip",
        `Heading level jumps H${prevLevel} -> H${level} ("${h.text.trim().slice(0, 60)}").`,
      );
    }
    prevLevel = level;
  }

  // Images: alt attribute required; width/height recommended.
  for (const img of root.querySelectorAll("img")) {
    const src = img.getAttribute("src") ?? "(no src)";
    if (!img.hasAttribute("alt")) {
      error(rel, "missing-image-alt", `<img src="${src}"> has no alt attribute.`);
    } else if (img.getAttribute("alt") === "") {
      warn(rel, "empty-image-alt", `<img src="${src}"> has an empty alt (decorative?).`);
    }
    if (!img.getAttribute("width") || !img.getAttribute("height")) {
      warn(rel, "missing-image-dimensions", `<img src="${src}"> has no width/height attributes.`);
    }
  }

  // Links: no empty/missing hrefs.
  for (const a of root.querySelectorAll("a")) {
    const href = a.getAttribute("href");
    if (href === null || href.trim() === "") {
      error(rel, "empty-link", `<a> with no href ("${a.text.trim().slice(0, 40)}").`);
    } else if (href.trim() === "#") {
      warn(rel, "placeholder-link", `<a href="#"> ("${a.text.trim().slice(0, 40)}").`);
    }
  }

  // JSON-LD: exactly one block, parses, no duplicate @graph entities.
  const ldBlocks = head.querySelectorAll('script[type="application/ld+json"]');
  if (ldBlocks.length === 0) {
    error(rel, "missing-jsonld", "No JSON-LD block.");
  }
  if (ldBlocks.length > 1) {
    error(rel, "duplicate-jsonld", `${ldBlocks.length} JSON-LD blocks.`);
  }
  for (const block of ldBlocks) {
    let data;
    try {
      data = JSON.parse(block.text);
    } catch (err) {
      error(rel, "invalid-jsonld", `JSON-LD does not parse: ${err.message}`);
      continue;
    }
    const graph = Array.isArray(data["@graph"]) ? data["@graph"] : [data];
    const seen = new Set();
    for (const node of graph) {
      const key = `${node["@type"] ?? "?"}|${node["@id"] ?? node.url ?? node.name ?? ""}`;
      if (seen.has(key)) {
        error(rel, "duplicate-jsonld-entity", `Duplicate JSON-LD entity: ${key}`);
      }
      seen.add(key);
      for (const field of ["dateCreated", "datePublished", "dateModified"]) {
        if (node[field] !== undefined && Number.isNaN(Date.parse(node[field]))) {
          error(rel, "invalid-structured-date", `${node["@type"]} ${field} is not ISO: ${node[field]}`);
        }
      }
    }
    // Blog posts: JSON-LD dates must agree with RSS + sitemap.
    const posting = graph.find((n) => n["@type"] === "BlogPosting");
    if (posting && canonical) {
      const rssDate = rssByUrl.get(canonical);
      if (rssDate && posting.datePublished) {
        const rssIso = new Date(rssDate).toISOString();
        const ldIso = new Date(posting.datePublished).toISOString();
        if (rssIso !== ldIso) {
          error(
            rel,
            "inconsistent-date",
            `datePublished ${ldIso} (JSON-LD) != RSS pubDate ${rssIso}.`,
          );
        }
      }
      const sitemapLastmod = sitemapUrls.get(canonical);
      if (sitemapLastmod && posting.dateModified) {
        const smIso = new Date(sitemapLastmod).toISOString();
        const ldIso = new Date(posting.dateModified).toISOString();
        if (smIso !== ldIso) {
          error(
            rel,
            "inconsistent-date",
            `dateModified ${ldIso} (JSON-LD) != sitemap lastmod ${smIso}.`,
          );
        }
      }
    }
  }

  // Sitemap coverage: every canonical must be listed (except 404 +
  // robotsindex: false pages, which are excluded by design).
  if (canonical && !is404 && !robots?.includes("noindex")) {
    if (!sitemapUrls.has(canonical)) {
      error(rel, "missing-from-sitemap", `Canonical ${canonical} is not in any sitemap.`);
    }
  }
  if (canonical && robots?.includes("noindex") && sitemapUrls.has(canonical)) {
    error(rel, "noindex-in-sitemap", `robotsindex: false page ${canonical} is listed in a sitemap.`);
  }
}

// ─── Cross-page checks ──────────────────────────────────────────────────
for (const [title, files] of titles) {
  if (files.length > 1) {
    warn(
      files.join(", "),
      "duplicate-title",
      `Title "${title}" is used on ${files.length} pages: ${files.join(", ")}.`,
    );
  }
}
for (const [description, files] of descriptions) {
  if (files.length > 1) {
    warn(
      files.join(", "),
      "duplicate-description",
      `Description "${description.slice(0, 80)}" is used on ${files.length} pages.`,
    );
  }
}

// Sitemap URLs must resolve to real dist files.
for (const loc of sitemapUrls.keys()) {
  const pathname = sitePath(loc);
  if (!pathname) {
    error("sitemap", "invalid-sitemap-url", `Sitemap loc is not a URL: ${loc}`);
    continue;
  }
  if (!distFileForPath(pathname)) {
    error("sitemap", "sitemap-url-not-found", `Sitemap loc has no dist file: ${loc}`);
  }
}

// ─── Report ─────────────────────────────────────────────────────────────
console.log(`Checked ${htmlFiles.length} HTML pages in ${distDir}.`);
console.log(`Sitemap entries: ${sitemapUrls.size}. RSS items: ${rssByUrl.size}.`);
if (warnings.length > 0) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) {
    console.log(`  WARN [${w.code}] ${w.file}: ${w.message}`);
  }
}
if (errors.length > 0) {
  console.log(`\n${errors.length} error(s):`);
  for (const e of errors) {
    console.log(`  ERROR [${e.code}] ${e.file}: ${e.message}`);
  }
  process.exit(1);
}
console.log(errors.length === 0 && warnings.length === 0 ? "All SEO checks passed." : "No errors.");
