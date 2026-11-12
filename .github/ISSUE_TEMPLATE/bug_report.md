---
name: Bug report
about: Report a bug in the Astroplate theme (layout, SEO, build, content, or config)
title: "[bug] "
labels: bug
assignees: ""
---

## Describe the bug

A clear and concise description of what the bug is.

## To reproduce

Steps to reproduce the behavior:

1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

## Expected behavior

A clear and concise description of what you expected to happen.

## Actual behavior

What happened instead (include the exact error message or wrong output, if any).

## Environment

- Astro version: [e.g. 7.4.10 — run `npx astro --version`]
- Node.js version: [e.g. 24.x — run `node --version`]
- pnpm version: [e.g. 11.17.0 — run `pnpm --version`]
- OS: [e.g. macOS 15 / Ubuntu 24.04 / Windows 11]
- Browser (for rendering bugs): [e.g. Chrome 140, Firefox 142]

## Site configuration

Which settings are involved, if any (from `src/config/config.json` / `src/config/theme.json`):

- `base_url`: [e.g. https://example.com]
- Theme / fonts / colors changed from the defaults? [yes/no — what changed]

## Content involved

If the bug is about a post or page, paste the relevant frontmatter
(`src/content/blog/...` or `src/content/pages/...`) or link to the file.
For image bugs, state whether the image is local (`public/images/...`)
or an absolute remote URL (e.g. Cloudflare R2) — see `IMAGE_STORAGE.md`.

## Screenshots

If applicable, add screenshots to help explain the problem.

## Additional context

Add any other context about the problem here. If the build fails, paste
the full output of `pnpm run build` (or `pnpm run check` for type errors).
