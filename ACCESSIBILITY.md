# Accessibility

This document describes what Astroplate actually does for
accessibility, what it deliberately does not do, and how to verify
it. It is written against the code in this repo — every claim below
names the file that implements it.

## What is in place

### Page structure

- **Skip link.** Every page starts with a “Skip to content” link
  (`src/layouts/Base.astro`) pointing at `#main-content`, so
  keyboard users can jump past the header and navigation.
- **Landmarks.** `<header>` / `<nav>` (`src/layouts/partials/Header.astro`),
  `<main id="main-content">`, and `<footer>` are present on every
  page, so assistive technology can navigate by landmark.
- **Language.** `<html lang>` comes from `config.site.language`
  (default `"en"`), so screen readers use the right pronunciation.
- **One `<h1>` per page.** Post, page, and listing pages render a
  single `<h1>`; cards use `<h3>` (e.g. `BlogCard.astro`) so the
  heading order does not skip levels. Two headings are injected
  from Markdown at runtime via `set:html` (the call-to-action and
  testimonial section titles) — they render as real `<h2>`s; the
  linter cannot see their content, so each carries a targeted
  `eslint-disable` with a reason comment rather than a structural
  change.

### Navigation (`src/layouts/partials/Header.astro`)

- The mobile menu toggle is a real `<button>` (not a checkbox +
  label), keyboard-operable, with `aria-expanded` updated in
  JavaScript on every toggle and `aria-label` reflecting the state
  (“Open menu” / “Close menu”). `aria-controls` points at the menu
  element's id.
- **Escape** closes an open submenu first (focus returns to its
  button), otherwise closes the mobile menu (focus returns to the
  toggle).
- Dropdown submenus open from real buttons (`aria-expanded`,
  `aria-haspopup`, `aria-controls`) on click, on `focus-within`,
  and on hover — never hover-only. Links are never removed from
  the tab order with `lg:invisible`.
- Decorative toggle icons are `aria-hidden="true"`.
- The menu is a disclosure pattern: focus stays on the toggle
  while the menu is open.

### Search (`src/layouts/helpers/SearchModal.tsx`)

- The modal is `role="dialog"` with `aria-modal="true"` and an
  accessible label (“Search”).
- **Focus trap** while open: Tab cycles within the modal; focus
  moves into the search input on open and **returns to the trigger
  on close**.
- The clear control is a real `<button aria-label="Clear search">`,
  not a clickable SVG.
- The result-count region has `aria-live="polite"`.
- Ctrl/Cmd+K opens the modal; the document-level arrow-key
  handling fires **only while the modal is open**.
- The modal animates with a CSS transition (`src/styles/search.css`),
  disabled under `prefers-reduced-motion` (see below).

### Accordion and Tabs (`src/layouts/shortcodes/`)

- **Accordion:** each toggle is a `<button>` with `aria-expanded`
  and `aria-controls`; each panel has `role="region"` and
  `aria-labelledby`, and is `hidden` when closed.
- **Tabs:** full pattern — `role="tablist"` / `tab` /
  `tabpanel`, `aria-selected`, `aria-controls` /
  `aria-labelledby`, and keyboard support: ArrowRight/ArrowLeft
  move between tabs, Home/End jump to first/last, Space/Enter
  activate without scrolling the page.

### Focus visibility

- A global `:focus-visible` rule (`src/styles/base.css`) draws a
  2 px outline in the theme primary colour (dark-mode variant
  included) on every focusable element. Nothing in the theme
  suppresses focus indication: the old `outline-none` /
  `focus:ring-0` on the search input and `focus:ring-transparent`
  on form inputs were removed, and the theme-switcher checkbox
  draws its focus outline on the visible label/knob
  (`src/styles/navigation.css`).
- The theme switcher keeps its accessible name from its `<label>`
  (`<span class="sr-only">theme switcher</span>` in
  `src/layouts/components/ThemeSwitcher.astro`).

### Reduced motion

- A `prefers-reduced-motion: reduce` media query
  (`src/styles/base.css`) disables smooth scrolling, transitions,
  and animations site-wide, including the search modal's CSS
  transition.
- The testimonial slider (`src/layouts/partials/Testimonial.astro`)
  stops its autoplay when `prefers-reduced-motion` matches, and
  pauses on mouse hover (`pauseOnMouseEnter`).

### Breadcrumbs and pagination

- Breadcrumbs (`src/layouts/components/Breadcrumbs.astro`) render
  inside `<nav aria-label="Breadcrumb">`; the current crumb has
  `aria-current="page"`.
- Pagination (`src/layouts/components/Pagination.astro`) renders
  inside `<nav aria-label="Pagination">`; the current page link
  has `aria-current="page"`.

### Contact form (`src/pages/contact.astro`)

- Every field has a real `<label>` (wrapping the control, plus
  `for`/`id`), `autocomplete="name"` / `autocomplete="email"`,
  and required fields are marked with an `aria-hidden` `*` plus
  sr-only “(required)” text.
- Field errors are announced via `aria-describedby` +
  `aria-invalid`, and the success message uses `role="status"`
  while the error message uses `role="alert"`.
- When no endpoint is configured the form is visibly disabled
  inside a disabled `<fieldset>` with a `role="status"` notice
  explaining how to configure it — the disabled state is
  announced, not silently broken.

### Images

- Images rendered by `ImageMod.astro` always carry an `alt`
  attribute; the homepage and post heroes use descriptive alt
  text derived from the page title (not the old generic
  `"banner"`).
- Decorative SVGs (nav icons, theme-switcher art) are
  `aria-hidden="true"` or have no accessible name.
- A missing local image renders a bundled placeholder with the
  `alt` text instead of a broken image; see
  [IMAGE_STORAGE.md](IMAGE_STORAGE.md).

### Announcement banner

- The banner (`src/layouts/helpers/Announcement.astro`) is hidden
  by default and shown by script; its close button has
  `aria-label="Close announcement"` and remembers the dismissal
  in a cookie.

## Known limitations (honest list)

- **The mobile menu needs JavaScript.** The toggle button and
  submenu logic are plain JS in `Header.astro`; with JavaScript
  disabled the mobile menu cannot be opened. Desktop navigation
  (always-visible links) still works.
- **Video shortcode has no captions.** `src/layouts/shortcodes/Video.tsx`
  renders a `<video>` without a `<track>` — no captions file exists
  for the demo video. Add a `captions` prop and a real `.vtt` file
  before using captioned video; a `<track>` without a `src` would
  be invalid markup.
- **Colour contrast is unmeasured.** The theme's colour pairs have
  not been checked against WCAG contrast ratios in this repo.
- **No automated accessibility audit has been run.** No axe /
  Lighthouse run exists (there is no Chromium in the build
  environment), so the claims above are code-verified, not
  tool-verified. Run `axe-core` or Lighthouse against the built
  site before claiming WCAG conformance.
- **Lint is the enforcement mechanism.** `pnpm run lint` includes
  `jsx-a11y` rules and currently exits 0; targeted disables exist
  only where the rule cannot see runtime-injected content
  (`set:html` headings, the `lite-youtube` custom element, the
  theme-switcher `for` label) — each with a reason comment.

## How to verify

1. `pnpm run lint` — 0 errors, including the `jsx-a11y` rules.
2. `pnpm run build`, then open the built site and Tab through it
   with a keyboard: the skip link appears first, the nav toggle
   announces “Open menu”, Escape closes the menu, the search modal
   traps focus and returns it on close, and every focusable element
   shows a visible outline.
3. Enable `prefers-reduced-motion` in the OS/browser and confirm
   the testimonial slider does not autoplay and page transitions
   are instant.
4. Run an axe/Lighthouse pass against the live deployment for the
   checks this repo cannot run itself.
