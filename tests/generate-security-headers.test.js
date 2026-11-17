// Security-header generator tests — scripts/generate-security-headers.mjs.
// The generator is the single source of truth for the policy: csp.json
// holds the values, the script renders the five host files. The round-trip
// tests below pin the current live policy — if csp.json changes on purpose,
// regenerate (pnpm headers) and the round-trips pass again.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

register("./json-hooks.mjs", import.meta.url);
const {
  HOST_FILES,
  RENDERERS,
  buildCspString,
  generateAll,
  headersForHost,
  loadConfig,
} = await import("../scripts/generate-security-headers.mjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

const LIVE_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' https://openremark.bond; " +
  "style-src 'self' 'unsafe-inline'; img-src 'self' data: https://media.csofts.tech " +
  "https://i.ytimg.com https://openremark.bond https://lh3.googleusercontent.com; " +
  "media-src 'self' https://media.csofts.tech https://www.w3schools.com; " +
  "font-src 'self' data:; connect-src 'self' https://openremark.bond; " +
  "frame-src https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; " +
  "form-action 'self' https://formspree.io https://getform.io; frame-ancestors 'self'; " +
  "upgrade-insecure-requests";

test("buildCspString: the live policy, in live directive order, bare upgrade-insecure-requests", () => {
  const config = loadConfig();
  assert.equal(buildCspString(config.content_security_policy), LIVE_CSP);
});

test("headersForHost: HSTS on Vercel/Worker/Netlify/Apache, never on nginx", () => {
  const config = loadConfig();
  const names = (host) => headersForHost(config, host).map(([name]) => name);
  assert.deepEqual(names("vercel"), [
    "Content-Security-Policy",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Strict-Transport-Security",
  ]);
  assert.deepEqual(names("apache"), names("vercel"));
  assert.deepEqual(names("nginx"), [
    "Content-Security-Policy",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
  ]);
  assert.equal(headersForHost(config, "vercel")[0][1], LIVE_CSP);
});

test("round-trip: rendering the four committed host files changes nothing", () => {
  const config = loadConfig();
  for (const host of ["vercel", "worker", "netlify", "nginx"]) {
    const file = HOST_FILES[host];
    assert.equal(
      RENDERERS[host](read(file), headersForHost(config, host)),
      read(file),
      `${file} (${host}) is not byte-identical after rendering`,
    );
  }
});

test("apache: rendering is idempotent, and a stripped file regains the block", () => {
  const config = loadConfig();
  const current = read(HOST_FILES.apache);
  const headers = headersForHost(config, "apache");
  assert.equal(RENDERERS.apache(current, headers), current);
  const stripped = current
    .replace(/##### Security headers - GENERATED[\s\S]*?END\r?\n?/, "")
    .replace(/\r\n$/, "");
  const rebuilt = RENDERERS.apache(stripped, headers);
  assert.equal(rebuilt, current);
  assert.match(rebuilt, /Header always set Content-Security-Policy "/);
  assert.match(rebuilt, /Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"/);
  // The generated block matches the file's CRLF line endings.
  assert.ok(rebuilt.includes("\r\n"), "apache block should use CRLF like the rest of .htaccess");
});

test("hosts toggle: a disabled host is skipped, the rest still generate", () => {
  const config = loadConfig();
  const disabled = { ...config, hosts: { ...config.hosts, apache: false, nginx: false } };
  const made = generateAll(disabled, read);
  assert.deepEqual(
    made.map((r) => r.host),
    ["vercel", "worker", "netlify"],
  );
  const vercel = made.find((r) => r.host === "vercel");
  assert.equal(vercel.next, read(HOST_FILES.vercel));
});

test("loadConfig: unknown host or HSTS host is rejected", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "csp-config-"));
  try {
    const badHost = path.join(dir, "bad-host.json");
    await writeFile(
      badHost,
      JSON.stringify({
        hosts: { vercel: true, worker: true, netlify: true, nginx: true, apache: true, github: true },
        content_security_policy: { "default-src": ["'self'"] },
        other_headers: {},
        strict_transport_security: { value: "max-age=1", hosts: [] },
      }),
    );
    assert.throws(() => loadConfig(badHost), /unknown host "github"/);

    const badHsts = path.join(dir, "bad-hsts.json");
    await writeFile(
      badHsts,
      JSON.stringify({
        hosts: { vercel: true, worker: true, netlify: true, nginx: true, apache: true },
        content_security_policy: { "default-src": ["'self'"] },
        other_headers: {},
        strict_transport_security: { value: "max-age=1", hosts: ["nginx", "github"] },
      }),
    );
    assert.throws(() => loadConfig(badHsts), /unknown HSTS host "github"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI --check exits 0 while every enabled host is in sync", () => {
  execFileSync(
    process.execPath,
    ["scripts/generate-security-headers.mjs", "--check"],
    { cwd: ROOT, encoding: "utf8" },
  );
});
