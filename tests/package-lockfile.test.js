// Smoke test: package.json and pnpm-lock.yaml must agree on the key
// pinned versions, and packages removed as unused must not be direct
// dependencies anymore. Later waves add content tests; this file only
// guards the dependency set Wave A established.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const lockfile = readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8");
// pnpm-lock.yaml has two YAML documents separated by `---`; the real
// lockfile is the second one. Importer entries look like:
//       astro:
//         specifier: 7.4.11
//         version: 7.4.11(...)
const lockDoc = lockfile.split("\n---\n").at(-1);
const importers = lockDoc.split("\npackages:")[0];

// Pinned by instruction — never drift.
const PINNED = {
  astro: "7.4.11",
  typescript: "^6.0.3",
  "@types/node": "24.19.2",
  "@playform/compress": "^0.2.5",
  vite: "^8.3.8",
};

// Specifier the lockfile records for each pinned package. Normally identical
// to PINNED, except typescript: the pnpm-workspace.yaml override pins
// `typescript: 6.0.3`, which strips the caret in the lockfile importer
// (audit §3 C7 — cosmetic, resolved version is 6.0.3 in both).
const LOCK_SPEC = { ...PINNED, typescript: "6.0.3" };

test("package.json pins the versions Wave A established", () => {
  assert.equal(pkg.packageManager, "pnpm@12.19.0");
  assert.equal(pkg.engines.node, ">=24");
  assert.equal(pkg.dependencies.astro, PINNED.astro);
  assert.equal(pkg.devDependencies.typescript, PINNED.typescript);
  assert.equal(pkg.devDependencies["@types/node"], PINNED["@types/node"]);
  assert.equal(
    pkg.dependencies["@playform/compress"],
    PINNED["@playform/compress"],
  );
  assert.equal(pkg.dependencies.vite, PINNED.vite);
});

test("lockfile agrees with package.json on the pinned versions", () => {
  for (const [name, spec] of Object.entries(LOCK_SPEC)) {
    // Importer entry: `      <name>:\n        specifier: <spec>`
    // (@-scoped names are single-quoted in the lockfile YAML.)
    const entry = new RegExp(
      `      '?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'?:\\n        specifier: ${spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    );
    assert.ok(
      entry.test(importers),
      `lockfile importer is missing ${name}: ${spec}`,
    );
  }
  // Resolved packages section carries the exact versions
  // (keys are YAML-quoted for @-scoped names, so no trailing colon).
  assert.ok(lockDoc.includes("astro@7.4.11"), "lockfile lacks astro@7.4.11");
  assert.ok(
    lockDoc.includes("@types/node@24.19.2"),
    "lockfile lacks @types/node@24.19.2",
  );
});

test("prop-types is kept: undeclared runtime dep of disqus-react", () => {
  // disqus-react@1.1.7 declares NO dependencies, but its compiled
  // lib/*.js files all require("prop-types"). It only ever resolved
  // because prop-types was a direct dep of this repo. Removing it
  // breaks `pnpm run build` (Rolldown cannot resolve "prop-types").
  assert.equal(pkg.dependencies["prop-types"], "^15.8.1");
  assert.ok(
    importers.includes("      prop-types:\n        specifier: ^15.8.1"),
    "lockfile importer is missing prop-types",
  );
});

test("packages removed as unused are not direct dependencies", () => {
  const removed = [
    "@astrojs/cloudflare",
    "@astrojs/vercel",
    "@supercharge/promise-pool",
    "astro-icon",
    "@aws-sdk/client-s3",
    "exif-be-gone",
    "i18n",
    "remark-github-blockquote-alert",
    "zod",
    // motion was added 2026-11-12 to be wired into the search modal, but
    // Wave C measured motion/react growing that chunk 18,070 -> 162,191 B
    // for a 150 ms fade, so it was evaluated and removed instead.
    "motion",
    "@ianvs/prettier-plugin-sort-imports",
    "prettier-plugin-tailwindcss",
    "rollup-plugin-visualizer",
  ];
  for (const name of removed) {
    assert.equal(pkg.dependencies?.[name], undefined, `${name} still in deps`);
    assert.equal(
      pkg.devDependencies?.[name],
      undefined,
      `${name} still in devDeps`,
    );
    assert.ok(
      !importers.includes(`      ${name}:`) &&
        !importers.includes(`      '${name}':`),
      `${name} still a direct dep in the lockfile importers`,
    );
  }
});
