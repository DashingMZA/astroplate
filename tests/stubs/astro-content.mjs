// Stub for `astro:content` under plain `node --test`. The real module is
// a Vite virtual module that only exists inside an Astro build, so unit
// tests cannot import it. Tests import the pure sitemap transforms
// (`*ToEntries`, `contentLastmod`, …), never the live collectors — any
// test that accidentally calls a live collector fails loudly here
// instead of silently passing with fake data. The production build is
// unaffected: Astro resolves `astro:content` itself, this stub is only
// wired in through the test loader hooks (`tests/json-hooks.mjs`).
export function getCollection() {
  throw new Error(
    "astro:content is stubbed in unit tests — getCollection() only runs inside an Astro build. " +
      "Test the pure *ToEntries transforms in src/lib/seo/sitemap/collectors.ts instead.",
  );
}

export function getEntry() {
  throw new Error(
    "astro:content is stubbed in unit tests — getEntry() only runs inside an Astro build.",
  );
}

export function render() {
  throw new Error(
    "astro:content is stubbed in unit tests — render() only runs inside an Astro build.",
  );
}
