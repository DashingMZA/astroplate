Dummy file — triggers a Vercel deploy.

Vercel's Ignored Build Step only builds when something under `public/`
changes, so this file is included in the sitemap-system commit to make
sure the push triggers a deploy. It serves no other purpose.

The site owner will delete this file himself later.
