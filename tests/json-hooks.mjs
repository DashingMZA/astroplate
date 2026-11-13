// ESM loader hooks for the smoke tests only.
// astro.config.mjs imports ./src/config/*.json without import attributes,
// which Vite/Astro accept but plain Node rejects
// (ERR_IMPORT_ATTRIBUTE_MISSING). These hooks add the JSON type attribute
// so `node --test` can import the config exactly as Astro sees it.
// They also resolve the `@/` path alias (tsconfig `paths`) to ./src, so
// tests can import the real `src/lib/utils/*` helpers (seo.ts, authors.ts)
// exactly as Astro sees them. Extensionless `@/` imports try `.ts` first
// (Node type-strips them), then `.js`.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

function resolveAtImport(specifier) {
  const base = fileURLToPath(new URL("../src/", import.meta.url));
  const rel = specifier.slice(2);
  const candidates = [rel, `${rel}.ts`, `${rel}.js`, `${rel}/index.ts`];
  for (const candidate of candidates) {
    const full = base + candidate;
    if (existsSync(full)) {
      return full;
    }
  }
  return base + rel;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const full = resolveAtImport(specifier);
    const url = pathToFileURL(full).href;
    // JSON under @/ still needs the import attribute (see header).
    if (url.endsWith(".json")) {
      return { url, shortCircuit: true, importAttributes: { type: "json" } };
    }
    return { url, shortCircuit: true };
  }
  const result = await nextResolve(specifier, context);
  if (result.url.endsWith(".json")) {
    return { ...result, importAttributes: { type: "json" } };
  }
  return result;
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    return nextLoad(url, {
      ...context,
      importAttributes: { type: "json" },
    });
  }
  return nextLoad(url, context);
}
