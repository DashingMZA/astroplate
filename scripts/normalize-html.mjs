// Post-build HTML normalizer: Astro's serializer emits minimal HTML —
// attribute values without spaces are left UNQUOTED and attributes come
// out content-first (`<meta content=website property=og:type>`). That is
// valid HTML5 and parses identically, but it is not the conventional
// form, and it reads as a mistake next to any reference implementation.
// This step round-trips every dist HTML file through parse5 (the
// spec-compliant parser) so that:
//   1. every attribute value is double-quoted, and
//   2. head tags use the conventional order — `<meta property="og:type"
//      content="website">`, `<link rel="..." href="...">`.
// It changes NOTHING else: the script re-parses its own output and
// refuses to write a file whose text, element counts, or attribute
// values differ from the input. Run automatically as part of
// `pnpm build` (after `astro build`, before `llmsGenerator.js`).
// Usage: node scripts/normalize-html.mjs [--dist dist]
import fs from "node:fs";
import path from "node:path";
import * as parse5 from "parse5";

const distDir = path.resolve(
  process.cwd(),
  process.argv.includes("--dist")
    ? process.argv[process.argv.indexOf("--dist") + 1]
    : "dist",
);

// Attribute priority per tag: these come first, the rest keep their
// original relative order.
const ATTR_ORDER = {
  meta: ["property", "name", "charset", "http-equiv", "content"],
  link: ["rel", "href", "type", "title", "sizes", "media", "as", "crossorigin"],
};

function reorderAttrs(node) {
  if (!node.tagName) return;
  const priority = ATTR_ORDER[node.tagName];
  if (!priority || !Array.isArray(node.attrs)) return;
  const rank = (name) => {
    const i = priority.indexOf(name);
    return i === -1 ? priority.length : i;
  };
  node.attrs = node.attrs
    .map((attr, i) => ({ attr, i }))
    .sort((a, b) => rank(a.attr.name) - rank(b.attr.name) || a.i - b.i)
    .map(({ attr }) => attr);
}

function walk(node, visit) {
  visit(node);
  const children = node.childNodes ?? [];
  for (const child of children) walk(child, visit);
  // <template> content lives in a separate fragment.
  if (node.content) walk(node.content, visit);
}

// Structural fingerprint of a document, compared through parse5's own
// tree (not raw text): element names + attribute values + text nodes.
// Text inside <pre>/<code> legitimately changes when the Shiki spans
// inside it gain quotes, so raw-text comparison would false-positive —
// here those spans are compared as the elements they are.
function fingerprint(document) {
  const parts = [];
  const visit = (node) => {
    if (node.nodeName === "#text") {
      parts.push(`T:${node.value.replace(/\s+/g, " ")}`);
      return;
    }
    if (node.tagName) {
      const attrs = (node.attrs ?? [])
        .map((a) => `${a.name}=${a.value}`)
        .sort()
        .join(";");
      parts.push(`E:${node.tagName}[${attrs}]`);
    }
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content);
  };
  visit(document);
  return parts.join("|");
}

function* walkHtml(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkHtml(full);
    else if (entry.isFile() && entry.name.endsWith(".html")) yield full;
  }
}

let processed = 0;
let changed = 0;
let bytesAdded = 0;
for (const file of walkHtml(distDir)) {
  const rel = path.relative(distDir, file);
  const original = fs.readFileSync(file, "utf8");
  const originalDoc = parse5.parse(original);
  const before = fingerprint(originalDoc);
  const document = parse5.parse(original);
  walk(document, reorderAttrs);
  const normalized = parse5.serialize(document);
  const after = fingerprint(parse5.parse(normalized));
  if (before !== after) {
    console.error(
      `normalize-html: REFUSING to write ${rel} — round-trip changed the document (text, elements, or attribute values differ).`,
    );
    process.exitCode = 1;
    continue;
  }
  processed++;
  if (normalized !== original) {
    fs.writeFileSync(file, normalized);
    changed++;
    bytesAdded += normalized.length - original.length;
  }
}
console.log(
  `normalize-html: ${processed} HTML files checked, ${changed} rewritten with quoted attributes (+${bytesAdded} bytes).`,
);
if (process.exitCode) process.exit(1);
