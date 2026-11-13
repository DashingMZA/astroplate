// Wave C tests — accessibility markers in source.
// These are SOURCE markers, not a runtime audit: they guard the Wave C
// a11y work against silent regression (a renamed attribute, a dropped
// role, a re-added focus suppression). They do not replace an axe /
// Lighthouse run against the built site — see ACCESSIBILITY.md.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

test("nav toggle is a real button with dynamic aria-expanded", () => {
  const header = read("src/layouts/partials/Header.astro");
  assert.ok(header.includes('id="nav-toggle"'));
  assert.ok(header.includes('aria-controls="nav-menu"'));
  assert.ok(header.includes("aria-label"));
  assert.ok(header.includes("Open menu"));
  assert.ok(header.includes("Close menu"));
  // aria-expanded is updated in JS on every toggle, not static.
  assert.ok(header.includes('setAttribute("aria-expanded"'));
  // Submenu toggles are keyboard-reachable buttons, not hover-only.
  assert.ok(header.includes('aria-haspopup="true"'));
  // aria-controls is a template expression: submenu-${slugify(name)}.
  assert.ok(header.includes("aria-controls={`submenu-"));
  // The submenu list keeps lg:invisible in its class list, but the
  // unlayered [data-open="true"] rule in safe.css beats the layered
  // Tailwind utility whenever the submenu is open (click / focus),
  // so open-submenu links stay in the tab order.
  const safe = read("src/styles/safe.css");
  assert.ok(safe.includes('[data-open="true"]'));
  assert.ok(safe.includes("visibility: visible"));
  // Escape closes the menu and returns focus to the toggle.
  assert.ok(header.includes('"Escape"'));
});

test("search modal is a labelled dialog with a focus trap, not a motion island", () => {
  const modal = read("src/layouts/helpers/SearchModal.tsx");
  assert.ok(modal.includes('role="dialog"'));
  assert.ok(modal.includes('aria-modal="true"'));
  assert.ok(modal.includes('aria-label="Clear search"'));
  assert.ok(modal.includes('aria-live="polite"'));
  assert.ok(modal.includes("focus"));
  // Motion is NOT wired here: motion/react would grow the search chunk
  // ~18 KB -> ~162 KB for a 150 ms fade; the modal animates with a CSS
  // transition instead (see src/styles/search.css). The word "motion"
  // appears in the file's header comment explaining exactly that, so
  // assert on the import, not the word.
  assert.ok(!modal.includes('from "motion'), "SearchModal must not import motion");
  assert.ok(!modal.includes("from 'motion"), "SearchModal must not import motion");
});

test("accordion and tabs implement the ARIA patterns", () => {
  const accordion = read("src/layouts/shortcodes/Accordion.tsx");
  assert.ok(accordion.includes("aria-expanded"));
  assert.ok(accordion.includes("aria-controls"));
  assert.ok(accordion.includes('role="region"'));
  assert.ok(accordion.includes("aria-labelledby"));

  const tabs = read("src/layouts/shortcodes/Tabs.tsx");
  assert.ok(tabs.includes('role="tablist"'));
  assert.ok(tabs.includes('role="tab"'));
  assert.ok(tabs.includes('role="tabpanel"'));
  assert.ok(tabs.includes("aria-selected"));
  assert.ok(tabs.includes("ArrowRight"));
  assert.ok(tabs.includes("ArrowLeft"));
});

test("global focus-visible and reduced-motion rules exist", () => {
  const base = read("src/styles/base.css");
  assert.ok(base.includes(":focus-visible"));
  assert.ok(base.includes("prefers-reduced-motion"));
  // Nothing suppresses focus indication on the search/form inputs.
  // (Strip /* */ comments first: both files document the removal
  // in a comment that names the removed utilities.)
  const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const search = stripComments(read("src/styles/search.css"));
  assert.ok(!search.includes("outline-none"), "search input must keep its outline");
  assert.ok(!search.includes("ring-0"), "search input must keep its focus ring");
  const utilities = stripComments(read("src/styles/utilities.css"));
  assert.ok(
    !utilities.includes("focus:ring-transparent"),
    "form inputs must keep their focus indication",
  );
});

test("contact form is labelled and announces its states", () => {
  const contact = read("src/pages/contact.astro");
  assert.ok(contact.includes('aria-describedby'));
  assert.ok(contact.includes('aria-invalid'));
  assert.ok(contact.includes('role="status"'));
  // The error state sets role="alert" via setAttribute in the submit
  // script (status.setAttribute("role", isError ? "alert" : "status")).
  assert.ok(contact.includes('setAttribute("role"'));
  assert.ok(contact.includes('"alert"'));
  assert.ok(contact.includes('autocomplete="email"'));
  assert.ok(contact.includes("Contact form not configured"));
});

test("breadcrumbs and pagination mark the current page", () => {
  assert.ok(
    read("src/layouts/components/Breadcrumbs.astro").includes(
      'aria-current="page"',
    ),
  );
  assert.ok(
    read("src/layouts/components/Pagination.astro").includes(
      'aria-current="page"',
    ),
  );
});
