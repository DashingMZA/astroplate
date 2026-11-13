// Sitemap manifest — frontmatter scan used by astro.config.mjs.
//
// @astrojs/sitemap's `filter` / `serialize` only see URLs, never frontmatter,
// so a `noindex` post cannot be excluded from inside the sitemap options.
// This module scans the content collections at config load time and returns:
//   - `excludedPaths`: public pathnames (trailing-slash normalised) of every
//     published `noindex: true` page — blog posts, regular pages, authors,
//     about and contact — for the sitemap `filter`.
//   - `lastmodByPath`: public pathname -> `YYYY-MM-DD` last-modified date
//     (`updated ?? lastmod ?? date`) for the sitemap `serialize` hook.
//   - `duplicateSlugs`: any public-URL collisions found while scanning, so
//     the config load fails loudly instead of shipping a colliding sitemap.
//
// Public slugs are computed with the same helpers the router uses
// (src/lib/utils/slug.ts) — never re-implemented here. Draft, future-dated
// and `-`-prefixed entries are skipped, matching getSinglePage.
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { normalizeSlug, postSlug, publicSlug } from "../src/lib/utils/slug.ts";

function readSiteSettings() {
  const fallback = { basePath: "", trailingSlash: false, languages: [] };
  try {
    const config = JSON.parse(
      fs.readFileSync(
        new URL("../src/config/config.json", import.meta.url),
        "utf8",
      ),
    );
    // Multilingual: content lives under per-language dirs (english/, french/).
    // A file's first path segment selects its URL prefix: the default
    // language has none (unless default_language_in_subdir), others get
    // "/<code>". Unknown dirs fall back to the default language.
    let languages = [];
    try {
      const langs = JSON.parse(
        fs.readFileSync(
          new URL("../src/config/language.json", import.meta.url),
          "utf8",
        ),
      );
      const defaultLanguage = config.settings?.default_language;
      const defaultInSubdir = Boolean(
        config.settings?.default_language_in_subdir,
      );
      languages = langs.map((l) => ({
        contentDir: l.contentDir ?? l.languageCode,
        prefix:
          l.languageCode === defaultLanguage
            ? defaultInSubdir
              ? `/${l.languageCode}`
              : ""
            : `/${l.languageCode}`,
      }));
    } catch {
      languages = [];
    }
    return {
      basePath:
        config.site?.base_path && config.site.base_path !== "/"
          ? `/${String(config.site.base_path).replace(/^\/+|\/+$/g, "")}`
          : "",
      trailingSlash: Boolean(config.site?.trailing_slash),
      languages,
    };
  } catch {
    return fallback;
  }
}

// Split a collection-relative id ("english/post-1") into its language URL
// prefix ("" or "/fr") and the language-neutral id ("post-1"). Single-
// language trees (no language.json) pass through unchanged.
function splitLangDir(id, languages) {
  const [first, ...rest] = id.split("/");
  const lang = languages.find((l) => l.contentDir === first);
  if (lang && rest.length > 0) {
    return { prefix: lang.prefix, id: rest.join("/") };
  }
  return { prefix: "", id };
}

function normalisePath(pathname, { basePath, trailingSlash }) {
  let p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (basePath && (p === basePath || p.startsWith(`${basePath}/`))) {
    p = p.slice(basePath.length) || "/";
  }
  if (trailingSlash) {
    if (!p.endsWith("/")) p = `${p}/`;
  } else if (p.length > 1 && p.endsWith("/")) {
    p = p.slice(0, -1);
  }
  return `${basePath}${p}`.replace(/([^:])\/{2,}/g, "$1/");
}

function listContentFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listContentFiles(full));
    else if (/\.(md|mdx)$/i.test(entry.name)) out.push(full);
  }
  return out.sort();
}

function toLastmod(data) {
  const value = data.updated ?? data.lastmod ?? data.date;
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return undefined;
  return date.toISOString().slice(0, 10);
}

/**
 * Scan the content collections under `contentRoot` (default `src/content`)
 * and return the sitemap manifest. Throws on duplicate public URLs.
 */
export function buildSitemapManifest(contentRoot = "src/content") {
  const settings = readSiteSettings();
  const root = path.resolve(contentRoot);
  const excludedPaths = new Set();
  const lastmodByPath = {};
  const seenUrls = new Map();

  const register = (urlPath, file, data) => {
    const pathname = normalisePath(urlPath, settings);
    const prev = seenUrls.get(pathname);
    if (prev && prev !== file) {
      throw new Error(
        `Duplicate public URL ${pathname} — ${prev} and ${file} resolve to the same URL. ` +
          `Give one of them a unique custom \`slug\`.`,
      );
    }
    seenUrls.set(pathname, file);
    if (data.noindex === true) {
      excludedPaths.add(pathname);
    }
    const lastmod = toLastmod(data);
    if (lastmod) {
      lastmodByPath[pathname] = lastmod;
    }
  };

  const now = new Date();
  const publishable = (file, data, { allowIndex = false } = {}) => {
    const name = path.basename(file);
    // `-index` files are content-listing stubs in blog/pages/authors, but
    // they ARE the page for the single-page about/contact collections.
    if (!allowIndex && name.startsWith("-")) return false;
    if (data.draft === true) return false;
    if (data.date && new Date(data.date) > now) return false;
    return true;
  };

  // Blog posts: /blog/<public slug>.
  for (const file of listContentFiles(path.join(root, "blog"))) {
    const { data } = matter(fs.readFileSync(file, "utf8"));
    if (!publishable(file, data)) continue;
    const rawId = path
      .relative(path.join(root, "blog"), file)
      .replace(/\.(md|mdx)$/i, "");
    const { prefix, id } = splitLangDir(rawId, settings.languages);
    register(`${prefix}/blog/${postSlug({ id, data })}`, file, data);
  }

  // Regular pages: /<public slug>.
  for (const file of listContentFiles(path.join(root, "pages"))) {
    const { data } = matter(fs.readFileSync(file, "utf8"));
    if (!publishable(file, data)) continue;
    const rawId = path
      .relative(path.join(root, "pages"), file)
      .replace(/\.(md|mdx)$/i, "");
    const { prefix, id } = splitLangDir(rawId, settings.languages);
    register(`${prefix}/${publicSlug({ id, data })}`, file, data);
  }

  // Author pages: /authors/<file id>. (Author slugs come from the file id;
  // a display-name slug would 404 unless it coincides with the id.)
  for (const file of listContentFiles(path.join(root, "authors"))) {
    const { data } = matter(fs.readFileSync(file, "utf8"));
    if (!publishable(file, data)) continue;
    const rawId = path
      .relative(path.join(root, "authors"), file)
      .replace(/\.(md|mdx)$/i, "");
    const { prefix, id } = splitLangDir(rawId, settings.languages);
    register(`${prefix}/authors/${normalizeSlug(id)}`, file, data);
  }

  // Single pages with fixed routes: about -> /about, contact -> /contact.
  // Their `-index` frontmatter carries the noindex/canonical fields.
  for (const [collection, route] of [
    ["about", "/about"],
    ["contact", "/contact"],
  ]) {
    for (const file of listContentFiles(path.join(root, collection))) {
      const { data } = matter(fs.readFileSync(file, "utf8"));
      if (!publishable(file, data, { allowIndex: true })) continue;
      const rawId = path
        .relative(path.join(root, collection), file)
        .replace(/\.(md|mdx)$/i, "");
      const { prefix } = splitLangDir(rawId, settings.languages);
      register(`${prefix}${route}`, file, data);
    }
  }

  return { excludedPaths, lastmodByPath };
}
