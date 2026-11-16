// Responsive-variant generation tests —
// scripts/generate-responsive-variants.mjs.
import assert from "node:assert/strict";
import { cp, mkdtemp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { register } from "node:module";
import { test } from "node:test";
import sharp from "sharp";

register("./json-hooks.mjs", import.meta.url);
const { findMissingVariants, generateVariants, variantPathFor } = await import(
  "../scripts/generate-responsive-variants.mjs"
);

const REAL = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "public",
  "images",
  "blog",
  "astro-content-collections-complete-guide-managing-blog-content-diagram-1.webp",
);

test("variantPathFor: -800 beside the source", () => {
  assert.equal(
    variantPathFor("/a/b/foo.webp", 800),
    "/a/b/foo-800.webp",
  );
});

test("generateVariants: writes an 800w variant; second run is a no-op", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "astroplate-variants-"));
  try {
    const blogDir = path.join(root, "blog");
    await cp(REAL, path.join(blogDir, "foo.webp"), { recursive: true });
    const written = await generateVariants({
      blogDir,
      logger: { log() {} },
    });
    assert.equal(written.length, 1);
    assert.equal(path.basename(written[0]), "foo-800.webp");
    const meta = await sharp(written[0]).metadata();
    assert.equal(meta.width, 800);
    assert.equal(meta.height, 450);
    assert.equal(meta.format, "webp");
    // Idempotent: nothing to write the second time.
    const again = await generateVariants({
      blogDir,
      logger: { log() {} },
    });
    assert.deepEqual(again, []);
    // --check equivalent: nothing missing.
    assert.deepEqual(await findMissingVariants({ blogDir }), []);
    // A narrow image gets no variant.
    await sharp(REAL)
      .resize(400, null)
      .webp({ quality: 82 })
      .toFile(path.join(blogDir, "small.webp"));
    const third = await generateVariants({
      blogDir,
      logger: { log() {} },
    });
    assert.deepEqual(third, []);
    await stat(path.join(blogDir, "small-800.webp")).then(
      () => assert.fail("small image must not get a variant"),
      (err) => assert.equal(err.code, "ENOENT"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
