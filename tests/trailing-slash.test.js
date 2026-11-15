// Trailing-slash policy — canonical URLs are slashless
// (`trailingSlash: "never"`), and every host must 301 a trailing-slash
// request to the slashless URL instead of serving the same page.
// The rules live in the host configs (not in code: this is a static
// build with no server middleware), plus a dist scan proving no
// internal link emits a trailing slash in the first place.
// The dist tests skip when dist/ is not built yet — CI runs tests
// before the production build, on a fresh checkout with no dist/.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const distRoot = path.join(repoRoot, "dist");

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

// wrangler.jsonc carries //-comments and trailing commas: strip
// full-line comments only (no string value in that file contains
// "//"), then drop trailing commas before } / ].
function readJsonc(rel) {
  const stripped = read(rel)
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(stripped);
}

test("vercel.json: trailing-slash requests 301 to the slashless URL", () => {
  const vercel = JSON.parse(read("vercel.json"));
  assert.ok(Array.isArray(vercel.redirects), "redirects must exist");
  assert.deepEqual(
    vercel.redirects.filter((r) => r.source === "/:path+/"),
    [{ source: "/:path+/", destination: "/:path+", permanent: true }],
  );
});

test("public/_redirects: one rule strips the trailing slash (301), root untouched", () => {
  const lines = read("public/_redirects")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  assert.deepEqual(lines, ["/*/ /:splat 301"]);
  // The same file is copied to dist/ by the build — the deployed copy
  // is what Cloudflare / Netlify read. Skip the dist check when dist/
  // is not built yet (CI runs tests before the build).
  if (fs.existsSync(path.join(distRoot, "_redirects"))) {
    assert.equal(
      read("dist/_redirects").trim().split("\n").pop(),
      "/*/ /:splat 301",
    );
  }
});

test("wrangler.jsonc: Cloudflare drops the trailing slash natively", () => {
  const wrangler = readJsonc("wrangler.jsonc");
  assert.equal(
    wrangler.assets.html_handling,
    "drop-trailing-slash",
  );
});

test("netlify.toml: no second redirect copy — public/_redirects is the single source", () => {
  const toml = read("netlify.toml");
  // A real [[redirects]] table header sits at line start; the pointer
  // comment above only mentions the word.
  assert.ok(
    !/^\[\[redirects\]\]/m.test(toml),
    "redirect must not be duplicated",
  );
  assert.ok(
    toml.includes("public/_redirects"),
    "netlify.toml must point at public/_redirects",
  );
});

test("nginx: server rewrite strips the trailing slash (301)", () => {
  const conf = read("config/nginx/nginx.conf");
  assert.ok(
    conf.includes("rewrite ^/(.*)/$ /$1 permanent;"),
    "nginx rewrite missing",
  );
});

test("dist: no internal link or canonical ends with a trailing slash (except the root)", (t) => {
  // Needs a production build; CI runs tests before the build.
  if (!fs.existsSync(path.join(distRoot, "index.html"))) {
    t.skip("dist/ not built yet — run pnpm build first");
    return;
  }
  const htmlFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".html")) htmlFiles.push(full);
    }
  };
  walk(distRoot);
  assert.ok(htmlFiles.length > 50, `expected a built dist, got ${htmlFiles.length} pages`);
  const bad = [];
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    // Internal href/src (site-relative, not //external, not exactly "/").
    for (const match of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
      const url = match[1].split(/[?#]/, 1)[0];
      if (url !== "/" && url.endsWith("/")) {
        bad.push(`${path.relative(distRoot, file)}: ${match[1]}`);
      }
    }
    // Canonicals: absolute; only the site root may end with "/".
    for (const match of html.matchAll(
      /<link rel="canonical" href="([^"]*)"/g,
    )) {
      const url = match[1].split(/[?#]/, 1)[0];
      if (
        url !== "https://astroplate.jadoo.bond/" &&
        url.endsWith("/")
      ) {
        bad.push(`${path.relative(distRoot, file)} canonical: ${match[1]}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test("dist: post breadcrumb is Home → Blog → Category → Title (visible trail matches JSON-LD)", (t) => {
  // Needs a production build; CI runs tests before the build.
  const postHtml = path.join(
    distRoot,
    "blog/improve-core-web-vitals-astro-websites/index.html",
  );
  if (!fs.existsSync(postHtml)) {
    t.skip("dist/ not built yet — run pnpm build first");
    return;
  }
  const html = fs.readFileSync(postHtml, "utf8");
  const nav = html.match(
    /<nav aria-label="Breadcrumb">([\s\S]*?)<\/nav>/,
  );
  assert.ok(nav, "breadcrumb nav missing");
  const hrefs = [...nav[1].matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, ["/", "/blog", "/categories/performance"]);
  assert.ok(
    nav[1].includes("How to Improve Core Web Vitals in Astro Websites"),
    "post title must be the last (current) crumb",
  );
});
