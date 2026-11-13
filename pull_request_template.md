## Summary

<!-- What does this PR change, and why? Link related issues, e.g. "Fixes #123". -->

## Type of change

- [ ] Bug fix
- [ ] New feature / enhancement
- [ ] Content model / schema change
- [ ] SEO / metadata change
- [ ] Design / UX change
- [ ] Documentation
- [ ] CI / workflows / tooling
- [ ] Chore / refactor

## Testing done

<!-- Commands run and their results. All of these must pass: -->

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm run check` (astro check, 0 errors)
- [ ] `npx prettier --check ./src`
- [ ] `pnpm run build` (production build, exit 0)

<!-- Paste the relevant output, or describe what you verified manually
(e.g. checked the built dist/ output, tested a draft post, tested an
absolute R2 image URL, tested multiple authors). -->

## Screenshots

<!-- Required for any UI change: before/after, desktop and mobile if the
layout is affected. Delete this section if the PR has no visual change. -->

## Checklist

- [ ] No hardcoded single-site branding — the change works for any site using this theme (see `CONFIGURATION.md`).
- [ ] No change to Sitepins, PowerAI Astro, or Geeky Astro.
- [ ] No production deploy triggered or performed by this PR.
- [ ] Docs updated if behavior, config, or the content schema changed (`README.md`, `CONFIGURATION.md`, `CONTENT_SCHEMA.md`, `SEO_GUIDE.md`, `IMAGE_STORAGE.md`, or `CHANGELOG.md` as appropriate).
- [ ] Drafts / private pages are not indexed (if the change touches routing, sitemap, RSS, or robots).
