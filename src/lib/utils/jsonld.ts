// JSON-LD builders — pure functions (no config access) so tests can import
// them directly. Callers pass already-resolved absolute URLs and resolved
// authors; nothing here invents publisher, author or URL data.
//
// Base.astro merges the site-wide WebSite + Organization blocks with the
// page-specific blocks into ONE `@graph` script tag per page, so there is
// exactly one JSON-LD block per page and no duplicate Article/BlogPosting.

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
  /** Publisher block from configured site data (name/type/logo/url). */
  publisher: Record<string, unknown> | null;
  /** Absolute canonical URL of the post (custom-slug URL). */
  url: string;
}

export interface PublisherInput {
  name?: string | null;
  type?: string | null;
  logo?: string | null;
  url?: string | null;
}

const toIso = (value?: string | Date | null): string | undefined => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
};

function personObject(author: JsonLdPersonInput): Record<string, unknown> {
  return {
    "@type": "Person",
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

/** BlogPosting for a blog post page. `url` + `mainEntityOfPage` are the canonical custom-slug URL. */
export function buildBlogPostingJsonLd(
  input: BlogPostingInput,
  siteUrl: string,
): Record<string, unknown> {
  const images = input.image
    ? Array.isArray(input.image)
      ? input.image.filter(Boolean)
      : [input.image]
    : [];
  return {
    "@type": "BlogPosting",
    headline: input.headline,
    ...(input.description ? { description: input.description } : {}),
    ...(images.length > 0 ? { image: images } : {}),
    ...(toIso(input.datePublished)
      ? { datePublished: toIso(input.datePublished) }
      : {}),
    ...(toIso(input.dateModified)
      ? { dateModified: toIso(input.dateModified) }
      : {}),
    author: input.authors.map(personObject),
    ...(input.publisher
      ? {
          publisher: publisherObject(
            input.publisher as PublisherInput,
            siteUrl,
          ),
        }
      : {}),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": input.url,
    },
    url: input.url,
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

/** Person block for an author page. */
export function buildPersonJsonLd(input: {
  name: string;
  url: string;
  image?: string | null;
  description?: string | null;
}): Record<string, unknown> {
  return {
    "@type": "Person",
    name: input.name,
    url: input.url,
    ...(input.image ? { image: input.image } : {}),
    ...(input.description ? { description: input.description } : {}),
  };
}

/** BreadcrumbList for a page's breadcrumb trail. */
export function buildBreadcrumbJsonLd(
  items: { name: string; url: string }[],
): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
