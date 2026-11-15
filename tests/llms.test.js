// llms.txt generator tests — absolutiseMarkdownUrls and
// stripLlmsContentNoise in scripts/llmsGenerator.js.
// The generator's Markdown (llms-full.txt + per-page .md files) is read by
// LLMs with no base URL, so site-root-relative links/images must be
// absolute, and pages must be clean prose (no code dumps, no tag/share/
// related-posts furniture). Importing the generator module must not start
// a generation run (its entry point is guarded by an is-main check).
import assert from "node:assert/strict";
import { test } from "node:test";
import { parse } from "node-html-parser";

const { absolutiseMarkdownUrls, stripLlmsContentNoise } =
  await import("../scripts/llmsGenerator.js");

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

// ─── stripLlmsContentNoise ───────────────────────────────────────────────

const POST_FIXTURE = `
<main>
  <article>
    <h1>My Post</h1>
    <p>Some prose with <code>inline code</code> and a <a href="/blog/other">link</a>.</p>
    <pre><code>const x = 1;</code></pre>
    <p>More prose after the example.</p>
  </article>
  <div class="row items-start justify-between">
    <div class="items-center flex lg:col-5"><span class="h5 mr-3">Tags :</span><ul><li><a href="/tags/astro">Astro</a></li></ul></div>
    <div class="items-center flex lg:col-4"><span class="h5 mr-3">Share :</span><ul class="social-icons"><li><a href="https://facebook.com/sharer/sharer.php?u=x"></a></li></ul></div>
  </div>
  <div class="section pb-0"><h2 class="text-center h3 mb-12">Related Posts</h2><div class="row justify-center"><div><a href="/blog/other">Other post</a></div></div></div>
</main>
`;

function strippedFixture() {
  const main = parse(POST_FIXTURE).querySelector("main");
  stripLlmsContentNoise(main);
  return main;
}

test("stripLlmsContentNoise: removes code blocks but keeps inline code and prose", () => {
  const main = strippedFixture();
  assert.equal(main.querySelectorAll("pre").length, 0);
  assert.ok(main.innerHTML.includes("<code>inline code</code>"));
  assert.ok(main.text.includes("Some prose"));
  assert.ok(main.text.includes("More prose after the example."));
});

test("stripLlmsContentNoise: removes the Tags / Share row entirely", () => {
  const main = strippedFixture();
  assert.ok(!main.text.includes("Tags :"));
  assert.ok(!main.text.includes("Share :"));
  assert.ok(!main.innerHTML.includes("/tags/astro"));
  assert.ok(!main.innerHTML.includes("facebook.com/sharer"));
  // The article's own link survives — only the furniture goes.
  assert.ok(main.innerHTML.includes('<a href="/blog/other">link</a>'));
});

test("stripLlmsContentNoise: removes the Related Posts section entirely", () => {
  const main = strippedFixture();
  assert.ok(!main.text.includes("Related Posts"));
  assert.ok(!main.innerHTML.includes("Other post"));
});

test("stripLlmsContentNoise: leaves a page without furniture untouched", () => {
  const main = parse(
    `<main><h1>About</h1><p>Plain prose with <code>code</code>.</p></main>`,
  ).querySelector("main");
  stripLlmsContentNoise(main);
  assert.ok(main.text.includes("Plain prose"));
  assert.ok(main.innerHTML.includes("<code>code</code>"));
});

test("stripLlmsContentNoise: tolerates a missing element", () => {
  assert.doesNotThrow(() => stripLlmsContentNoise(null));
  assert.doesNotThrow(() => stripLlmsContentNoise(undefined));
});

test("processHtml: strips furniture and code before converting to Markdown", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(
    new URL("../scripts/llmsGenerator.js", import.meta.url),
    "utf8",
  );
  assert.ok(
    src.includes("stripLlmsContentNoise(contentElement);"),
    "processHtml must call stripLlmsContentNoise on the content element",
  );
});
