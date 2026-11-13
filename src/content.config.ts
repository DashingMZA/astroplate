import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

const commonFields = {
  title: z.string(),
  description: z.string(),
  meta_title: z.string().optional(),
  // z.coerce.date() handles both Date objects and ISO string dates from frontmatter (Zod 4)
  date: z.coerce.date().optional(),
  image: z.string().optional(),
  draft: z.boolean(),
};

// Canonical URLs may be absolute (https://…) or site-relative (/blog/x);
// anything else is rejected at validation time. Relative values are
// resolved against the site base URL at render time.
const canonicalField = z
  .string()
  .refine((v) => /^https?:\/\//i.test(v) || v.startsWith("/"), {
    message:
      "canonical must be an absolute https URL or a site-relative path starting with /",
  })
  .optional();

// SEO fields shared by the page-like collections (pages, about, contact).
// Blog has the same fields inline (plus excerpt/featured/authors).
const seoFields = {
  // Custom URL slug (overrides the filename-derived id; see src/lib/utils/slug.ts).
  slug: z.string().optional(),
  og_title: z.string().optional(),
  og_description: z.string().optional(),
  // Social-share image; falls back to `image` when unset.
  og_image: z.string().optional(),
  canonical: canonicalField,
  noindex: z.boolean().optional(),
};

// Post collection schema
const blogCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "src/content/blog" }),
  schema: z.object({
    title: z.string(),
    meta_title: z.string().optional(),
    description: z.string().optional(),
    // Short summary for cards/search; falls back to description/body at render.
    excerpt: z.string().optional(),
    // Custom URL slug (overrides the filename-derived id; see src/lib/utils/slug.ts).
    slug: z.string().optional(),
    date: z.coerce.date().optional(),
    // Last-updated date; `lastmod` is the sitemap alias for the same value.
    updated: z.coerce.date().optional(),
    lastmod: z.coerce.date().optional(),
    image: z.string().optional(),
    // Social-share image; falls back to `image` when unset.
    og_image: z.string().optional(),
    og_title: z.string().optional(),
    og_description: z.string().optional(),
    author: z.string().default("Admin"),
    // Multi-author support; `author` above stays as the single-author fallback.
    authors: z.array(z.string()).optional(),
    featured: z.boolean().optional(),
    canonical: canonicalField,
    noindex: z.boolean().optional(),
    // Use factory functions for mutable array defaults (Zod 4 best practice)
    categories: z.array(z.string()).default(() => ["others"]),
    tags: z.array(z.string()).default(() => ["others"]),
    draft: z.boolean().optional(),
  }),
});

// Author collection schema
const authorsCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "src/content/authors" }),
  schema: z.object({
    ...commonFields,
    // Present in author files and the Sitepins authors schema; was silently
    // dropped by validation because it was missing here.
    email: z.string().optional(),
    canonical: canonicalField,
    noindex: z.boolean().optional(),
    social: z
      .array(
        z
          .object({
            name: z.string().optional(),
            icon: z.string().optional(),
            link: z.string().optional(),
          })
          .optional(),
      )
      .optional(),
    draft: z.boolean().optional(),
  }),
});

// Pages collection schema
const pagesCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "src/content/pages" }),
  schema: z.object({
    ...commonFields,
    ...seoFields,
  }),
});

// about collection schema
const aboutCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "src/content/about" }),
  schema: z.object({
    ...commonFields,
    ...seoFields,
  }),
});

// contact collection schema
const contactCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "src/content/contact" }),
  schema: z.object({
    ...commonFields,
    ...seoFields,
  }),
});

// Homepage collection schema
const homepageCollection = defineCollection({
  loader: glob({ pattern: "**/-*.{md,mdx}", base: "src/content/homepage" }),
  schema: z.object({
    banner: z.object({
      title: z.string(),
      content: z.string(),
      image: z.string(),
      button: z.object({
        enable: z.boolean(),
        label: z.string(),
        link: z.string(),
      }),
    }),
    features: z.array(
      z.object({
        title: z.string(),
        image: z.string(),
        content: z.string(),
        bulletpoints: z.array(z.string()),
        button: z.object({
          enable: z.boolean(),
          label: z.string(),
          link: z.string(),
        }),
      }),
    ),
  }),
});

// Call to Action collection schema
const ctaSectionCollection = defineCollection({
  loader: glob({
    pattern: "*/call-to-action.{md,mdx}",
    base: "src/content/sections",
  }),
  schema: z.object({
    enable: z.boolean(),
    title: z.string(),
    description: z.string(),
    image: z.string(),
    button: z.object({
      enable: z.boolean(),
      label: z.string(),
      link: z.string(),
    }),
  }),
});

// Testimonials Section collection schema
const testimonialSectionCollection = defineCollection({
  loader: glob({
    pattern: "*/testimonial.{md,mdx}",
    base: "src/content/sections",
  }),
  schema: z.object({
    enable: z.boolean(),
    title: z.string(),
    description: z.string(),
    testimonials: z.array(
      z.object({
        name: z.string(),
        avatar: z.string(),
        designation: z.string(),
        content: z.string(),
      }),
    ),
  }),
});

// Export collections
export const collections = {
  // Pages
  homepage: homepageCollection,
  blog: blogCollection,
  authors: authorsCollection,
  pages: pagesCollection,
  about: aboutCollection,
  contact: contactCollection,

  // sections
  ctaSection: ctaSectionCollection,
  testimonialSection: testimonialSectionCollection,
};
