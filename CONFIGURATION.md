# Configuration

Astroplate is configured through four JSON files in `src/config/`.
No code changes are needed to rebrand the site, change the domain,
or change navigation and social links. After editing any of these
files, restart `pnpm dev` (or rebuild) to see the change.

| File | Controls |
| --- | --- |
| `src/config/config.json` | Site identity, domain, publisher, behaviour settings, announcement, navigation button, GTM, Disqus, metadata, LLM docs |
| `src/config/theme.json` | Colours (light + dark) and fonts |
| `src/config/menu.json` | Main and footer navigation |
| `src/config/social.json` | Social links |

Where the values are used: `astro.config.mjs` reads `site.base_url`,
`site.base_path`, and `site.trailing_slash` for the site URL, base path,
and trailing-slash behaviour, and reads `theme.json` for the font
setup. `src/layouts/Base.astro` reads the site, metadata, publisher,
GTM, and Disqus settings for every page's `<head>`.

## `config.json`

### `site`

| Key | Type | Default | What it controls |
| --- | --- | --- | --- |
| `title` | string | `"Astroplate"` | Site name; fallback page title, `og:site_name`, RSS title |
| `base_url` | string | `"https://astroplate.csofts.tech"` | Canonical domain. Every canonical URL, `og:url`, sitemap URL, and RSS link is built from this. Must be the public production URL, with scheme, no trailing slash |
| `base_path` | string | `"/"` | Sub-path the site is served under (e.g. `"/blog"`). `"/"` means root |
| `trailing_slash` | boolean | `false` | `true` → URLs end with `/`; `false` → no trailing slash. Affects canonical URLs and Astro routing |
| `language` | string | `"en"` | `lang` attribute on `<html>` |
| `locale` | string | `"en_US"` | `og:locale` meta tag |
| `favicon` | string | `"/images/favicon.png"` | Favicon path (relative to `public/`) |
| `logo` | string | `"/images/logo.png"` | Light-mode logo |
| `logo_darkmode` | string | `"/images/logo-darkmode.png"` | Dark-mode logo |
| `logo_width` | string | `"150"` | Logo width in px |
| `logo_height` | string | `"30"` | Logo height in px |
| `logo_text` | string | `"Astroplate"` | Text fallback / alt text for the logo |

### `publisher`

Used for the JSON-LD `publisher` on every blog post.

| Key | Type | Default | What it controls |
| --- | --- | --- | --- |
| `name` | string | `"Astroplate"` | Publisher name in JSON-LD |
| `type` | string | `"Organization"` | Schema.org type (`Organization` or `Person`) |
| `logo` | string | `"/images/logo.png"` | Publisher logo URL in JSON-LD (resolved to absolute) |
| `url` | string | `"https://astroplate.csofts.tech"` | Publisher URL in JSON-LD |

### `settings`

| Key | Type | Default | What it controls |
| --- | --- | --- | --- |
| `search` | boolean | `true` | Enable the search modal |
| `sticky_header` | boolean | `true` | Header sticks to the top while scrolling |
| `theme_switcher` | boolean | `true` | Show the light/dark theme switcher |
| `default_theme` | string | `"system"` | Default theme: `"system"`, `"light"`, or `"dark"` |
| `pagination` | number | `2` | Blog posts per page on list pages |
| `summary_length` | number | `200` | Excerpt/summary character length used in listings |
| `blog_folder` | string | `"blog"` | URL folder for blog posts (`/blog/...`) |

### `announcement`

A dismissible banner shown above the header.

| Key | Type | Default |
| --- | --- | --- |
| `enable` | boolean | `true` |
| `content` | string (HTML allowed) | Welcome message with a GitHub link |
| `expire_days` | number | `7` — days before the dismissed banner is shown again |

Set `enable` to `false` to hide it entirely.

### `params`

| Key | Type | Default | What it controls |
| --- | --- | --- | --- |
| `contact_form_action` | string | `"#"` | Where the contact form posts. `"#"` is a dead end — point this at a real form endpoint (e.g. Formspree, Netlify Forms, or your own API) before using the contact page in production |
| `copyright` | string | `"Designed And Developed by [cSofts](https://csofts.com)"` | Footer copyright line (Markdown links allowed) |

### `navigation_button`

The call-to-action button in the header.

| Key | Type | Default |
| --- | --- | --- |
| `enable` | boolean | `true` |
| `label` | string | `"Edit with cSofts"` |
| `link` | string | CMS clone URL |

### `google_tag_manager`

| Key | Type | Default |
| --- | --- | --- |
| `enable` | boolean | `false` — disabled by default |
| `gtm_id` | string | `"GTM-XXXXXX"` — replace with your real GTM container ID when enabling |

### `disqus`

| Key | Type | Default |
| --- | --- | --- |
| `enable` | boolean | `false` — comments off by default |
| `shortname` | string | `"csofts-template"` — your Disqus shortname |
| `settings` | object | `{}` — passed through to the Disqus embed config |

When `enable` is `false`, no Disqus code is rendered at all.

### `metadata`

Site-wide SEO fallbacks, used when a page/post does not set its own
values (see [SEO_GUIDE.md](SEO_GUIDE.md)).

| Key | Type | Default | What it controls |
| --- | --- | --- | --- |
| `meta_author` | string | `"cSofts"` | `<meta name="author">` on every page |
| `meta_image` | string | `"/images/og-image.png"` | Default Open Graph / Twitter image (1200×630 recommended) |
| `meta_image_alt` | string | `"Astroplate"` | `og:image:alt` / `twitter:image:alt` |
| `meta_description` | string | `"Astro and Tailwind boilerplate"` | Default `<meta name="description">`, OG description, and RSS channel description |

### `llms`

Controls LLM-friendly docs generation during `pnpm build`
(`scripts/llmsGenerator.js` converts built HTML to Markdown).

| Key | Type | Default | What it controls |
| --- | --- | --- | --- |
| `generate_llms_txt` | boolean | `true` | Generate `llms.txt` (index of pages) |
| `generate_llms_full_txt` | boolean | `true` | Generate `llms-full.txt` (all content combined) |
| `generate_individual_md` | boolean | `true` | Generate one `.md` file per page |
| `include` | string[] | `[]` | Only include these routes/globs; empty = all. Example: `["/about", "/blog/**"]` |
| `exclude` | string[] | `[]` | Exclude these routes/globs on top of the defaults. Example: `["/blog/index.html"]` |

## `theme.json`

### `colors`

Two palettes, `default` (light) and `darkmode`. Each has:

- `theme_color`: `primary` (brand/accent), `body` (page background),
  `border`, `light` (light surfaces), `dark` (dark surfaces)
- `text_color`: `text` (body text), `text_dark` (headings),
  `text_light` (muted text)

Current defaults — light: primary `#121212`, body `#fff`,
border `#eaeaea`, light `#f6f6f6`, dark `#040404`, text `#444444`,
text_dark `#040404`, text_light `#717171`. Dark: primary `#fff`,
body `#1c1c1c`, border `#3E3E3E`, light `#222222`, dark `#fff`,
text `#B4AFB6`, text_dark `#fff`, text_light `#B4AFB6`.

Editing `theme.json` regenerates `src/styles/generated-theme.css`
via `scripts/themeGenerator.js` (watched during `pnpm dev`, run once
during `pnpm build`). Keep light and dark palettes in sync — every key
present in one should be present in the other.

### `fonts`

```json
{
  "fonts": {
    "font_family": {
      "primary": "Heebo:wght@400;600",
      "primary_type": "sans-serif",
      "secondary": "Signika:wght@500;700",
      "secondary_type": "sans-serif"
    },
    "font_size": {
      "base": "16",
      "scale": "1.2"
    }
  }
}
```

- Font strings use the form `"Name:wght@400;600"` — the family name,
  then weights after `wght@`, separated by `;`. Spaces in a name are
  written as `+` (e.g. `"Inter:wght@400;700"`).
- Each `*_type` key is the CSS fallback stack for that family
  (e.g. `"sans-serif"`).
- `font_size.base` is the base font size in px (`"16"`); `scale` is
  the typographic scale ratio (`"1.2"`).
- Fonts are loaded from Google Fonts via Astro's built-in Font API
  (`astro.config.mjs` builds the font config from this file).

To remove dark mode entirely, run `pnpm remove-darkmode`
(it also runs the formatter).

## `menu.json`

Two arrays, `main` (header) and `footer`. Each item:

```json
{ "name": "About", "url": "/about" }
```

Dropdowns use `hasChildren: true` with a `children` array:

```json
{
  "name": "Pages",
  "url": "",
  "hasChildren": true,
  "children": [
    { "name": "Blog", "url": "/blog" },
    { "name": "Authors", "url": "/authors" }
  ]
}
```

Rules:

- `url` is a site-relative path (`"/about"`) or `""` for a
  parent-only dropdown item.
- External links use a full URL (`"https://example.com"`).
- Keep every `url` pointing at a page that exists, or the link 404s.
  The 404 page itself (`/404`) is a valid menu target.

## `social.json`

One array, `main`. Each entry:

```json
{
  "name": "github",
  "icon": "FaGithub",
  "link": "https://github.com/DashingMZA"
}
```

- `name` is the label.
- `icon` is a `react-icons` Font Awesome icon component name
  (e.g. `FaFacebook`, `FaXTwitter`, `FaInstagram`, `FaTiktok`,
  `FaGithub`, `FaLinkedin`). It must match an exported icon name or
  the icon will not render.
- `link` is the full profile URL. Remove an entry to remove that
  network; add an entry to add one.

## Worked example: configuring a new, independent website

Goal: turn this template into a new site, “Northwind Notes”, at
`https://northwindnotes.com`, without touching any code. Only the
files below change.

### 1. `src/config/config.json` — identity and domain

```json
{
  "site": {
    "title": "Northwind Notes",
    "base_url": "https://northwindnotes.com",
    "base_path": "/",
    "trailing_slash": false,
    "language": "en",
    "locale": "en_US",
    "favicon": "/images/favicon.png",
    "logo": "/images/logo.png",
    "logo_darkmode": "/images/logo-darkmode.png",
    "logo_width": "150",
    "logo_height": "30",
    "logo_text": "Northwind Notes"
  },
  "publisher": {
    "name": "Northwind Notes",
    "type": "Organization",
    "logo": "/images/logo.png",
    "url": "https://northwindnotes.com"
  },
  "settings": {
    "search": true,
    "sticky_header": true,
    "theme_switcher": true,
    "default_theme": "system",
    "pagination": 6,
    "summary_length": 200,
    "blog_folder": "blog"
  },
  "announcement": { "enable": false },
  "params": {
    "contact_form_action": "https://formspree.io/f/your-form-id",
    "copyright": "© Northwind Notes"
  },
  "navigation_button": {
    "enable": true,
    "label": "Subscribe",
    "link": "/blog"
  },
  "google_tag_manager": { "enable": false, "gtm_id": "GTM-XXXXXX" },
  "disqus": { "enable": false, "shortname": "northwind-notes", "settings": {} },
  "metadata": {
    "meta_author": "Northwind Notes",
    "meta_image": "/images/og-image.png",
    "meta_image_alt": "Northwind Notes",
    "meta_description": "Field notes on building small, fast websites."
  }
}
```

Notes: `base_url` must be the real production domain — it drives
canonical URLs, sitemap, and RSS. `pagination: 6` shows six posts per
blog page instead of the default two. The contact form now points at a
real endpoint instead of `"#"`.

### 2. Replace the brand images in `public/images/`

- `logo.png` and `logo-darkmode.png` — your logo (150×30 at the
  configured dimensions; use your own sizes and update `logo_width` /
  `logo_height` to match).
- `favicon.png` — your favicon.
- `og-image.png` — your default social-share image (1200×630).

Keep the same filenames and you do not need to edit any config paths.
See [IMAGE_STORAGE.md](IMAGE_STORAGE.md) for formats and sizing.

### 3. `src/config/theme.json` — colours and fonts

```json
{
  "colors": {
    "default": {
      "theme_color": {
        "primary": "#0B5FFF",
        "body": "#ffffff",
        "border": "#e5e7eb",
        "light": "#f3f4f6",
        "dark": "#111827"
      },
      "text_color": {
        "text": "#374151",
        "text_dark": "#111827",
        "text_light": "#6b7280"
      }
    },
    "darkmode": {
      "theme_color": {
        "primary": "#7aa8ff",
        "body": "#111827",
        "border": "#374151",
        "light": "#1f2937",
        "dark": "#f9fafb"
      },
      "text_color": {
        "text": "#d1d5db",
        "text_dark": "#f9fafb",
        "text_light": "#9ca3af"
      }
    }
  },
  "fonts": {
    "font_family": {
      "primary": "Inter:wght@400;600;700",
      "primary_type": "sans-serif",
      "secondary": "Fraunces:wght@500;700",
      "secondary_type": "serif"
    },
    "font_size": { "base": "16", "scale": "1.25" }
  }
}
```

### 4. `src/config/menu.json` — navigation

```json
{
  "main": [
    { "name": "Home", "url": "/" },
    { "name": "Blog", "url": "/blog" },
    { "name": "About", "url": "/about" },
    { "name": "Contact", "url": "/contact" }
  ],
  "footer": [
    { "name": "Privacy Policy", "url": "/privacy-policy" },
    { "name": "Blog", "url": "/blog" }
  ]
}
```

### 5. `src/config/social.json` — social profiles

```json
{
  "main": [
    { "name": "x", "icon": "FaXTwitter", "link": "https://x.com/northwindnotes" },
    { "name": "github", "icon": "FaGithub", "link": "https://github.com/northwindnotes" },
    { "name": "linkedin", "icon": "FaLinkedin", "link": "https://www.linkedin.com/company/northwindnotes" }
  ]
}
```

### 6. Language / locale

Set `site.language` (HTML `lang`, e.g. `"en"`, `"de"`) and
`site.locale` (Open Graph locale, e.g. `"en_US"`, `"de_DE"`) in
`config.json`. That is the full extent of language configuration:
**there is no multilingual / hreflang support in this template** —
content is single-language only. Translating the UI strings or
running a second language edition is not supported out of the box.

### 7. Replace the demo content

Delete or rewrite the demo posts in `src/content/blog/`, the demo
authors in `src/content/authors/`, and the homepage/about/contact
copy in `src/content/homepage/`, `src/content/about/`, and
`src/content/contact/`. Field rules are in
[CONTENT_SCHEMA.md](CONTENT_SCHEMA.md).

### 8. Build and verify

```bash
pnpm check
pnpm build
pnpm preview
```

Then confirm the new domain appears in the built output — see the
smoke checks in [SEO_GUIDE.md](SEO_GUIDE.md) and
[DEPLOYMENT.md](DEPLOYMENT.md).
