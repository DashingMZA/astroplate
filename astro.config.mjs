import { unified } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import compress from "@playform/compress";
import tailwindcss from "@tailwindcss/vite";
import AutoImport from "astro-auto-import";
import { defineConfig, fontProviders } from "astro/config";
import rehypeKatex from "rehype-katex";
import remarkCollapse from "remark-collapse";
import remarkMath from "remark-math";
import remarkToc from "remark-toc";
import sharp from "sharp";
import config from "./src/config/config.json";
import languagesJSON from "./src/config/language.json";
import theme from "./src/config/theme.json";

const { default_language } = config.settings;

const supportedLang = [...languagesJSON.map((lang) => lang.languageCode)];
const disabledLanguages = config.settings.disable_languages;

// Filter out disabled languages from supportedLang
const filteredSupportedLang = supportedLang.filter(
  (lang) => !disabledLanguages.includes(lang),
);

// Helper to parse font string format: "FontName:wght@400;500;600;700"
function parseFontString(fontStr) {
  const [name, weightPart] = fontStr.split(":");
  let weights = [400]; // default weight

  if (weightPart) {
    // Extract weights from wght@400;500;600 format
    const weightMatch = weightPart.match(/wght@?([\d;]+)/);
    if (weightMatch) {
      weights = weightMatch[1].split(";").map((w) => parseInt(w, 10));
    }
  }

  // remove + from font name and add space
  const cleanName = name.replace(/\+/g, " ");
  return { name: cleanName, weights };
}

// Build fonts configuration from theme.json
const fontsConfig = Object.entries(theme.fonts.font_family)
  .filter(([key]) => !key.includes("_type")) // Filter out type entries
  .map(([key, fontStr]) => {
    const { name, weights } = parseFontString(fontStr);
    const typeKey = `${key}_type`;
    const fallback = theme.fonts.font_family[typeKey] || "sans-serif";

    return {
      name,
      cssVariable: `--font-${key}`,
      provider: fontProviders.google(),
      weights,
      display: "swap",
      fallbacks: [fallback],
    };
  });

// https://astro.build/config
export default defineConfig({
  site: config.site.base_url ? config.site.base_url : "http://examplesite.com",
  base: config.site.base_path ? config.site.base_path : "/",
  trailingSlash: config.site.trailing_slash ? "always" : "never",
  vite: { plugins: [tailwindcss()] },
  fonts: fontsConfig,
  i18n: { locales: filteredSupportedLang, defaultLocale: default_language },
  image: { service: sharp() },
  integrations: [
    react(),
    sitemap({
      // Exclude error/draft/preview/private pages from the sitemap.
      filter: (page) => {
        const { pathname } = new URL(page);
        if (pathname === "/404") {
          return false;
        }
        const segments = pathname.split("/").filter(Boolean);
        return !segments.some((segment) =>
          ["draft", "drafts", "preview", "private"].includes(segment),
        );
      },
    }),
    AutoImport({
      imports: [
        "@/shortcodes/Button",
        "@/shortcodes/Accordion",
        "@/shortcodes/Notice",
        "@/shortcodes/Video",
        "@/shortcodes/Youtube",
        "@/shortcodes/Tabs",
        "@/shortcodes/Tab",
      ],
    }),
    mdx(),
    // Compress must run last: it post-processes the built output (HTML/CSS/
    // Image/SVG/JSON). JavaScript is disabled on purpose — Astro/Vite already
    // minifies JS, and a second terser pass only re-minifies it for no gain
    // (see the PowerAI lesson). No adapter is wired: this is a static build
    // served via wrangler Static Assets / nginx.
    compress({ JavaScript: false }),
  ],
  markdown: {
    processor: unified({
      remarkPlugins: [
        remarkToc,
        [remarkCollapse, { test: "Table of contents" }],
        // Math: `$…$` / `$$…$$` render via KaTeX (CSS imported in Base.astro).
        remarkMath,
      ],
      // `strict: "ignore"` renders unparseable math as plain text instead of
      // failing the build on a typo'd formula.
      rehypePlugins: [[rehypeKatex, { strict: "ignore" }]],
    }),
    shikiConfig: { theme: "one-dark-pro", wrap: true },
  },
});
