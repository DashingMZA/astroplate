// Regression test: `pnpm run check` must generate the search index BEFORE
// `astro check` runs.
//
// src/layouts/helpers/SearchModal.tsx statically imports
// ../../../.json/search.json, and .json/ is gitignored — the file only
// exists after scripts/jsonGenerator.js runs (dev/build already run it
// first). In a fresh checkout (CI) the file is absent, so a bare
// `astro check` fails with TS2307 and the CI typecheck step goes red
// while the same command passes on a developer machine that has built
// before. The check script must therefore generate first.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

test("check script generates the search index before astro check", () => {
  const check = pkg.scripts.check;
  assert.ok(check.includes("node scripts/jsonGenerator.js"), check);
  assert.ok(check.includes("astro check"), check);
  assert.ok(
    check.indexOf("node scripts/jsonGenerator.js") <
      check.indexOf("astro check"),
    `generator must run before astro check: ${check}`,
  );
});
