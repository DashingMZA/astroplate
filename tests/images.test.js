// Wave C tests — image URL handling.
// Every assertion reuses the REAL helpers in src/lib/utils/seo.ts
// (no re-implemented logic): absolute URLs (R2/CDN) must be preserved
// verbatim, relative paths resolve against base_url, and the OG image
// priority is ogImage > image > site default.
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
  assert.equal(resolveOgImage({ ogImage: R2_IMAGE }).url, R2_IMAGE);
  // Protocol-relative and data: URLs are absolute too.
  assert.equal(isAbsoluteUrl("//media.csofts.tech/x.jpg"), true);
  assert.equal(
    absoluteUrl("//media.csofts.tech/x.jpg"),
    "//media.csofts.tech/x.jpg",
  );
  assert.equal(isAbsoluteUrl("data:image/png;base64,abc"), false);
});

test("relative paths resolve against the site base URL", () => {
  assert.equal(absoluteUrl("/images/logo.png"), `${SITE}/images/logo.png`);
  assert.equal(absoluteUrl("images/logo.png"), `${SITE}/images/logo.png`);
});

test("OG image priority is ogImage > image > site default", () => {
  const local = "/images/post-hero.jpg";
  assert.deepEqual(
    resolveOgImage({ ogImage: "/images/og.jpg", image: local }),
    {
      url: `${SITE}/images/og.jpg`,
      isPageImage: true,
    },
  );
  assert.deepEqual(resolveOgImage({ image: local }), {
    url: `${SITE}/images/post-hero.jpg`,
    isPageImage: true,
  });
  const fallback = resolveOgImage({});
  assert.equal(fallback.url, `${SITE}/images/og-image.webp`);
  assert.equal(fallback.isPageImage, false);
});

test("missing image input falls back to the site default OG image", () => {
  assert.equal(resolveImage(undefined), `${SITE}/images/og-image.webp`);
  assert.equal(resolveImage(null), `${SITE}/images/og-image.webp`);
  assert.equal(resolveImage(""), `${SITE}/images/og-image.webp`);
});

test("the shipped default OG image is webp (original kept in assets/)", async () => {
  const sharp = (await import("sharp")).default;
  const webp = path.join(repoRoot, "public/images/og-image.webp");
  assert.ok(fs.existsSync(webp), "public/images/og-image.webp must exist");
  assert.ok(
    !fs.existsSync(path.join(repoRoot, "public/images/og-image.jpg")),
    "the public og-image.jpg original must be gone (adopted into assets/)",
  );
  assert.ok(
    fs.existsSync(path.join(repoRoot, "assets/images/og-image.jpg")),
    "the og-image.jpg original must live in assets/images/",
  );
  const meta = await sharp(webp).metadata();
  assert.equal(meta.format, "webp");
  assert.ok(
    fs.statSync(webp).size < 100_000,
    `og-image.webp is ${fs.statSync(webp).size} B, expected < 100 KB`,
  );
  // The missing-image placeholder exists too (ImageMod fallback).
  assert.ok(
    fs.existsSync(path.join(repoRoot, "public/images/image-placeholder.webp")),
  );
  assert.ok(
    !fs.existsSync(path.join(repoRoot, "public/images/image-placeholder.png")),
    "the public image-placeholder.png original must be gone (adopted)",
  );
});

// ─── One stable webp URL per blog image ──────────────────────────────────
// The 10 articles' feature / OG / diagram images are webp sources in
// public/images/blog/ (same dimensions as the originals). They must be
// referenced as .webp everywhere, so the blog page, the listing card, the
// feeds and the llms files all emit the same /images/blog/….webp URL —
// never a hashed /_astro/… variant and never a second format of the same
// picture. ImageMod renders already-optimized (webp/avif) sources as a
// plain <img> for exactly this reason (see the marker test below).

const BLOG_DIR = path.join(repoRoot, "src/content/blog");

function articleFiles() {
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md") && f !== "-index.md")
    .map((f) => path.join(BLOG_DIR, f));
}

function frontmatterField(content, field) {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(fm, "article must have frontmatter");
  const m = fm[1].match(new RegExp(`^${field}:\\s*"([^"]+)"`, "m"));
  assert.ok(m, `frontmatter must set ${field}`);
  return m[1];
}

test("every article's feature + OG image is a .webp file that exists", () => {
  const articles = articleFiles();
  assert.equal(articles.length, 10, "expected the 10 SEO articles");
  for (const file of articles) {
    const content = fs.readFileSync(file, "utf8");
    for (const field of ["image", "ogImage"]) {
      const value = frontmatterField(content, field);
      assert.ok(
        value.endsWith(".webp"),
        `${path.basename(file)} ${field} must be .webp, got ${value}`,
      );
      assert.ok(
        fs.existsSync(path.join(repoRoot, "public", value)),
        `${value} must exist under public/`,
      );
    }
  }
});

test("no article body image points at a .jpg/.png blog image", () => {
  for (const file of articleFiles()) {
    const content = fs.readFileSync(file, "utf8");
    // Code samples may show image syntax as an example; only the real
    // rendered image refs (outside fenced blocks) count.
    const prose = content.replace(/```[\s\S]*?```/g, "");
    // Body images are <img> tags now (inject-image-dimensions.mjs
    // rewrites Markdown images to <img> with width/height + srcset);
    // older content may still use Markdown image syntax. Both count.
    const refs = [
      ...[...prose.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]),
      ...[...prose.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]),
    ];
    const blogRefs = refs.filter((r) => r.startsWith("/images/blog/"));
    assert.ok(blogRefs.length > 0, `${path.basename(file)} has diagram refs`);
    for (const ref of blogRefs) {
      assert.ok(
        ref.endsWith(".webp"),
        `${path.basename(file)} diagram must be .webp, got ${ref}`,
      );
    }
  }
});

test("ImageMod: already-optimized (webp/avif) sources bypass Astro <Image>", () => {
  const src = fs.readFileSync(
    path.join(repoRoot, "src/layouts/components/ImageMod.astro"),
    "utf8",
  );
  assert.ok(
    src.includes("isAlreadyOptimized"),
    "ImageMod must detect already-optimized sources",
  );
  assert.ok(
    src.includes("isRemote || isAlreadyOptimized"),
    "ImageMod must render webp/avif sources as a plain <img>, not <Image>",
  );
});
