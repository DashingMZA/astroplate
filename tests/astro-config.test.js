// Smoke test: astro.config.mjs must load and carry the expected
// integrations and site config. Guards against a broken config edit
// (e.g. a bad compress wiring) without running a full build.
import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

// Plain Node rejects the config's bare `./src/config/*.json` imports;
// the hook in ./json-hooks.mjs supplies the JSON import attribute
// (registered before the dynamic import below runs).
register("./json-hooks.mjs", import.meta.url);

test("astro.config.mjs loads with site + all integrations", async () => {
  const { default: config } = await import("../astro.config.mjs");

  assert.equal(typeof config.site, "string");
  assert.ok(
    config.site.startsWith("http"),
    `site is not a URL: ${config.site}`,
  );
  assert.equal(config.trailingSlash, "never");
  assert.ok(Array.isArray(config.integrations), "integrations is not an array");

  const names = config.integrations.map((i) => i.name);
  // react, sitemap, AutoImport, mdx, compress (last).
  assert.equal(
    config.integrations.length,
    5,
    `expected 5 integrations, got: ${names}`,
  );
  assert.ok(
    names.includes("@playform/compress"),
    "compress integration missing",
  );
  assert.equal(
    names[names.length - 1],
    "@playform/compress",
    "compress must be the last integration",
  );

  // Markdown pipeline still has its remark plugins.
  const remarkPlugins = config.markdown.processor?.options?.remarkPlugins ?? [];
  assert.ok(
    remarkPlugins.length >= 2,
    "remark plugins missing from markdown config",
  );
});
