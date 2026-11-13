// Wave C tests — security-header config validity.
// Parses the four header configs with small per-format parsers (no
// TOML parser is available in node_modules) and asserts the required
// headers are present, the CSP is identical across targets, HSTS is
// present only where HTTPS is guaranteed, and no disabled third party
// (GTM/Disqus) is allow-listed. These test the repo config files, not
// the live host — the host is what actually serves them.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const REQUIRED_HEADERS = [
  "Content-Security-Policy",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "Permissions-Policy",
];

/** Parse a Cloudflare `_headers` file into { path: { Header: value } }. */
function parseHeadersFile(text) {
  const blocks = {};
  let current = null;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (!line.includes(":") && !rawLine.startsWith(" ")) {
      current = line;
      blocks[current] = {};
      continue;
    }
    const idx = line.indexOf(":");
    if (current && idx > 0) {
      blocks[current][line.slice(0, idx).trim()] = line
        .slice(idx + 1)
        .trim();
    }
  }
  return blocks;
}

/** Parse the netlify.toml [[headers]] values table. */
function parseNetlifyHeaders(text) {
  const values = {};
  const section = text.split("[headers.values]")[1] ?? "";
  for (const line of section.split("\n")) {
    const match = line.match(/^\s*([\w-]+)\s*=\s*"([^"]*)"/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

/** Parse nginx add_header directives, ignoring `#` comments. */
function parseNginxHeaders(text) {
  const stripped = text
    .split("\n")
    .map((line) => line.split("#")[0])
    .join("\n");
  const values = {};
  for (const match of stripped.matchAll(
    /add_header\s+([\w-]+)\s+"([^"]*)"/g,
  )) {
    values[match[1]] = match[2];
  }
  return values;
}

/** Parse vercel.json headers into { Header: value }. */
function parseVercelHeaders(text) {
  const parsed = JSON.parse(text);
  const values = {};
  for (const entry of parsed.headers ?? []) {
    if (entry.source !== "/(.*)") {
      throw new Error(
        `vercel.json: expected a single "/(.*)" source, got ${entry.source}`,
      );
    }
    for (const header of entry.headers ?? []) {
      values[header.key] = header.value;
    }
  }
  return values;
}

const cloudflare = parseHeadersFile(
  fs.readFileSync(path.join(repoRoot, "public/_headers"), "utf8"),
)["/*"];
const netlify = parseNetlifyHeaders(
  fs.readFileSync(path.join(repoRoot, "netlify.toml"), "utf8"),
);
const nginx = parseNginxHeaders(
  fs.readFileSync(path.join(repoRoot, "config/nginx/nginx.conf"), "utf8"),
);
const vercel = parseVercelHeaders(
  fs.readFileSync(path.join(repoRoot, "vercel.json"), "utf8"),
);

test("all four targets send the required headers", () => {
  for (const [name, headers] of [
    ["Cloudflare (_headers)", cloudflare],
    ["Netlify (netlify.toml)", netlify],
    ["nginx (nginx.conf)", nginx],
    ["Vercel (vercel.json)", vercel],
  ]) {
    for (const header of REQUIRED_HEADERS) {
      assert.ok(
        headers[header],
        `${name} is missing ${header}`,
      );
    }
  }
  assert.equal(cloudflare["X-Content-Type-Options"], "nosniff");
  assert.equal(netlify["X-Content-Type-Options"], "nosniff");
  assert.equal(nginx["X-Content-Type-Options"], "nosniff");
  assert.equal(vercel["X-Content-Type-Options"], "nosniff");
});

test("the CSP is identical across all four targets", () => {
  const csp = cloudflare["Content-Security-Policy"];
  assert.ok(csp, "Cloudflare CSP missing");
  assert.equal(netlify["Content-Security-Policy"], csp);
  assert.equal(nginx["Content-Security-Policy"], csp);
  assert.equal(vercel["Content-Security-Policy"], csp);
});

test("the CSP allow-lists only domains actually used", () => {
  const csp = cloudflare["Content-Security-Policy"];
  // R2 media host + YouTube demo + w3schools demo video + form providers.
  for (const domain of [
    "https://media.csofts.tech",
    "https://i.ytimg.com",
    "https://www.youtube-nocookie.com",
    "https://www.w3schools.com",
    "https://formspree.io",
    "https://getform.io",
  ]) {
    assert.ok(csp.includes(domain), `CSP is missing ${domain}`);
  }
  // Disabled third parties must NOT be allow-listed.
  for (const domain of ["disqus", "googletagmanager", "google-analytics"]) {
    assert.ok(!csp.includes(domain), `CSP must not allow ${domain}`);
  }
  // Lockdown directives.
  assert.ok(csp.includes("object-src 'none'"));
  assert.ok(csp.includes("base-uri 'self'"));
  assert.ok(csp.includes("frame-ancestors 'self'"));
  assert.ok(csp.includes("upgrade-insecure-requests"));
});

test("no separate X-Frame-Options header (would conflict with frame-ancestors)", () => {
  for (const [name, headers] of [
    ["Cloudflare", cloudflare],
    ["Netlify", netlify],
    ["nginx", nginx],
    ["Vercel", vercel],
  ]) {
    assert.ok(
      !("X-Frame-Options" in headers),
      `${name} must not send X-Frame-Options alongside frame-ancestors`,
    );
  }
});

test("HSTS only where HTTPS is guaranteed", () => {
  const hsts = "max-age=31536000; includeSubDomains";
  assert.equal(cloudflare["Strict-Transport-Security"], hsts);
  assert.equal(netlify["Strict-Transport-Security"], hsts);
  // Vercel serves this site over HTTPS only (custom domain), so HSTS
  // is included here exactly as in the Cloudflare/Netlify configs.
  assert.equal(vercel["Strict-Transport-Security"], hsts);
  // nginx is an HTTP-only container: no HSTS directive (the comments
  // in the file explain why; the parser strips comments, so a stray
  // directive here would be a real regression).
  assert.ok(
    !("Strict-Transport-Security" in nginx),
    "nginx must not send HSTS — it listens on port 80 only",
  );
});
