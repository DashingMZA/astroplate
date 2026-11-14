// llms.txt generator tests — absolutiseMarkdownUrls in scripts/llmsGenerator.js.
// The generator's Markdown (llms-full.txt + per-page .md files) is read by
// LLMs with no base URL, so site-root-relative links/images must be
// absolute. Importing the generator module must not start a generation
// run (its entry point is guarded by an is-main check).
import assert from "node:assert/strict";
import { test } from "node:test";

const { absolutiseMarkdownUrls } = await import("../scripts/llmsGenerator.js");

const SITE = "https://astroplate.jadoo.bond";

test("relative image path becomes absolute", () => {
  assert.equal(
    absolutiseMarkdownUrls(
      "![A diagram](/_astro/diagram.Ab12Cd34_Z1a2b3c.webp)",
      SITE,
    ),
    "![A diagram](https://astroplate.jadoo.bond/_astro/diagram.Ab12Cd34_Z1a2b3c.webp)",
  );
});

test("relative internal link becomes absolute", () => {
  assert.equal(
    absolutiseMarkdownUrls("[Read more](/blog/my-post)", SITE),
    "[Read more](https://astroplate.jadoo.bond/blog/my-post)",
  );
});

test("absolute URL is left untouched", () => {
  const md = "[Docs](https://docs.astro.build/en/guides/images/)";
  assert.equal(absolutiseMarkdownUrls(md, SITE), md);
});

test("query string and hash survive absolutising", () => {
  assert.equal(
    absolutiseMarkdownUrls("[Section](/blog/my-post?ref=llms#intro)", SITE),
    "[Section](https://astroplate.jadoo.bond/blog/my-post?ref=llms#intro)",
  );
});

test("link title after the URL is preserved", () => {
  assert.equal(
    absolutiseMarkdownUrls('[Home](/ "Back to home")', SITE),
    '[Home](https://astroplate.jadoo.bond/ "Back to home")',
  );
});

test("fragment-only, mailto and data URLs are left untouched", () => {
  const md =
    "[Jump](#section) [Mail](mailto:hello@example.com) ![Inline](data:image/png;base64,AAA)";
  assert.equal(absolutiseMarkdownUrls(md, SITE), md);
});

test("protocol-relative URL resolves to https on the site host", () => {
  assert.equal(
    absolutiseMarkdownUrls("[CDN](//cdn.example.com/img.png)", SITE),
    "[CDN](https://cdn.example.com/img.png)",
  );
});

test("missing site URL leaves content unchanged", () => {
  const md = "![Alt](/_astro/x.webp)";
  assert.equal(absolutiseMarkdownUrls(md, ""), md);
  assert.equal(absolutiseMarkdownUrls(md), md);
});

test("multiple relative URLs in one document are all rewritten", () => {
  assert.equal(
    absolutiseMarkdownUrls(
      "![One](/images/a.png) and [Two](/blog/b) and ![Three](/_astro/c.webp)",
      SITE,
    ),
    "![One](https://astroplate.jadoo.bond/images/a.png) and [Two](https://astroplate.jadoo.bond/blog/b) and ![Three](https://astroplate.jadoo.bond/_astro/c.webp)",
  );
});
