// ESLint flat config (ESLint 10).
// - @eslint/js recommended for JS
// - typescript-eslint `recommended` (NOT type-checked: the type-aware
//   configs need project service setup and are the part most likely to
//   break across TypeScript majors; this repo is pinned to TS 6 by
//   @astrojs/check 0.9.12, so keep linting parser-only here)
// - eslint-plugin-astro flat/recommended for .astro files
// - eslint-plugin-jsx-a11y flat recommended for .jsx/.tsx (note: jsx-a11y
//   6.10.2 still declares an eslint ^3-^9 peer range, so pnpm reports an
//   unmet peer for eslint 10 — it loads and runs fine; revisit when the
//   plugin publishes an eslint-10-compatible release)
import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", ".astro/**", "public/**"],
  },
  // Node globals (console, process, URL, fetch, timers, …) for the
  // config, scripts and tests, which all run under Node.
  {
    files: [
      "**/*.mjs",
      "**/*.cjs",
      "scripts/**/*.js",
      "tests/**/*.js",
      "eslint.config.js",
    ],
    languageOptions: { globals: globals.node },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs["flat/recommended"],
  jsxA11y.flatConfigs.recommended,
);
