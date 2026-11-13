// Wave C tests — image URL handling.
// Every assertion reuses the REAL helpers in src/lib/utils/seo.ts
// (no re-implemented logic): absolute URLs (R2/CDN) must be preserved
// verbatim, relative paths resolve against base_url, and the OG image
// priority is og_image > image > site default.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { register } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// seo.ts imports `@/` aliases and JSON — the loader hooks resolve
// those for plain Node, as in seo.test.js.
register("./json-hooks.mjs", import.meta.url);
const { absoluteUrl, isAbsoluteUrl, resolveImage, resolveOgImage } =
  await import("../src/lib/utils/seo.ts");

const R2_IMAGE = "https://media.csofts.tech/images/r2-example.jpg";
const SITE = "https://astroplate.jadoo.bond";

test("absolute R2/CDN URLs are preserved verbatim", () => {
  assert.equal(absoluteUrl(R2_IMAGE), R2_IMAGE);
  assert.equal(resolveImage(R2_IMAGE), R2_IMAGE);
  assert.equal(resolveOgImage({ image: R2_IMAGE }).url, R2_IMAGE);
  assert.equal(resolveOgImage({ og_image: R2_IMAGE }).url, R2_IMAGE);
  // Protocol-relative and data: URLs are absolute too.
  assert.equal(isAbsoluteUrl("//media.csofts.tech/x.jpg"), true);
  assert.equal(absoluteUrl("//media.csofts.tech/x.jpg"), "//media.csofts.tech/x.jpg");
  assert.equal(isAbsoluteUrl("data:image/png;base64,abc"), false);
});

test("relative paths resolve against the site base URL", () => {
  assert.equal(absoluteUrl("/images/logo.png"), `${SITE}/images/logo.png`);
  assert.equal(absoluteUrl("images/logo.png"), `${SITE}/images/logo.png`);
});

test("OG image priority is og_image > image > site default", () => {
  const local = "/images/post-hero.jpg";
  assert.deepEqual(resolveOgImage({ og_image: "/images/og.jpg", image: local }), {
    url: `${SITE}/images/og.jpg`,
    isPageImage: true,
  });
  assert.deepEqual(resolveOgImage({ image: local }), {
    url: `${SITE}/images/post-hero.jpg`,
    isPageImage: true,
  });
  const fallback = resolveOgImage({});
  assert.equal(fallback.url, `${SITE}/images/og-image.jpg`);
  assert.equal(fallback.isPageImage, false);
});

test("missing image input falls back to the site default OG image", () => {
  assert.equal(resolveImage(undefined), `${SITE}/images/og-image.jpg`);
  assert.equal(resolveImage(null), `${SITE}/images/og-image.jpg`);
  assert.equal(resolveImage(""), `${SITE}/images/og-image.jpg`);
});

test("the shipped default OG image is the small JPEG, not the old PNG", () => {
  const jpg = path.join(repoRoot, "public/images/og-image.jpg");
  const png = path.join(repoRoot, "public/images/og-image.png");
  assert.ok(fs.existsSync(jpg), "public/images/og-image.jpg must exist");
  assert.ok(!fs.existsSync(png), "the old 460 KB og-image.png must be gone");
  const bytes = fs.statSync(jpg).size;
  assert.ok(bytes < 100_000, `og-image.jpg is ${bytes} B, expected < 100 KB`);
  // The missing-image placeholder exists too (ImageMod fallback).
  assert.ok(
    fs.existsSync(path.join(repoRoot, "public/images/image-placeholder.png")),
  );
});
