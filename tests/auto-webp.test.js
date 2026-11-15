// Tests for the automatic image-to-webp pipeline
// (scripts/convert-images-to-webp.mjs).
//
// The script's exported helpers are exercised against throwaway
// temp directories; sharp generates the fixture images so no
// binary fixtures are committed.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const {
  JPEG_QUALITY,
  adoptUploads,
  convertImages,
  convertImage,
  isUpToDate,
  outputPathFor,
  rewriteImageReferences,
  rewriteOutsideFences,
  walkFiles,
} = await import("../scripts/convert-images-to-webp.mjs");

const silent = { log() {}, warn() {}, error() {} };

function tmpDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "auto-webp-"));
  return {
    root,
    sourceDir: path.join(root, "assets", "images"),
    outputDir: path.join(root, "public", "images"),
    // Reference corpus for the adopt skip rule. Empty by default so
    // adopt tests are hermetic — tests that need a reference write
    // their own fixture files into srcDir.
    srcDir: path.join(root, "src"),
  };
}

/** Write a text file under a temp srcDir (creates parent dirs). */
async function writeSrc(srcDir, name, content) {
  const file = path.join(srcDir, name);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, content);
  return file;
}

async function makeJpg(dir, name, width = 120, height = 80) {
  const file = path.join(dir, name);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 10, g: 20, b: 200 },
    },
  })
    .jpeg({ quality: 90 })
    .toFile(file);
  return file;
}

async function makePng(dir, name, width = 64, height = 48) {
  const file = path.join(dir, name);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 200, g: 30, b: 40, alpha: 1 },
    },
  })
    .png()
    .toFile(file);
  return file;
}

test("jpg converts to webp at quality 82 with dimensions preserved", async () => {
  const { sourceDir, outputDir } = tmpDirs();
  const source = await makeJpg(sourceDir, "photo.jpg", 120, 80);
  const result = await convertImage(source, sourceDir, outputDir);
  assert.deepEqual(result, { width: 120, height: 80 });
  const output = path.join(outputDir, "photo.webp");
  assert.ok(fs.existsSync(output), "photo.webp must exist");
  const meta = await sharp(output).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 120);
  assert.equal(meta.height, 80);
  // Quality 82 output is smaller than the quality-90 source fixture.
  assert.ok(fs.statSync(output).size < fs.statSync(source).size);
  assert.equal(JPEG_QUALITY, 82);
});

test("png converts to lossless webp with identical pixels and dimensions", async () => {
  const { sourceDir, outputDir } = tmpDirs();
  const source = await makePng(sourceDir, "diagram.png", 64, 48);
  const result = await convertImage(source, sourceDir, outputDir);
  assert.deepEqual(result, { width: 64, height: 48 });
  const output = path.join(outputDir, "diagram.webp");
  const meta = await sharp(output).metadata();
  assert.equal(meta.format, "webp");
  // Lossless means every pixel survives the round trip (compared as
  // RGBA on both sides — webp drops a fully-opaque alpha channel).
  const sourcePixels = await sharp(source).ensureAlpha().raw().toBuffer();
  const outputPixels = await sharp(output).ensureAlpha().raw().toBuffer();
  assert.deepEqual(outputPixels, sourcePixels);
});

test("avatars: a profile png in assets/images/avatars/ converts to public/images/avatars/*.webp", async () => {
  const { sourceDir, outputDir, srcDir } = tmpDirs();
  await makePng(path.join(sourceDir, "avatars"), "profile.png", 256, 256);
  const stats = await convertImages({
    sourceDir,
    outputDir,
    srcDir,
    logger: silent,
  });
  assert.equal(stats.converted, 1);
  const output = path.join(outputDir, "avatars", "profile.webp");
  assert.ok(fs.existsSync(output), "avatars/profile.webp must exist");
  const meta = await sharp(output).metadata();
  assert.equal(meta.format, "webp");
  assert.deepEqual([meta.width, meta.height], [256, 256]);
  // The folder structure mirrors: nothing lands at the old flat path.
  assert.ok(!fs.existsSync(path.join(outputDir, "profile.webp")));
});

test("testimonials: an avatar in assets/images/testimonials/ converts to public/images/testimonials/*.webp", async () => {
  const { sourceDir, outputDir, srcDir } = tmpDirs();
  await makePng(
    path.join(sourceDir, "testimonials"),
    "avatar-sm.png",
    120,
    120,
  );
  const stats = await convertImages({
    sourceDir,
    outputDir,
    srcDir,
    logger: silent,
  });
  assert.equal(stats.converted, 1);
  const output = path.join(outputDir, "testimonials", "avatar-sm.webp");
  assert.ok(fs.existsSync(output), "testimonials/avatar-sm.webp must exist");
  const meta = await sharp(output).metadata();
  assert.equal(meta.format, "webp");
  assert.deepEqual([meta.width, meta.height], [120, 120]);
  // The folder structure mirrors: nothing lands at the old flat path.
  assert.ok(!fs.existsSync(path.join(outputDir, "avatar-sm.webp")));
});

test("mirrored path mapping keeps nested folders and renames the extension", () => {
  const sourceDir = path.join(repoRoot, "assets", "images");
  const outputDir = path.join(repoRoot, "public", "images");
  assert.equal(
    outputPathFor(
      path.join(sourceDir, "blog", "my-post-feature.jpg"),
      sourceDir,
      outputDir,
    ),
    path.join(outputDir, "blog", "my-post-feature.webp"),
  );
  assert.equal(
    outputPathFor(
      path.join(sourceDir, "deep", "nested", "shot.PNG"),
      sourceDir,
      outputDir,
    ),
    path.join(outputDir, "deep", "nested", "shot.webp"),
  );
});

test("unchanged sources are skipped; touching the source converts again", async () => {
  const { sourceDir, outputDir, srcDir } = tmpDirs();
  await makeJpg(sourceDir, "photo.jpg");
  const first = await convertImages({
    sourceDir,
    outputDir,
    srcDir,
    logger: silent,
  });
  assert.equal(first.converted, 1);
  assert.equal(first.skipped, 0);
  const output = path.join(outputDir, "photo.webp");
  const firstMtime = fs.statSync(output).mtimeMs;

  const second = await convertImages({
    sourceDir,
    outputDir,
    srcDir,
    logger: silent,
  });
  assert.equal(second.converted, 0);
  assert.equal(second.skipped, 1);
  assert.equal(fs.statSync(output).mtimeMs, firstMtime);

  // Touch the source (newer mtime) — the next run must reconvert.
  const source = path.join(sourceDir, "photo.jpg");
  const later = new Date(Date.now() + 2000);
  fs.utimesSync(source, later, later);
  assert.equal(isUpToDate(source, output), false);
  const third = await convertImages({
    sourceDir,
    outputDir,
    srcDir,
    logger: silent,
  });
  assert.equal(third.converted, 1);
  assert.equal(third.skipped, 0);
});

test("svg and gif sources are skipped, never converted", async () => {
  const { sourceDir, outputDir, srcDir } = tmpDirs();
  await fs.promises.mkdir(sourceDir, { recursive: true });
  await fs.promises.writeFile(
    path.join(sourceDir, "icon.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  );
  await fs.promises.writeFile(path.join(sourceDir, "anim.gif"), "GIF89a");
  await makeJpg(sourceDir, "photo.jpg");
  const stats = await convertImages({
    sourceDir,
    outputDir,
    srcDir,
    logger: silent,
  });
  assert.equal(stats.converted, 1);
  assert.equal(stats.ignored, 2);
  assert.ok(!fs.existsSync(path.join(outputDir, "icon.svg")));
  assert.ok(!fs.existsSync(path.join(outputDir, "icon.webp")));
  assert.ok(!fs.existsSync(path.join(outputDir, "anim.webp")));
  assert.ok(!fs.existsSync(path.join(outputDir, "anim.gif")));
  assert.ok(fs.existsSync(path.join(outputDir, "photo.webp")));
});

test("webp sources pass through unchanged instead of being re-encoded", async () => {
  const { sourceDir, outputDir, srcDir } = tmpDirs();
  const source = await makeJpg(sourceDir, "already.webp", 40, 30);
  // makeJpg wrote a JPEG into a .webp name; re-encode it once so the
  // fixture is a real webp, then let the pipeline copy it through.
  await sharp(source).webp({ lossless: true }).toFile(`${source}.tmp`);
  fs.renameSync(`${source}.tmp`, source);
  const before = fs.readFileSync(source);
  const stats = await convertImages({
    sourceDir,
    outputDir,
    srcDir,
    logger: silent,
  });
  assert.equal(stats.converted, 1);
  assert.deepEqual(
    fs.readFileSync(path.join(outputDir, "already.webp")),
    before,
  );
});

test("stale outputs (webp with no source) are warned about, not deleted", async () => {
  const { sourceDir, outputDir, srcDir } = tmpDirs();
  await makeJpg(sourceDir, "kept.jpg");
  await fs.promises.mkdir(path.join(outputDir, "blog"), { recursive: true });
  const orphan = path.join(outputDir, "blog", "orphan.webp");
  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 1, g: 2, b: 3 },
    },
  })
    .webp()
    .toFile(orphan);
  const stats = await convertImages({
    sourceDir,
    outputDir,
    srcDir,
    logger: silent,
  });
  assert.deepEqual(stats.stale, [orphan]);
  assert.ok(fs.existsSync(orphan), "stale output must NOT be deleted");
});

test("a corrupt source is reported and fails the run (exit 1)", async () => {
  const { root, sourceDir, outputDir, srcDir } = tmpDirs();
  await fs.promises.mkdir(sourceDir, { recursive: true });
  await fs.promises.writeFile(
    path.join(sourceDir, "broken.jpg"),
    "not an image",
  );
  await makeJpg(sourceDir, "good.jpg");
  const stats = await convertImages({
    sourceDir,
    outputDir,
    srcDir,
    logger: silent,
  });
  assert.equal(stats.errors.length, 1);
  assert.equal(stats.errors[0].file, "broken.jpg");
  // The good file still converts — one bad file does not abort the run.
  assert.equal(stats.converted, 1);

  // CLI level: the same corrupt source makes the process exit non-zero.
  const script = path.join(repoRoot, "scripts", "convert-images-to-webp.mjs");
  await assert.rejects(
    execFileAsync(process.execPath, [script], {
      cwd: root,
      env: {
        ...process.env,
        WEBP_SOURCE_DIR: sourceDir,
        WEBP_OUTPUT_DIR: outputDir,
        WEBP_SRC_DIR: srcDir,
      },
    }),
    (error) => error.code === 1,
  );
});

test("seeded pipeline: every blog original has a matching webp output", async () => {
  const sourceDir = path.join(repoRoot, "assets", "images", "blog");
  const outputDir = path.join(repoRoot, "public", "images", "blog");
  const sources = fs
    .readdirSync(sourceDir)
    .filter((f) =>
      [".jpg", ".jpeg", ".png"].includes(path.extname(f).toLowerCase()),
    );
  assert.equal(
    sources.length,
    40,
    `expected 40 seeded originals, found ${sources.length}`,
  );
  for (const source of sources) {
    const webp = path.join(outputDir, `${path.parse(source).name}.webp`);
    assert.ok(fs.existsSync(webp), `missing webp output for ${source}`);
    const meta = await sharp(webp).metadata();
    assert.equal(meta.format, "webp");
    const sourceMeta = await sharp(path.join(sourceDir, source)).metadata();
    assert.equal(meta.width, sourceMeta.width, `${source}: width changed`);
    assert.equal(meta.height, sourceMeta.height, `${source}: height changed`);
  }
});

test("public/images/blog/ holds no originals any more — only generated webp", () => {
  const blogDir = path.join(repoRoot, "public", "images", "blog");
  const originals = fs
    .readdirSync(blogDir)
    .filter((f) =>
      [".jpg", ".jpeg", ".png"].includes(path.extname(f).toLowerCase()),
    );
  assert.deepEqual(
    originals,
    [],
    `public blog originals must be deleted, found ${originals}`,
  );
  const webps = fs
    .readdirSync(blogDir)
    .filter((f) => path.extname(f).toLowerCase() === ".webp");
  assert.equal(
    webps.length,
    40,
    `expected 40 blog webp outputs, found ${webps.length}`,
  );
});

test("adopt: public jpg with no assets source is moved to assets and converted", async () => {
  const { sourceDir, outputDir, srcDir } = tmpDirs();
  // A jpg dropped straight into public/ — no source in assets/.
  const dropped = await makeJpg(outputDir, "blog/uploaded.jpg", 120, 80);
  const stats = await convertImages({
    sourceDir,
    outputDir,
    srcDir,
    logger: silent,
  });
  assert.deepEqual(stats.adopted, ["blog/uploaded.jpg"]);

  assert.deepEqual(stats.duplicatesRemoved, []);

  assert.ok(!fs.existsSync(dropped), "public original must be moved away");
  assert.ok(
    fs.existsSync(path.join(sourceDir, "blog", "uploaded.jpg")),
    "original must now live in assets/",
  );
  const webp = path.join(outputDir, "blog", "uploaded.webp");
  assert.ok(fs.existsSync(webp), "webp must be generated back into public/");
  const meta = await sharp(webp).metadata();
  assert.equal(meta.format, "webp");
  assert.deepEqual([meta.width, meta.height], [120, 80]);
  assert.equal(stats.converted, 1);
});

test("adopt: public png with no assets source is adopted (lossless)", async () => {
  const { sourceDir, outputDir, srcDir } = tmpDirs();
  await makePng(outputDir, "diagram.png", 64, 48);
  const stats = await convertImages({
    sourceDir,
    outputDir,
    srcDir,
    logger: silent,
  });
  assert.deepEqual(stats.adopted, ["diagram.png"]);

  assert.ok(fs.existsSync(path.join(sourceDir, "diagram.png")));
  assert.ok(!fs.existsSync(path.join(outputDir, "diagram.png")));
  const webp = path.join(outputDir, "diagram.webp");
  const meta = await sharp(webp).metadata();
  assert.equal(meta.format, "webp");
  assert.deepEqual([meta.width, meta.height], [64, 48]);
  // Lossless: pixels survive the round trip.
  const sourcePixels = await sharp(path.join(sourceDir, "diagram.png"))
    .ensureAlpha()
    .raw()
    .toBuffer();
  const outputPixels = await sharp(webp).ensureAlpha().raw().toBuffer();
  assert.deepEqual(outputPixels, sourcePixels);
});

test("adopt: public jpg duplicating an assets source is deleted, webp comes from the source", async () => {
  const { sourceDir, outputDir, srcDir } = tmpDirs();
  const source = await makeJpg(sourceDir, "photo.jpg", 120, 80);
  const sourceBytes = fs.readFileSync(source);
  // A duplicate original sitting in public/ — deliberately different
  // pixels (60x40) so the webp proves which file it came from.
  const duplicate = await makeJpg(outputDir, "photo.jpg", 60, 40);
  const stats = await convertImages({
    sourceDir,
    outputDir,
    srcDir,
    logger: silent,
  });
  assert.deepEqual(stats.adopted, []);
  assert.deepEqual(stats.duplicatesRemoved, ["photo.jpg"]);

  assert.ok(
    !fs.existsSync(duplicate),
    "duplicate public original must be deleted",
  );
  // The assets source is untouched and the webp comes from it.
  assert.deepEqual(fs.readFileSync(source), sourceBytes);
  const webp = path.join(outputDir, "photo.webp");
  assert.ok(fs.existsSync(webp));
  const meta = await sharp(webp).metadata();
  assert.deepEqual([meta.width, meta.height], [120, 80]);
  assert.equal(stats.converted, 1);
});

test("adopt: webp, svg and gif in public/ are never moved or deleted", async () => {
  const { sourceDir, outputDir, srcDir } = tmpDirs();
  await fs.promises.mkdir(path.join(outputDir, "blog"), { recursive: true });
  const webpFile = path.join(outputDir, "blog", "hero.webp");
  await sharp({
    create: {
      width: 40,
      height: 30,
      channels: 3,
      background: { r: 1, g: 2, b: 3 },
    },
  })
    .webp()
    .toFile(webpFile);
  await fs.promises.writeFile(
    path.join(outputDir, "blog", "icon.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  );
  await fs.promises.writeFile(
    path.join(outputDir, "blog", "anim.gif"),
    "GIF89a",
  );
  await makeJpg(sourceDir, "photo.jpg");
  const stats = await convertImages({
    sourceDir,
    outputDir,
    srcDir,
    logger: silent,
  });
  assert.deepEqual(stats.adopted, []);
  assert.deepEqual(stats.duplicatesRemoved, []);

  assert.ok(fs.existsSync(webpFile), "public webp must stay put");
  assert.ok(fs.existsSync(path.join(outputDir, "blog", "icon.svg")));
  assert.ok(fs.existsSync(path.join(outputDir, "blog", "anim.gif")));
  assert.ok(
    !fs.existsSync(path.join(sourceDir, "blog", "hero.webp")),
    "webp must not be adopted into assets",
  );
  assert.ok(!fs.existsSync(path.join(sourceDir, "blog", "icon.svg")));
  assert.ok(!fs.existsSync(path.join(sourceDir, "blog", "anim.gif")));
  // Only the assets photo.jpg converts; the orphan webp is warned
  // about (stale) but never deleted.
  assert.equal(stats.converted, 1);
  assert.deepEqual(stats.stale, [webpFile]);
});

test("adoptUploads works standalone: second run finds nothing to adopt", async () => {
  const { sourceDir, outputDir } = tmpDirs();
  await makeJpg(outputDir, "shot.jpg");
  const first = await adoptUploads({ sourceDir, outputDir, logger: silent });
  assert.deepEqual(first, { adopted: ["shot.jpg"], removed: [] });
  const second = await adoptUploads({ sourceDir, outputDir, logger: silent });
  assert.deepEqual(second, { adopted: [], removed: [] });
  assert.ok(fs.existsSync(path.join(sourceDir, "shot.jpg")));
  assert.ok(!fs.existsSync(path.join(outputDir, "shot.jpg")));
});

test("repo state: every webp served from public/images/ has an original in assets/images/", async () => {
  const sourceDir = path.join(repoRoot, "assets", "images");
  const outputDir = path.join(repoRoot, "public", "images");
  for (const outputPath of await walkFiles(outputDir)) {
    if (path.extname(outputPath).toLowerCase() !== ".webp") continue;
    const relative = path.relative(outputDir, outputPath);
    const base = relative.slice(0, -".webp".length);
    const hasSource = [".jpg", ".jpeg", ".png", ".webp", ".avif"].some((ext) =>
      fs.existsSync(path.join(sourceDir, `${base}${ext}`)),
    );
    assert.ok(hasSource, `no assets/ original for served ${relative}`);
  }
});

test("adopt: a referenced jpg is adopted AND its reference is rewritten to webp", async () => {
  const { sourceDir, outputDir, srcDir } = tmpDirs();
  // A page that loads the image by exact path, like the About page.
  await writeSrc(
    srcDir,
    "content/about/-index.md",
    "---\ntitle: About\n---\n\n![banner](/images/hero.jpg)\n",
  );
  await writeSrc(
    srcDir,
    "config/config.json",
    JSON.stringify({ logo: "/images/hero.jpg" }),
  );
  await makeJpg(outputDir, "hero.jpg", 120, 80);
  const stats = await convertImages({
    sourceDir,
    outputDir,
    srcDir,
    logger: silent,
  });
  assert.deepEqual(stats.adopted, ["hero.jpg"]);
  assert.ok(fs.existsSync(path.join(sourceDir, "hero.jpg")));
  assert.ok(fs.existsSync(path.join(outputDir, "hero.webp")));
  assert.ok(!fs.existsSync(path.join(outputDir, "hero.jpg")));
  // Both references now point at the webp.
  assert.equal(
    fs.readFileSync(path.join(srcDir, "content/about/-index.md"), "utf8"),
    "---\ntitle: About\n---\n\n![banner](/images/hero.webp)\n",
  );
  assert.equal(
    fs.readFileSync(path.join(srcDir, "config/config.json"), "utf8"),
    JSON.stringify({ logo: "/images/hero.webp" }),
  );
  assert.equal(stats.rewrittenFiles.length, 2);
});

test("rewriteImageReferences leaves fenced code blocks untouched", async () => {
  const { srcDir } = tmpDirs();
  const md = [
    'image: "/images/hero.jpg"',
    "",
    "```astro",
    'image: "/images/hero.jpg"',
    "```",
    "",
    "![hero](/images/hero.jpg)",
    "",
    "```",
    "og: /images/hero.jpg",
    "```",
    "",
    "See https://example.com/images/hero.jpg for the remote copy.",
    "",
  ].join("\n");
  await writeSrc(srcDir, "content/blog/post.md", md);
  await writeSrc(
    srcDir,
    "config.json",
    JSON.stringify({ logo: "/images/hero.jpg" }),
  );
  const changed = await rewriteImageReferences({
    srcDir,
    replacements: [["/images/hero.jpg", "/images/hero.webp"]],
    logger: silent,
  });
  assert.equal(changed.length, 2);
  const out = fs.readFileSync(
    path.join(srcDir, "content/blog/post.md"),
    "utf8",
  );
  // Outside fences: rewritten.
  assert.ok(out.includes('image: "/images/hero.webp"'));
  assert.ok(out.includes("![hero](/images/hero.webp)"));
  // Inside fences: untouched.
  assert.ok(out.includes('```astro\nimage: "/images/hero.jpg"\n```'));
  assert.ok(out.includes("```\nog: /images/hero.jpg\n```"));
  // External URL: untouched.
  assert.ok(out.includes("https://example.com/images/hero.jpg"));
  assert.ok(!out.includes("https://example.com/images/hero.webp"));
  // Non-md file: rewritten wholesale.
  assert.equal(
    fs.readFileSync(path.join(srcDir, "config.json"), "utf8"),
    JSON.stringify({ logo: "/images/hero.webp" }),
  );
});

test("rewriteOutsideFences: no replacements means no change", () => {
  const content = 'image: "/images/hero.jpg"\n';
  const { content: out, applied } = rewriteOutsideFences(content, [
    ["/images/other.jpg", "/images/other.webp"],
  ]);
  assert.equal(out, content);
  assert.deepEqual(applied, []);
});

test("scope: a jpg at the public/ root is never adopted, converted or deleted", async () => {
  const { root, sourceDir, outputDir, srcDir } = tmpDirs();
  // A file at public/ root — outside the pipeline's scope, which is
  // exactly assets/images/ <-> public/images/.
  const rootPhoto = await makeJpg(
    path.join(root, "public"),
    "root-photo.jpg",
    120,
    80,
  );
  // A file under public/images/ alongside it, to prove the scan ran.
  await makeJpg(outputDir, "photo.jpg", 120, 80);
  const stats = await convertImages({
    sourceDir,
    outputDir,
    srcDir,
    logger: silent,
  });
  assert.deepEqual(stats.adopted, ["photo.jpg"]);
  // The root file is untouched: still there, no webp, no assets copy.
  assert.ok(fs.existsSync(rootPhoto), "public/ root file must stay put");
  assert.ok(!fs.existsSync(path.join(root, "public", "root-photo.webp")));
  assert.ok(!fs.existsSync(path.join(sourceDir, "root-photo.jpg")));
  // The images/ file was adopted and converted normally.
  assert.ok(fs.existsSync(path.join(sourceDir, "photo.jpg")));
  assert.ok(fs.existsSync(path.join(outputDir, "photo.webp")));
});

test("repo state: icon files live at the public/ root, config points at them", () => {
  const cfg = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "src/config/config.json"), "utf8"),
  );
  assert.equal(cfg.site.favicon, "/favicon.png");
  assert.equal(cfg.feeds.icon, "/feed-icon.png");
  assert.equal(cfg.feeds.atom_logo, "/atom-logo.png");
  // The site logo also lives at the public/ root, in its original PNG
  // format — it is never converted to webp.
  assert.equal(cfg.site.logo, "/logo.png");
  assert.equal(cfg.site.logo_darkmode, "/logo-darkmode.png");
  assert.equal(cfg.publisher.logo, "/logo.png");
  for (const name of [
    "favicon.png",
    "feed-icon.png",
    "atom-logo.png",
    "logo.png",
    "logo-darkmode.png",
  ]) {
    assert.ok(
      fs.existsSync(path.join(repoRoot, "public", name)),
      `${name} must live at the public/ root`,
    );
    assert.ok(
      !fs.existsSync(path.join(repoRoot, "public/images", name)),
      `${name} must not live under public/images/`,
    );
    assert.ok(
      !fs.existsSync(path.join(repoRoot, "assets/images", name)),
      `${name} must not live under assets/images/`,
    );
  }
});

test("repo state: author images live in /images/avatars/, testimonial images in /images/testimonials/", () => {
  const authors = [
    ["muhammad-zaheer-ahmad.md", "/images/avatars/profile.webp"],
    ["muhammad-zaheer.md", "/images/avatars/profile.webp"],
    ["zaheer-ahmad.md", "/images/avatars/avatar.webp"],
  ];
  for (const [file, image] of authors) {
    const body = fs.readFileSync(
      path.join(repoRoot, "src/content/authors", file),
      "utf8",
    );
    assert.ok(
      body.includes(`image: "${image}"`),
      `${file} must point at ${image}`,
    );
  }
  const testimonial = fs.readFileSync(
    path.join(repoRoot, "src/content/sections/testimonial.md"),
    "utf8",
  );
  assert.equal(
    testimonial.split("/images/testimonials/avatar-sm.webp").length - 1,
    4,
    "all 4 testimonials must use /images/testimonials/avatar-sm.webp",
  );
  for (const name of ["profile.png", "avatar.png"]) {
    assert.ok(
      fs.existsSync(path.join(repoRoot, "assets/images/avatars", name)),
      `avatars original ${name} must exist`,
    );
    assert.ok(
      !fs.existsSync(path.join(repoRoot, "assets/images", name)),
      `avatars original ${name} must not live at the flat path`,
    );
  }
  for (const name of ["profile.webp", "avatar.webp"]) {
    assert.ok(
      fs.existsSync(path.join(repoRoot, "public/images/avatars", name)),
      `avatars webp ${name} must exist`,
    );
    assert.ok(
      !fs.existsSync(path.join(repoRoot, "public/images", name)),
      `avatars webp ${name} must not live at the flat path`,
    );
  }
  // Testimonial avatars are NOT profile images: they live in
  // testimonials/, never in avatars/.
  assert.ok(
    fs.existsSync(
      path.join(repoRoot, "assets/images/testimonials/avatar-sm.png"),
    ),
    "testimonials original avatar-sm.png must exist",
  );
  assert.ok(
    fs.existsSync(
      path.join(repoRoot, "public/images/testimonials/avatar-sm.webp"),
    ),
    "testimonials webp avatar-sm.webp must exist",
  );
  assert.ok(
    !fs.existsSync(path.join(repoRoot, "assets/images/avatars/avatar-sm.png")),
    "avatar-sm.png must not live in avatars/",
  );
  assert.ok(
    !fs.existsSync(path.join(repoRoot, "public/images/avatars/avatar-sm.webp")),
    "avatar-sm.webp must not live in avatars/",
  );
});

test("logo renders as a plain <img> from the public/ root path", () => {
  const logo = fs.readFileSync(
    path.join(repoRoot, "src/layouts/components/Logo.astro"),
    "utf8",
  );
  assert.ok(
    !logo.includes("ImageMod"),
    "Logo.astro must not use ImageMod — the logo is served from its configured path, never hashed",
  );
  assert.ok(logo.includes("<img"), "Logo.astro must render a plain <img>");
  const config = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "src/config/config.json"), "utf8"),
  );
  assert.equal(config.site.logo, "/logo.png");
  assert.equal(config.site.logo_darkmode, "/logo-darkmode.png");
  assert.ok(
    fs.existsSync(path.join(repoRoot, "public/logo.png")),
    "public/logo.png must exist at the public/ root",
  );
  assert.ok(
    fs.existsSync(path.join(repoRoot, "public/logo-darkmode.png")),
    "public/logo-darkmode.png must exist at the public/ root",
  );
});
