// JSON-LD builders — pure functions (no config access) so tests can import
// them directly. Callers pass already-resolved absolute URLs and resolved
// authors; nothing here invents publisher, author or URL data.
//
// Base.astro merges the site-wide WebSite + Organization blocks with the
// page-specific blocks into ONE `@graph` script tag per page, so there is
// exactly one JSON-LD block per page and no duplicate Article/BlogPosting.
// The `@context` lives once at the graph level; each block below carries
// exactly the fields of the site's schema specs (WebPage, BreadcrumbList,
// BlogPosting) — same format, only the values are the page's own.
// A field whose value is unknown is omitted, never null or fabricated.

import { toIso } from "@/lib/utils/dates";

export interface JsonLdPersonInput {
  name: string;
  /** Absolute URL of the author page, when the author resolved to a file. */
  url?: string | null;
}

export interface BlogPostingInput {
  headline: string;
  description?: string | null;
  /** Absolute image URL(s); omitted when the post has no image. */
  image?: string | string[] | null;
  datePublished?: string | null;
  dateModified?: string | null;
  authors: JsonLdPersonInput[];
  /** Absolute canonical URL of the post (custom-slug URL). */
  url: string;
  /** e.g. "en" from config.site.language. */
  inLanguage?: string | null;
  /** First category (articleSection); omitted when the post has none. */
  articleSection?: string | null;
  /** Post tags (keywords); omitted when empty. */
  keywords?: string[] | null;
  /** Word count of the post body; omitted when unknown. */
  wordCount?: number | null;
}

export interface PublisherInput {
  name?: string | null;
  type?: string | null;
  logo?: string | null;
  url?: string | null;
}

function personObject(author: JsonLdPersonInput): Record<string, unknown> {
  return {
    "@type": "Person",
    ...(author.url ? { "@id": `${author.url}#person` } : {}),
    name: author.name,
    ...(author.url ? { url: author.url } : {}),
  };
}

function publisherObject(
  publisher: PublisherInput | null,
  siteUrl: string,
): Record<string, unknown> | undefined {
  if (!publisher?.name) return undefined;
  return {
    "@type": publisher.type ?? "Organization",
    name: publisher.name,
    ...(publisher.url
      ? { url: publisher.url }
      : siteUrl
        ? { url: siteUrl }
        : {}),
    ...(publisher.logo
      ? {
          logo: {
            "@type": "ImageObject",
            url: publisher.logo,
          },
        }
      : {}),
  };
}

/** BlogPosting for a blog post page. `url` is the canonical custom-slug URL. */
export function buildBlogPostingJsonLd(
  input: BlogPostingInput,
  siteUrl: string,
): Record<string, unknown> {
  const images = input.image
    ? Array.isArray(input.image)
      ? input.image.filter(Boolean)
      : [input.image]
    : [];
  const keywords = (input.keywords ?? []).filter(Boolean);
  return {
    "@type": "BlogPosting",
    "@id": `${input.url}#article`,
    url: input.url,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${input.url}#webpage`,
    },
    headline: input.headline,
    ...(input.description ? { description: input.description } : {}),
    ...(images.length > 0 ? { image: images } : {}),
    ...(toIso(input.datePublished)
      ? { datePublished: toIso(input.datePublished) }
      : {}),
    ...(toIso(input.dateModified)
      ? { dateModified: toIso(input.dateModified) }
      : {}),
    author:
      input.authors.length === 1
        ? personObject(input.authors[0])
        : input.authors.map(personObject),
    publisher: {
      "@id": `${siteUrl}/#organization`,
    },
    isPartOf: {
      "@id": `${siteUrl}/#blog`,
    },
    ...(input.inLanguage ? { inLanguage: input.inLanguage } : {}),
    ...(input.articleSection ? { articleSection: input.articleSection } : {}),
    ...(keywords.length > 0 ? { keywords } : {}),
    ...(typeof input.wordCount === "number"
      ? { wordCount: input.wordCount }
      : {}),
  };
}

/** Site-wide WebSite block. No SearchAction: search is a client-side modal,
 *  there is no search results page URL to target, and a SearchAction
 *  pointing at a non-existent `?q=` route would be fabricated data. */
export function buildWebsiteJsonLd(
  siteUrl: string,
  siteName: string,
): Record<string, unknown> {
  return {
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    url: siteUrl,
    name: siteName,
  };
}

/** Site-wide Organization block, from configured publisher data only. */
export function buildOrganizationJsonLd(
  publisher: PublisherInput | null,
  siteUrl: string,
): Record<string, unknown> | null {
  const org = publisherObject(publisher, siteUrl);
  if (!org) return null;
  return {
    ...org,
    "@id": `${siteUrl}/#organization`,
  };
}

/** Blog node for the blog index / post pages, so a BlogPosting `isPartOf`
 *  reference resolves to a node in the same @graph. */
export function buildBlogJsonLd(input: {
  name: string;
  url: string;
  siteUrl: string;
}): Record<string, unknown> {
  return {
    "@type": "Blog",
    "@id": `${input.siteUrl}/#blog`,
    url: input.url,
    name: input.name,
  };
}

/** Person block for an author page. `@id` matches the `author.@id` a
 *  BlogPosting emits for the same author, so the reference resolves. */
export function buildPersonJsonLd(input: {
  name: string;
  url: string;
  image?: string | null;
  description?: string | null;
}): Record<string, unknown> {
  return {
    "@type": "Person",
    "@id": `${input.url}#person`,
    name: input.name,
    url: input.url,
    ...(input.image ? { image: input.image } : {}),
    ...(input.description ? { description: input.description } : {}),
  };
}

/** WebPage block for a general website page (home, about, contact,
 *  regular pages). Article properties never belong here. */
export function buildWebPageJsonLd(input: {
  name: string;
  url: string;
  description?: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
  /** e.g. "en" from config.site.language. */
  inLanguage?: string | null;
  /** Site base URL (no trailing slash) for the #website / #organization refs. */
  siteUrl: string;
  /** Absolute page image URL; omitted when the page has none. */
  image?: string | null;
}): Record<string, unknown> {
  return {
    "@type": "WebPage",
    "@id": `${input.url}#webpage`,
    url: input.url,
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    ...(input.inLanguage ? { inLanguage: input.inLanguage } : {}),
    isPartOf: { "@id": `${input.siteUrl}/#website` },
    about: { "@id": `${input.siteUrl}/#organization` },
    publisher: { "@id": `${input.siteUrl}/#organization` },
    breadcrumb: { "@id": `${input.url}#breadcrumb` },
    ...(input.image
      ? {
          primaryImageOfPage: {
            "@type": "ImageObject",
            url: input.image,
          },
        }
      : {}),
    ...(toIso(input.datePublished)
      ? { datePublished: toIso(input.datePublished) }
      : {}),
    ...(toIso(input.dateModified)
      ? { dateModified: toIso(input.dateModified) }
      : {}),
  };
}

/** BreadcrumbList for a page's breadcrumb trail. `@id` is the page URL
 *  (the last item) + `#breadcrumb`, matching the WebPage `breadcrumb` ref. */
export function buildBreadcrumbJsonLd(
  items: { name: string; url: string }[],
): Record<string, unknown> {
  const pageUrl = items.length > 0 ? items[items.length - 1].url : "";
  return {
    "@type": "BreadcrumbList",
    ...(pageUrl ? { "@id": `${pageUrl}#breadcrumb` } : {}),
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
