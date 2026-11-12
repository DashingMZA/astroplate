# Accessibility

This page records what is verified in the code today (2026-11-12) and what is not. **No accessibility audit tool (axe, Lighthouse) has been run** — there was no Chromium in the sandbox — so everything below is code-reading, not a measured audit. Run `axe` / Lighthouse on the deployed site before claiming conformance.

## What exists today

- **Skip link.** `Base.astro` renders `<a href="#main-content" class="skip-link">Skip to main content</a>` before the header; styles are in `src/styles/base.css` (`.skip-link`, visible on `:focus`). The main landmark is `<main id="main-content">`.
- **Landmarks.** `<main>` exists on every page via `Base.astro`. Header/footer are rendered on every page.
- **Viewport.** `width=device-width, initial-scale=1, maximum-scale=5` — pinch-zoom is not disabled.
- **Language.** `<html lang="en">`.
- **Mobile menu button** has `aria-label` ("Open menu"/"Close menu") and `aria-expanded`, updated by JS (`Header.astro`).
- **Images with good alt text in places.** `PostSingle.astro` uses the post title for the hero image alt; `ImageMod.astro` requires an `alt` prop.

## Known gaps (verified in code)

1. **Desktop dropdown menus are hover-only.** In `src/layouts/partials/Header.astro` the dropdown toggle button is `xl:pointer-events-none` (comment in the file: "pointer-events disabled on desktop; hover handles it via CSS") and the submenu is revealed by CSS hover. `aria-expanded` on the toggle is only updated by the mobile-menu JS, and there is no `aria-haspopup`/`aria-controls` on the desktop toggle. Keyboard and touch users cannot open desktop dropdowns. This is the most significant a11y gap.
2. **No `prefers-reduced-motion` guard.** Zero hits in `src/` for `prefers-reduced-motion`. The site animates heavily (19+ Astro files with inline `motion` scripts plus `motion/react` islands) with no reduced-motion path.
3. **Form fields rely on placeholders, not labels.** The contact, newsletter, apply, login, and sign-up forms have no associated `<label for="…">` on their text/email/password inputs. The only associated labels verified are the consent-toggle label (`ContactForm.astro`, `login.astro`) and the CV-upload label (`careers/[single].astro`). The contact form's submit stays `disabled` until the fake "agree" toggle is clicked, with no explanation beyond the button state for keyboard/assistive-tech users.
4. **Weak alt text in places.** `IconBox.astro` uses `alt="Icon"`; `WhatOurGoals.astro` uses `alt="goals"`. Decorative images are not consistently marked with empty `alt=""` / `aria-hidden`.
5. **Heading order was not strictly hierarchical at `HEAD`.** `PostSingle.astro` used `<h1>` for the title and `<h3>` for sidebar headings (skipping `<h2>`), and several components rendered section titles as `<h1>` (`CallToAction`, `KeyFeatures`, `PricingTable`, footer site title). A heading-hierarchy fix was in progress in the working tree when this doc was written (uncommitted, by parallel work — not part of this docs commit); re-verify heading order after that lands.
6. **Color contrast is unverified.** The dark theme (`#0E0912` body with `#B9B7BA` gray text, per the earlier audit) was not measured. Do not claim WCAG contrast conformance until measured.
7. **Two `client:*` directives are silently ignored.** `src/pages/case-studies/page/[page].astro` puts `client:load` on `<PageHeader>` and `client:visible` on `<CaseStudyCard>` — both are `.astro` components, which cannot be hydrated, so the directives do nothing. Harmless, but misleading; remove them.

## How to verify (follow-up)

```bash
pnpm run build && pnpm run preview
# then, in a browser with Chromium:
#  - axe DevTools: run on /, /blog, /blog/post-1, /contact, /pricing
#  - Keyboard-only walkthrough: Tab through the header — desktop dropdowns must open on focus/Enter
#  - Enable "Reduce motion" in the OS and reload — animations must stop or dampen
#  - Lighthouse Accessibility audit (also gives the contrast numbers)
```

Fix order if accessibility is a launch gate: (1) desktop dropdown keyboard support, (2) form labels, (3) `prefers-reduced-motion`, (4) alt-text pass, (5) heading order, (6) measured contrast.
