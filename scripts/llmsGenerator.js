import { glob } from "glob";
import matter from "gray-matter";
import { parse } from "node-html-parser";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import TurndownService from "turndown";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, "../src/config/config.json");
const LANGUAGE_PATH = path.join(__dirname, "../src/config/language.json");

// ─── Default patterns to always skip ────────────────────────────────────────
const DEFAULT_EXCLUDES = [
  "node_modules",
  "_astro",
  "404",
  "404.html",
  "**/*.xml",
  "**/*.txt",
];

// ─── URL path prefixes that are API / system routes ──────────────────────────
const API_ROUTE_PREFIXES = ["/api/", "/_", "/cdn-cgi/"];

function isApiRoute(urlPath) {
  return API_ROUTE_PREFIXES.some((prefix) => urlPath.startsWith(prefix));
}

// ─── Taxonomy display names ──────────────────────────────────────────────────

// Tag/category pages title themselves from the taxonomy slug ("Css"),
// which reads wrong for acronyms. Map the whole title (case-insensitive)
// to its canonical casing; anything not listed keeps its title.
const ACRONYM_TITLES = {
  css: "CSS",
  seo: "SEO",
  rss: "RSS",
  "json feed": "JSON Feed",
  a11y: "A11y",
  html: "HTML",
  api: "API",
  js: "JS",
  ts: "TS",
  ui: "UI",
  ux: "UX",
  ai: "AI",
  json: "JSON",
  xml: "XML",
  svg: "SVG",
  cdn: "CDN",
  cms: "CMS",
  http: "HTTP",
  url: "URL",
  dom: "DOM",
};

/** Fix the display name of a tag/category page in place (page-data level). */
function normaliseTaxonomyTitle(page) {
  if (
    !page.urlPath.startsWith("/tags/") &&
    !page.urlPath.startsWith("/categories/")
  ) {
    return;
  }
  const mapped = ACRONYM_TITLES[page.title.trim().toLowerCase()];
  if (mapped) page.title = mapped;
}

/** True for a single blog post page: /blog/<slug> (not the index, not a page/N). */
function isBlogPostPage(urlPath) {
  return (
    urlPath.startsWith("/blog/") &&
    urlPath.split("/").filter(Boolean).length === 2
  );
}

/** True for a pagination page: any path with a "page" segment (/blog/page/2, ...). */
function isPaginationPage(urlPath) {
  const parts = urlPath.split("/").filter(Boolean);
  return parts.some((part, i) => part === "page" && i < parts.length - 1);
}

/**
 * Applies the llms.show_* config flags to the collected pages.
 * Runs ONCE, after the sort and before any output is written, so
 * llms.txt, llms-full.txt and the per-page .md files stay consistent.
 * A flag that is not explicitly `true` excludes its section.
 */
function filterLlmsPages(pages, llmsConfig) {
  return pages.filter((page) => {
    const firstSegment = page.urlPath.split("/").filter(Boolean)[0];

    if (!llmsConfig.show_pagination && isPaginationPage(page.urlPath)) {
      return false;
    }
    if (!llmsConfig.show_tags && firstSegment === "tags") return false;
    if (!llmsConfig.show_categories && firstSegment === "categories") {
      return false;
    }
    if (!llmsConfig.show_authors && firstSegment === "authors") return false;
    return true;
  });
}

/**
 * Reads each blog post's publish date from its source frontmatter.
 * Returns a Map from blog URL path ("/blog/<slug>") to a Date, or null
 * when the post has no parseable date. A frontmatter `slug` wins over
 * the filename, mirroring src/lib/utils/slug.ts; "-index.md" is the
 * blog listing, not a post.
 */
function getBlogPostDates() {
  const blogDir = path.join(__dirname, "../src/content/blog");
  const dates = new Map();

  if (!fs.existsSync(blogDir)) return dates;

  for (const file of fs.readdirSync(blogDir)) {
    if (!/\.mdx?$/.test(file) || file.startsWith("-")) continue;
    try {
      const { data } = matter(
        fs.readFileSync(path.join(blogDir, file), "utf8"),
      );
      const stem = file.replace(/\.mdx?$/, "");
      const slug =
        typeof data.slug === "string" && data.slug.trim()
          ? data.slug
              .trim()
              .replace(/^blog\//, "")
              .toLowerCase()
          : stem;
      const parsed = data.date ? new Date(data.date) : null;
      dates.set(
        `/blog/${slug}`,
        parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
      );
    } catch {
      // Unreadable frontmatter: the post sorts as undated.
    }
  }

  return dates;
}

/**
 * Orders pages for output: Home first, About second, blog posts
 * newest-first (dates from source frontmatter; undated posts sort last,
 * ties break by slug), then everything else alphabetically by URL.
 */
function orderLlmsPages(pages, postDates) {
  const home = [];
  const about = [];
  const posts = [];
  const rest = [];

  for (const page of pages) {
    if (page.urlPath === "/") home.push(page);
    else if (page.urlPath === "/about") about.push(page);
    else if (isBlogPostPage(page.urlPath)) posts.push(page);
    else rest.push(page);
  }

  posts.sort((a, b) => {
    const dateA = postDates.get(a.urlPath);
    const dateB = postDates.get(b.urlPath);
    if (dateA && dateB) {
      const diff = dateB.getTime() - dateA.getTime();
      if (diff !== 0) return diff;
    } else if (dateA) {
      return -1;
    } else if (dateB) {
      return 1;
    }
    return a.urlPath.localeCompare(b.urlPath);
  });

  rest.sort((a, b) => a.urlPath.localeCompare(b.urlPath));

  return [...home, ...about, ...posts, ...rest];
}

// ─── Config ──────────────────────────────────────────────────────────────────
function getConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error("config.json not found");
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

  if (!config.llms) {
    throw new Error("llms configuration not found in config.json");
  }

  return config;
}

async function getAstroI18nConfig() {
  const astroPath = path.join(__dirname, "../astro.config.mjs");
  if (!fs.existsSync(astroPath)) return null;

  let content = fs.readFileSync(astroPath, "utf8");
  const projectRoot = path.resolve(__dirname, "..");

  // Replace JSON imports with fs.readFileSync so plain Node can evaluate the file
  content = content.replace(
    /import\s+config\s+from\s+['"]\.\/src\/config\/config\.json['"];?\s*\n/,
    `const config = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(projectRoot, "src/config/config.json"))}));
`,
  );
  content = content.replace(
    /import\s+languagesJSON\s+from\s+['"]\.\/src\/config\/language\.json['"];?\s*\n/,
    `const languagesJSON = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(projectRoot, "src/config/language.json"))}));
`,
  );
  content = content.replace(
    /import\s+theme\s+from\s+['"]\.\/src\/config\/theme\.json['"];?\s*\n/,
    `const theme = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(projectRoot, "src/config/theme.json"))}));
`,
  );

  // Remove named imports from astro/config (we polyfill them below)
  content = content.replace(
    /import\s+\{\s*defineConfig\s*,\s*fontProviders\s*\}\s+from\s+['"]astro\/config['"];?\s*\n/,
    "\n",
  );

  // Stub remaining package imports so the config object evaluates safely
  const stubImports = [
    {
      regex: /import\s+mdx\s+from\s+['"]@astrojs\/mdx['"];?\s*\n/,
      name: "mdx",
    },
    {
      regex: /import\s+react\s+from\s+['"]@astrojs\/react['"];?\s*\n/,
      name: "react",
    },
    {
      regex: /import\s+sitemap\s+from\s+['"]@astrojs\/sitemap['"];?\s*\n/,
      name: "sitemap",
    },
    {
      regex: /import\s+tailwindcss\s+from\s+['"]@tailwindcss\/vite['"];?\s*\n/,
      name: "tailwindcss",
    },
    {
      regex: /import\s+AutoImport\s+from\s+['"]astro-auto-import['"];?\s*\n/,
      name: "AutoImport",
    },
    {
      regex: /import\s+remarkCollapse\s+from\s+['"]remark-collapse['"];?\s*\n/,
      name: "remarkCollapse",
    },
    {
      regex: /import\s+remarkToc\s+from\s+['"]remark-toc['"];?\s*\n/,
      name: "remarkToc",
    },
    { regex: /import\s+sharp\s+from\s+['"]sharp['"];?\s*\n/, name: "sharp" },
  ];

  for (const { regex, name } of stubImports) {
    content = content.replace(regex, `const ${name} = () => ({});\n`);
  }

  // Prepend fs import and polyfills
  const tempContent = `import fs from "node:fs";
const defineConfig = (x) => x;
const fontProviders = { google: () => ({}) };
${content}`;

  const tempName = `astro.config.llms-temp-${Date.now()}.mjs`;
  const tempPath = path.join(projectRoot, tempName);

  fs.writeFileSync(tempPath, tempContent, "utf8");

  try {
    const mod = await import(tempPath);
    fs.unlinkSync(tempPath);
    return mod.default?.i18n || null;
  } catch (err) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    console.warn(
      `   ⚠️  Could not read i18n from astro.config.mjs: ${err.message}`,
    );
    return null;
  }
}

function getLanguageFallback() {
  let languages = [];
  let defaultLanguage = "";
  let defaultLanguageInSubdir = false;

  try {
    if (fs.existsSync(LANGUAGE_PATH)) {
      const languagesJSON = JSON.parse(fs.readFileSync(LANGUAGE_PATH, "utf8"));
      languages = languagesJSON.map((l) => l.languageCode).filter(Boolean);
    }
  } catch {
    // ignore missing or malformed language.json
  }

  try {
    const config = getConfig();
    defaultLanguage = config.settings?.default_language || "";
    defaultLanguageInSubdir =
      config.settings?.default_language_in_subdir === true;
  } catch {
    // ignore
  }

  return { languages, defaultLanguage, defaultLanguageInSubdir };
}

function isDefaultLanguagePath(
  urlPath,
  languages,
  defaultLanguage,
  defaultInSubdir,
) {
  if (!languages.length || !defaultLanguage) return true;

  const parts = urlPath.split("/").filter(Boolean);
  const firstPart = parts[0];

  const isLangPrefixed = languages.includes(firstPart);

  if (defaultInSubdir) {
    // Only keep paths explicitly prefixed with the default language
    return firstPart === defaultLanguage;
  }

  // defaultInSubdir is false: default language lives at root.
  // Keep only non-prefixed paths.
  return !isLangPrefixed;
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the Astro static-asset output directory.
 * In SSR mode (output: "server") Astro puts static files in dist/client/.
 * In static mode (output: "static") they go directly in dist/.
 */
function getClientDir(distFolder) {
  const clientDir = path.join(distFolder, "client");
  return fs.existsSync(clientDir) ? clientDir : distFolder;
}

function normalizePattern(baseDir, pattern) {
  const cleanPattern = pattern.replace(/^\/+/, "");
  const fullPath = path.join(baseDir, cleanPattern);

  try {
    if (fs.statSync(fullPath).isDirectory()) {
      return path.join(fullPath, "**/*.html");
    }
  } catch {
    // treat as glob pattern
  }

  return fullPath;
}

async function discoverHtmlFiles(clientDir, excludePatterns, includePatterns) {
  const patterns =
    includePatterns?.length > 0
      ? includePatterns.map((p) => normalizePattern(clientDir, p))
      : [path.join(clientDir, "**/*.html")];

  const userExcludes = (excludePatterns || []).map((p) =>
    normalizePattern(clientDir, p),
  );

  const ignore = [
    ...DEFAULT_EXCLUDES.map((p) => path.join(clientDir, p)),
    ...userExcludes,
  ];

  let files = await glob(patterns, { ignore, absolute: true });

  files = files.filter((f) => fs.statSync(f).isFile() && f.endsWith(".html"));

  return files.sort();
}

function fileToUrlPath(filePath, clientDir) {
  const relativePath = filePath.replace(path.resolve(clientDir), "");
  let urlPath = relativePath.replace(/\\/g, "/").replace(/^\//, "");

  urlPath = urlPath.replace(/\.html$/, "");

  if (urlPath.endsWith("/index") || urlPath === "index") {
    urlPath = urlPath.replace(/\/index$/, "").replace(/^index$/, "");
  }

  return "/" + urlPath;
}

// ─── HTML parsing helpers ─────────────────────────────────────────────────────

function getTitle(root, titleSelector) {
  let el;
  if (titleSelector) el = root.querySelector(titleSelector);
  if (!el) el = root.querySelector("h1");
  if (!el) el = root.querySelector("h2");
  if (!el) el = root.querySelector("h3");
  if (!el) el = root.querySelector("title");
  return el?.text?.trim() || "";
}

function getContentElement(root, contentSelector) {
  let el;
  if (contentSelector) el = root.querySelector(contentSelector);
  if (!el) el = root.querySelector("main");
  if (!el) el = root.querySelector("body");
  if (!el) el = root.querySelector("html");
  return el;
}

/** True when the built HTML opts out of indexing (`noindex` robots meta). */
function isNoindexHtml(html) {
  const root = parse(html);
  const robotsContent =
    root.querySelector('meta[name="robots"]')?.getAttribute("content") || "";
  return /(^|,)\s*noindex(\s|,|$)/i.test(robotsContent);
}

/**
 * Rewrites site-root-relative URLs in generated Markdown to absolute URLs,
 * e.g. `![alt](/_astro/x.webp)` → `![alt](https://astroplate.jadoo.bond/_astro/x.webp)`.
 * LLMs reading llms-full.txt and the per-page .md files have no base URL to
 * resolve relative paths against, so relative links and images are dead
 * ends for them. Absolute http(s) URLs are untouched (the pattern only
 * matches destinations starting with `/`); `new URL()` resolves
 * protocol-relative (`//cdn…`) URLs against the base, and returns
 * `data:`, `mailto:` and other non-hierarchical URLs unchanged.
 * A link title after the URL (`[text](/u "title")`) is preserved: the
 * match stops at the first whitespace.
 */
export function absolutiseMarkdownUrls(markdown, siteUrl) {
  if (!markdown || !siteUrl) return markdown;
  return markdown.replace(/\]\(\/[^)\s]*/g, (match) => {
    const url = match.slice(2); // strip "]("
    try {
      return `](${new URL(url, siteUrl).href}`;
    } catch {
      return match;
    }
  });
}

function normaliseHrefPath(href) {
  if (!href) return "";
  let p = href.split("#")[0].split("?")[0];
  try {
    // Absolute links to this site: compare by pathname only.
    p = new URL(p, "http://localhost").pathname;
  } catch {
    // Relative href: use as-is.
  }
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

function hasClass(el, cls) {
  const classes = (el.getAttribute?.("class") || "").split(/\s+/);
  return classes.includes(cls);
}

function closestAncestor(el, predicate) {
  let node = el.parentNode;
  while (node) {
    if (predicate(node)) return node;
    node = node.parentNode;
  }
  return null;
}

/**
 * Removes page furniture and code samples from the extracted content
 * before it is converted to Markdown. The llms files carry clean prose
 * an LLM — or an agent following the file's links in real time — can
 * read and use:
 * - code blocks (<pre>): the articles' samples are whole example files
 *   (a full [id].astro, a full tokens.css); in a prose file they read
 *   as source dumps, not content. Inline <code> stays — it is part of
 *   sentences.
 * - the Tags / Share row at the end of a blog post: tag links plus share
 *   buttons that Turndown renders as empty `[]()` anchors.
 * - the "Related Posts" card grid after a post: the related posts are
 *   full entries elsewhere in this file, so the cards only duplicate
 *   them (images, excerpts, read-more links).
 * Matching is by visible text / structure, not theme classes, so a
 * redesign that renames classes does not silently re-include the noise.
 */
export function stripLlmsContentNoise(contentElement) {
  if (!contentElement) return;

  contentElement.querySelectorAll("pre").forEach((el) => el.remove());

  contentElement.querySelectorAll("span").forEach((span) => {
    if (span.text.trim() === "Share :" || span.text.trim() === "Tags :") {
      const row = closestAncestor(span, (el) => hasClass(el, "row"));
      if (row && row.parentNode) row.remove();
    }
  });

  contentElement.querySelectorAll("h2").forEach((h2) => {
    if (h2.text.trim() === "Related Posts") {
      const section = closestAncestor(h2, (el) => hasClass(el, "section"));
      if (section && section.parentNode) section.remove();
    }
  });
}

async function processHtml(
  html,
  llmsConfig,
  noindexPaths = new Set(),
  siteUrl = "",
) {
  const root = parse(html);

  // A page that opts out of indexing (`noindex,follow`) must not leak into
  // llms.txt / llms-full.txt / its per-page .md file either.
  const noindex = isNoindexHtml(html);

  const title = getTitle(root, llmsConfig?.title_selector);

  const metaDescription = root.querySelector('meta[name="description"]');
  const description = metaDescription?.getAttribute("content") || "";

  const contentElement = getContentElement(root, llmsConfig?.content_selector);
  let content = "";

  if (contentElement) {
    contentElement
      .querySelectorAll("script, style, noscript, iframe, svg")
      .forEach((el) => el.remove());

    // Page furniture and code samples do not belong in the llms files
    // (see stripLlmsContentNoise): tags/share/related-posts and <pre>.
    stripLlmsContentNoise(contentElement);

    // A noindex page must not leak through OTHER pages either: listing
    // pages carry BlogCards linking to it, and llms-full.txt concatenates
    // every page's content. Strip links to noindex pages (the whole anchor,
    // so the card title / "read more" text goes with it) before converting.
    if (noindexPaths.size > 0) {
      contentElement.querySelectorAll("a").forEach((a) => {
        if (noindexPaths.has(normaliseHrefPath(a.getAttribute("href")))) {
          a.remove();
        }
      });
    }

    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });

    turndownService.addRule("removeChrome", {
      filter: ["nav", "footer", "header", "aside"],
      replacement: () => "",
    });

    content = turndownService.turndown(contentElement.innerHTML);

    // The generated Markdown is read by LLMs with no base URL, so every
    // site-relative link/image must be absolute (see absolutiseMarkdownUrls).
    content = absolutiseMarkdownUrls(content, siteUrl);
  }

  return { title, description, content, noindex };
}

async function processHtmlFile(
  filePath,
  llmsConfig,
  noindexPaths,
  siteUrl = "",
) {
  const html = fs.readFileSync(filePath, "utf8");
  return processHtml(html, llmsConfig, noindexPaths, siteUrl);
}

/**
 * Fetches a page from a server and processes it as HTML.
 * Returns null if the fetch fails or the page returns an error status.
 */
async function fetchAndProcessPage(
  url,
  llmsConfig,
  noindexPaths,
  siteUrl = "",
) {
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    const html = await response.text();
    return processHtml(html, llmsConfig, noindexPaths, siteUrl);
  } catch {
    return null;
  }
}

// ─── Temporary server management ──────────────────────────────────────────────

const TEMP_PORT = 14321;
const TEMP_HOST = "127.0.0.1";

/**
 * Checks if a server is already reachable at the given URL.
 */
async function isServerRunning(url) {
  try {
    const r = await fetch(url + "/", {
      signal: AbortSignal.timeout(2_000),
      headers: { Accept: "text/html" },
    });
    return r.status < 500;
  } catch {
    return false;
  }
}

/**
 * Spawns dist/server/entry.mjs on TEMP_PORT and waits until it's ready.
 * Returns { process, baseUrl } or null if it can't be started.
 */
async function startTempServer(distFolder) {
  const entryPath = path.join(distFolder, "server", "entry.mjs");

  if (!fs.existsSync(entryPath)) {
    console.log(
      "   ⚠️  No standalone server entry (dist/server/entry.mjs) found.",
    );
    return null;
  }

  console.log(
    `   Spawning built server on port ${TEMP_PORT} to render SSR pages...`,
  );

  const serverProcess = spawn(process.execPath, [entryPath], {
    env: {
      ...process.env,
      PORT: String(TEMP_PORT),
      HOST: TEMP_HOST,
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  serverProcess.stderr.on("data", (d) => {
    // Suppress noise but keep it available for debugging
    if (process.env.LLMS_DEBUG) process.stderr.write(d);
  });

  const tempBaseUrl = `http://${TEMP_HOST}:${TEMP_PORT}`;

  // Poll until the server responds or timeout
  const ready = await new Promise((resolve) => {
    const TIMEOUT_MS = 20_000;
    const POLL_MS = 400;

    const deadline = setTimeout(() => {
      clearInterval(poll);
      resolve(false);
    }, TIMEOUT_MS);

    const poll = setInterval(async () => {
      try {
        const r = await fetch(tempBaseUrl + "/", {
          signal: AbortSignal.timeout(1_000),
        });
        if (r.status < 500) {
          clearInterval(poll);
          clearTimeout(deadline);
          resolve(true);
        }
      } catch {
        // not ready yet
      }
    }, POLL_MS);

    serverProcess.on("error", () => {
      clearInterval(poll);
      clearTimeout(deadline);
      resolve(false);
    });

    serverProcess.on("exit", (code) => {
      if (code !== null) {
        clearInterval(poll);
        clearTimeout(deadline);
        resolve(false);
      }
    });
  });

  if (!ready) {
    console.log("   ⚠️  Temp server did not become ready in time.");
    serverProcess.kill();
    return null;
  }

  console.log(`   ✓ Temp server ready at ${tempBaseUrl}`);
  return { process: serverProcess, baseUrl: tempBaseUrl };
}

function stopTempServer(serverHandle) {
  if (serverHandle?.process) {
    serverHandle.process.kill();
    console.log("   Stopped temporary server.\n");
  }
}

// ─── SSR page discovery from source ──────────────────────────────────────────

/**
 * Scans src/pages/ for static (non-dynamic) route files and returns their
 * URL paths. Dynamic routes ([slug].astro) and the api/ folder are excluded
 * since they either already have HTML files or are API-only.
 */
function discoverSsrPageRoutes(srcPagesDir, basePath) {
  if (!fs.existsSync(srcPagesDir)) return [];

  const routes = [];

  function scanDir(dir, urlPrefix) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const name = entry.name;

      // Skip hidden items and the api/ directory
      if (name.startsWith(".") || name === "api") continue;

      const fullPath = path.join(dir, name);

      if (entry.isDirectory()) {
        scanDir(fullPath, `${urlPrefix}/${name}`);
      } else if (
        entry.isFile() &&
        /\.(astro|md|mdx|ts|js)$/.test(name) &&
        !name.startsWith("_") &&
        !name.startsWith("[") // skip dynamic routes — they have per-entry HTML files
      ) {
        const stem = name.replace(/\.(astro|md|mdx|ts|js)$/, "");

        if (stem === "404") continue;

        const routePath =
          stem === "index" ? urlPrefix || "/" : `${urlPrefix}/${stem}`;

        const normalizedRoute = routePath || "/";

        if (isApiRoute(normalizedRoute)) continue;

        routes.push(normalizedRoute);
      }
    }
  }

  scanDir(srcPagesDir, basePath === "/" ? "" : basePath.replace(/\/$/, ""));

  return [...new Set(routes)].sort();
}

// ─── Output generators ────────────────────────────────────────────────────────

function generateMarkdownFile(page, siteUrl) {
  const url = `${siteUrl}${page.urlPath}`.replace(/(?<=.)\/$/, "");

  let md = "---\n";
  md += `title: "${page.title.replace(/"/g, '\\"')}"\n`;
  md += `url: "${url}"\n`;
  if (page.description) {
    md += `description: "${page.description.replace(/"/g, '\\"')}"\n`;
  }
  md += "---\n\n";
  md += page.content;

  return md;
}

function generateLlmsTxtContent(
  pages,
  siteUrl,
  siteName,
  siteDescription,
  generateIndividualMd,
) {
  let content = `# ${siteName}\n\n`;

  if (siteDescription) {
    content += `> ${siteDescription}\n\n`;
  }

  content +=
    "This file helps language models discover the most useful content on this site.\n\n";

  // Pages arrive pre-ordered: Home, About, blog posts newest-first, then
  // everything else. The first three groups get their own section; the
  // rest goes under a single "Optional" section (no per-folder headings,
  // so e.g. the privacy page is just titled "Privacy").
  const sections = [
    { heading: "Home", pages: [] },
    { heading: "About", pages: [] },
    { heading: "Blog", pages: [] },
    { heading: "Optional", pages: [] },
  ];

  pages.forEach((page) => {
    if (page.urlPath === "/") sections[0].pages.push(page);
    else if (page.urlPath === "/about") sections[1].pages.push(page);
    else if (isBlogPostPage(page.urlPath)) sections[2].pages.push(page);
    else sections[3].pages.push(page);
  });

  sections.forEach(({ heading, pages: sectionPages }) => {
    if (sectionPages.length === 0) return;

    content += `## ${heading}\n\n`;

    sectionPages.forEach((page) => {
      let linkUrl;
      if (generateIndividualMd) {
        const mdPath =
          page.urlPath === "/" ? "/index.md" : `${page.urlPath}.md`;
        linkUrl = `${siteUrl}${mdPath}`.replace(/([^:])\/\//g, "$1/");
      } else {
        linkUrl = `${siteUrl}${page.urlPath}`.replace(/(?<=.)\/$/, "");
      }
      const linkText = page.title || page.urlPath;

      if (page.description) {
        content += `- [${linkText}](${linkUrl}): ${page.description}\n`;
      } else {
        content += `- [${linkText}](${linkUrl})\n`;
      }
    });

    content += "\n";
  });

  return content;
}

function generateLlmsFullTxtContent(pages, siteUrl, siteName) {
  let content = `# ${siteName}\n\n`;
  content += `URL: ${siteUrl}\n\n`;

  pages.forEach((page, index) => {
    const url = `${siteUrl}${page.urlPath}`.replace(/(?<=.)\/$/, "");
    content += `## ${page.title}\n\n`;
    content += `URL: ${url}\n\n`;

    if (page.description) {
      content += `${page.description}\n\n`;
    }

    content += page.content;

    if (index < pages.length - 1) {
      content += "\n\n---\n\n";
    }
  });

  return content;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function generateLlmsFiles() {
  const config = getConfig();
  const llms = config.llms;

  const astroI18n = await getAstroI18nConfig();
  const fallback = getLanguageFallback();

  const languages = astroI18n?.locales || fallback.languages;
  const defaultLanguage = astroI18n?.defaultLocale || fallback.defaultLanguage;
  const defaultLanguageInSubdir = fallback.defaultLanguageInSubdir;

  const distFolder = path.join(__dirname, "../dist");

  if (!fs.existsSync(distFolder)) {
    console.error("❌ dist/ folder does not exist. Run 'astro build' first.");
    process.exit(1);
  }

  // In SSR mode static assets live in dist/client/; in static mode in dist/
  const clientDir = getClientDir(distFolder);
  const isSSR = clientDir !== distFolder;

  console.log(
    `📂 Output mode: ${isSSR ? "SSR (dist/client)" : "Static (dist)"}`,
  );

  const siteUrl = config.site.base_url.replace(/\/$/, "");
  const basePath = (config.site.base_path || "/").replace(/\/$/, "") || "/";
  const siteName = config.site.title;
  const siteDescription = config.metadata?.meta_description || "";

  // ── Step 1: Discover pre-rendered HTML files ────────────────────────────
  console.log("\n🔍 Discovering pre-rendered HTML files...");
  const htmlFiles = await discoverHtmlFiles(
    clientDir,
    llms.exclude,
    llms.include,
  );
  console.log(`   Found ${htmlFiles.length} pre-rendered HTML files`);

  let pages = [];
  const seenPaths = new Set();

  // Pre-pass: collect the URL paths of every noindex page first, so links
  // to them can be stripped from listing pages' content (see processHtml).
  const noindexPaths = new Set();
  for (const file of htmlFiles) {
    try {
      if (isNoindexHtml(fs.readFileSync(file, "utf8"))) {
        noindexPaths.add(fileToUrlPath(file, clientDir));
      }
    } catch {
      // Unreadable file: the main loop below reports it.
    }
  }
  if (noindexPaths.size > 0) {
    console.log(
      `   Found ${noindexPaths.size} noindex page(s); links to them will be stripped from llms output`,
    );
  }

  for (const file of htmlFiles) {
    try {
      const urlPath = fileToUrlPath(file, clientDir);

      if (isApiRoute(urlPath)) {
        console.log(`   ⤷ Skipping API route: ${urlPath}`);
        continue;
      }

      if (
        !isDefaultLanguagePath(
          urlPath,
          languages,
          defaultLanguage,
          defaultLanguageInSubdir,
        )
      ) {
        console.log(`   ⤷ Skipping non-default language: ${urlPath}`);
        continue;
      }

      if (seenPaths.has(urlPath)) continue;
      seenPaths.add(urlPath);

      const pageData = await processHtmlFile(file, llms, noindexPaths, siteUrl);

      if (pageData.noindex) {
        console.log(`   ⤷ Skipping noindex page: ${urlPath}`);
        continue;
      }

      if (!pageData.title) {
        console.log(`   ⚠️  No title found for ${urlPath}, skipping`);
        continue;
      }

      pages.push({
        urlPath,
        filePath: file,
        source: "prerendered",
        ...pageData,
      });
      console.log(`   ✓ [static] ${urlPath}: "${pageData.title}"`);
    } catch (error) {
      console.error(`   ✗ Error processing ${file}: ${error.message}`);
    }
  }

  // ── Step 2: Fetch SSR-only pages ───────────────────────────────────────
  if (isSSR) {
    const srcPagesDir = path.join(__dirname, "../src/pages");
    const ssrRoutes = discoverSsrPageRoutes(srcPagesDir, basePath);
    const missingRoutes = ssrRoutes
      .filter((r) =>
        isDefaultLanguagePath(
          r,
          languages,
          defaultLanguage,
          defaultLanguageInSubdir,
        ),
      )
      .filter((r) => !seenPaths.has(r));

    if (missingRoutes.length === 0) {
      console.log("\n✓ All source routes already captured by static HTML.");
    } else {
      console.log(
        `\n🌐 Fetching ${missingRoutes.length} SSR-only route(s): ${missingRoutes.join(", ")}`,
      );

      // Determine which server to use: the configured siteUrl or a temp server
      let fetchBase = null;
      let tempServerHandle = null;

      if (await isServerRunning(siteUrl)) {
        fetchBase = siteUrl;
        console.log(`   Using running server at ${fetchBase}`);
      } else {
        tempServerHandle = await startTempServer(distFolder);
        if (tempServerHandle) {
          fetchBase = tempServerHandle.baseUrl;
        } else {
          console.log(
            "   ⚠️  No server available. SSR pages will be skipped.\n" +
              "       Run 'pnpm preview' before 'pnpm generate-llms' to include them.",
          );
        }
      }

      if (fetchBase) {
        for (const route of missingRoutes) {
          const url = `${fetchBase}${route}`;
          process.stdout.write(`   ⤷ Fetching ${route} ... `);

          const pageData = await fetchAndProcessPage(
            url,
            llms,
            noindexPaths,
            siteUrl,
          );

          if (!pageData) {
            console.log("❌ failed");
            continue;
          }

          if (pageData.noindex) {
            console.log("⤷ noindex, skipping");
            continue;
          }

          if (!pageData.title) {
            console.log("⚠️  no title, skipping");
            continue;
          }

          seenPaths.add(route);
          pages.push({
            urlPath: route,
            filePath: null,
            source: "ssr",
            ...pageData,
          });
          console.log(`✓ "${pageData.title}"`);
        }
      }

      stopTempServer(tempServerHandle);
    }
  }

  // Sort pages: home first, then alphabetically
  pages.sort((a, b) => {
    if (a.urlPath === "/") return -1;
    if (b.urlPath === "/") return 1;
    return a.urlPath.localeCompare(b.urlPath);
  });

  // Apply the llms.show_* flags ONCE, so llms.txt, llms-full.txt and the
  // per-page .md files all agree on the page set.
  const unfilteredCount = pages.length;
  pages = filterLlmsPages(pages, llms);
  if (pages.length < unfilteredCount) {
    console.log(
      `   Filtered out ${unfilteredCount - pages.length} page(s) via llms.show_* flags`,
    );
  }

  // Canonical display names for tag/category pages (CSS, SEO, ...).
  pages.forEach(normaliseTaxonomyTitle);

  // Order for output: Home, About, blog posts newest-first, then the rest.
  pages = orderLlmsPages(pages, getBlogPostDates());

  console.log(`\n   ✅ Total pages processed: ${pages.length}\n`);

  // ── Step 3: Generate individual .md files ──────────────────────────────
  if (llms.generate_individual_md) {
    console.log("📝 Generating individual .md files...");

    // Remove stale .md files from previous runs (e.g. non-default languages)
    function deleteStaleMdFiles(dir) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          deleteStaleMdFiles(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          fs.unlinkSync(fullPath);
        }
      }
    }
    deleteStaleMdFiles(clientDir);

    for (const page of pages) {
      // Home → index.md, everything else → <url-path>.md
      const mdRelative =
        page.urlPath === "/" ? "index" : page.urlPath.replace(/^\//, "");
      const mdPath = path.join(clientDir, mdRelative + ".md");

      const mdContent = generateMarkdownFile(page, siteUrl);

      const mdDir = path.dirname(mdPath);
      if (!fs.existsSync(mdDir)) {
        fs.mkdirSync(mdDir, { recursive: true });
      }

      fs.writeFileSync(mdPath, mdContent, "utf8");
      console.log(`   ✓ ${path.relative(distFolder, mdPath)}`);
    }

    console.log(`   Created ${pages.length} .md files\n`);
  }

  // ── Step 4: Generate llms.txt ──────────────────────────────────────────
  if (llms.generate_llms_txt) {
    console.log("📋 Generating llms.txt...");

    const llmsTxtContent = generateLlmsTxtContent(
      pages,
      siteUrl,
      siteName,
      siteDescription,
      llms.generate_individual_md,
    );
    const llmsTxtPath = path.join(clientDir, "llms.txt");

    fs.writeFileSync(llmsTxtPath, llmsTxtContent, "utf8");
    console.log(`   ✓ ${path.relative(distFolder, llmsTxtPath)}\n`);
  }

  // ── Step 5: Generate llms-full.txt ────────────────────────────────────
  if (llms.generate_llms_full_txt) {
    console.log("📚 Generating llms-full.txt...");

    const llmsFullContent = generateLlmsFullTxtContent(
      pages,
      siteUrl,
      siteName,
    );
    const llmsFullPath = path.join(clientDir, "llms-full.txt");

    fs.writeFileSync(llmsFullPath, llmsFullContent, "utf8");
    console.log(`   ✓ ${path.relative(distFolder, llmsFullPath)}\n`);
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log("✅ LLMS generation complete!\n");
  console.log("Summary:");
  console.log(`  Pages processed : ${pages.length}`);
  console.log(
    `  Sources         : ${pages.filter((p) => p.source === "prerendered").length} static HTML, ${pages.filter((p) => p.source === "ssr").length} SSR-fetched`,
  );
  if (llms.generate_individual_md) {
    console.log(
      `  .md files       : ${pages.length} (in ${path.relative(distFolder, clientDir)}/)`,
    );
  }
  if (llms.generate_llms_txt) {
    console.log(
      `  llms.txt        : ${path.relative(distFolder, path.join(clientDir, "llms.txt"))}`,
    );
  }
  if (llms.generate_llms_full_txt) {
    console.log(
      `  llms-full.txt   : ${path.relative(distFolder, path.join(clientDir, "llms-full.txt"))}`,
    );
  }
}

// Only run the generator when executed directly (`node scripts/llmsGenerator.js`).
// Importing this module (e.g. from tests/llms.test.js) must not start a run.
const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  generateLlmsFiles().catch((error) => {
    console.error("❌ Error:", error.message);
    process.exit(1);
  });
}
