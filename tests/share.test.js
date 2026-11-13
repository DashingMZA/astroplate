// Share links: every query value must be percent-encoded, and href
// separators must be a raw `&` in source — Astro escapes attribute values
// once, so a literal `&amp;` in the template double-escapes to `&amp;amp;`
// in dist and the receiving site loses every parameter after it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const share = readFileSync(
  path.join(root, "src/layouts/components/Share.astro"),
  "utf8",
);

test("share hrefs use encoded values, never raw title/description/url", () => {
  for (const href of share.match(/href=\{`[^`]*`\}/g) ?? []) {
    assert.ok(!href.includes("${shareUrl}"), `raw shareUrl in ${href}`);
    assert.ok(!href.includes("${title}"), `raw title in ${href}`);
    assert.ok(!href.includes("${description}"), `raw description in ${href}`);
    assert.ok(!href.includes("${shareImage}"), `raw shareImage in ${href}`);
    assert.ok(!href.includes("${base_url}"), `raw base_url in ${href}`);
  }
  assert.ok(share.includes("encodeURIComponent(shareUrl)"));
  assert.ok(share.includes("encodeURIComponent(title"));
  assert.ok(share.includes("encodeURIComponent(description"));
});

test("share hrefs contain no literal &amp; (Astro escapes it twice)", () => {
  for (const href of share.match(/href=\{`[^`]*`\}/g) ?? []) {
    assert.ok(!href.includes("&amp;"), `double-escaped separator in ${href}`);
  }
});
