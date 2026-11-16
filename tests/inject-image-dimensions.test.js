// Image-dimension injection tests — scripts/inject-image-dimensions.mjs.
// Markdown images in src/content are rewritten to <img> with explicit
// width/height (+ srcset when a -800 variant exists), outside fenced
// code blocks and inline code only.
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { register } from "node:module";
import { test } from "node:test";

register("./json-hooks.mjs", import.meta.url);
const {
  imgTagFor,
  injectInLine,
  injectImageDimensions,
  variantUrlFor,
} = await import("../scripts/inject-image-dimensions.mjs");

const DIMS = { width: 1200, height: 675 };
const probe = (src) =>
  src === "/images/blog/foo.webp" ? DIMS : null;
const hasVariant = (variantSrc) =>
  variantSrc === "/images/blog/foo-800.webp";

test("imgTagFor: width/height + srcset when a variant exists", () => {
  const tag = imgTagFor({
    src: "/images/blog/foo.webp",
    alt: "A diagram",
    dims: DIMS,
    variantSrc: "/images/blog/foo-800.webp",
  });
  assert.match(tag, /width="1200" height="675"/);
  assert.match(
    tag,
    /srcset="\/images\/blog\/foo-800\.webp 800w, \/images\/blog\/foo\.webp 1200w"/,
  );
  assert.match(tag, /sizes="\(max-width: 768px\) 100vw, 768px"/);
  assert.match(tag, /loading="lazy" decoding="async"/);
});

test("imgTagFor: no srcset without a variant; alt is escaped", () => {
  const tag = imgTagFor({
    src: "/images/blog/foo.webp",
    alt: 'A "quoted" <diagram>',
    dims: DIMS,
    variantSrc: null,
  });
  assert.doesNotMatch(tag, /srcset/);
  assert.match(tag, /alt="A &quot;quoted&quot; &lt;diagram&gt;"/);
});

test("variantUrlFor: -800 beside the source", () => {
  assert.equal(
    variantUrlFor("/images/blog/foo.webp", 800),
    "/images/blog/foo-800.webp",
  );
});

test("injectInLine: Markdown image becomes <img>; remote + inline code skipped", () => {
  const { line, changed } = injectInLine(
    "![A diagram](/images/blog/foo.webp)",
    { probe, hasVariant },
  );
  assert.equal(changed, true);
  assert.match(line, /^<img src="\/images\/blog\/foo\.webp"/);
  assert.match(line, /width="1200" height="675"/);
  assert.match(line, /srcset="\/images\/blog\/foo-800\.webp 800w/);

  const remote = injectInLine("![x](https://example.com/a.webp)", {
    probe,
    hasVariant,
  });
  assert.equal(remote.changed, false);
  assert.equal(remote.line, "![x](https://example.com/a.webp)");

  const code = injectInLine(
    "Use `![A diagram](/images/blog/foo.webp)` in prose.",
    { probe, hasVariant },
  );
  assert.equal(code.changed, false);

  const already = injectInLine(
    '<img src="/images/blog/foo.webp" width="1200" height="675" />',
    { probe, hasVariant },
  );
  assert.equal(already.changed, false);
});

test("injectImageDimensions: temp content tree, idempotent on second run", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "astroplate-inject-"));
  try {
    const publicDir = path.join(root, "public");
    const srcDir = path.join(root, "src", "content", "blog");
    await mkdir(path.join(publicDir, "images", "blog"), {
      recursive: true,
    });
    await mkdir(srcDir, { recursive: true });
    const real = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      "..",
      "public",
      "images",
      "blog",
      "astro-content-collections-complete-guide-managing-blog-content-diagram-1.webp",
    );
    await cp(real, path.join(publicDir, "images", "blog", "foo.webp"), {
      recursive: true,
    });
    await cp(
      path.join(publicDir, "images", "blog", "foo.webp"),
      path.join(publicDir, "images", "blog", "foo-800.webp"),
    );
    const md = path.join(srcDir, "post.md");
    await writeFile(
      md,
      [
        "---",
        "title: Test",
        "---",
        "",
        "![A diagram](/images/blog/foo.webp)",
        "",
        "```html",
        '<img src="..." alt="" />',
        "```",
        "",
        "Missing: ![gone](/images/blog/missing.webp)",
        "",
      ].join("\n"),
      "utf8",
    );
    const changed = await injectImageDimensions({
      srcDir: path.join(root, "src", "content"),
      publicDir,
      logger: { log() {} },
    });
    assert.deepEqual(changed, [md]);
    const out = await readFile(md, "utf8");
    assert.match(
      out,
      /<img src="\/images\/blog\/foo\.webp" alt="A diagram" width="1200" height="675" loading="lazy" decoding="async" srcset="\/images\/blog\/foo-800\.webp 800w, \/images\/blog\/foo\.webp 1200w" sizes="\(max-width: 768px\) 100vw, 768px" \/>/,
    );
    // Fenced code and the missing image are untouched.
    assert.match(out, /<img src="\.\.\." alt="" \/>/);
    assert.match(out, /!\[gone\]\(.images\/blog\/missing\.webp\)/);
    // Second run: nothing left to do.
    const again = await injectImageDimensions({
      srcDir: path.join(root, "src", "content"),
      publicDir,
      logger: { log() {} },
    });
    assert.deepEqual(again, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
