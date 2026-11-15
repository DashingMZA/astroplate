import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import config from "@/config/config.json";
import {
  absoluteUrl,
  isAbsoluteUrl,
  resolveImage,
  resolveTwitterHandles,
} from "@/lib/utils/seo";

// Centralized social metadata resolver — the ONE place that turns
// frontmatter + config into the per-platform title / description / image
// (+ alt) triples every page emits. Layouts, components and pages must
// call `resolveSocialMeta()` and never re-implement a fallback chain.
//
// Fallback priorities (exact; empty strings, null and undefined all
// count as missing):
//   SEO title:       seoTitle -> title -> site title
//   OG title:        ogTitle -> seoTitle -> title -> site title
//   Twitter title:   twitterTitle -> ogTitle -> seoTitle -> title
//   Pinterest title: pinterestTitle -> ogTitle -> seoTitle -> title
//   SEO description: seoDescription -> description -> excerpt -> site default
//   OG description:  ogDescription -> seoDescription -> description -> excerpt
//   Twitter desc:    twitterDescription -> ogDescription -> seoDescription -> description
//   Pinterest desc:  pinterestDescription -> ogDescription -> seoDescription -> description
//   OG image:        ogImage -> featuredImage -> site default OG image
//   Twitter image:   twitterImage -> ogImage -> featuredImage -> site default Twitter image
//   Pinterest image: pinterestImage -> ogImage -> featuredImage -> site default OG image
//
// A platform-specific image overrides ONLY that platform. If only ogImage
// is supplied, Twitter and Pinterest inherit it. No duplicate images are
// generated.
//
// Image dimensions / MIME / file size are verified from the actual file
// with sharp at build time — never assumed from the extension, never
// hardcoded. Remote (http/https) images cannot be verified locally, so
// they carry a URL + alt but no width/height/type.

/** First non-empty string (trimmed). Empty / null / undefined = missing. */
export function pickNonEmpty(
  ...values: Array<string | null | undefined>
): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function configString(
  obj: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = obj[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

const SITE_TITLE = String(config.site.title ?? "Astroplate");
const SITE_DESCRIPTION = String(config.metadata.meta_description ?? "");
const DEFAULT_OG_IMAGE = String(config.metadata.meta_image ?? "");
const metadata = config.metadata as unknown as Record<string, unknown>;
const DEFAULT_TWITTER_IMAGE = configString(
  metadata,
  "meta_twitter_image",
  DEFAULT_OG_IMAGE,
);
const DEFAULT_ALT = String(config.metadata.meta_image_alt ?? SITE_TITLE);

export interface SocialInput {
  title?: string | null;
  seoTitle?: string | null;
  description?: string | null;
  excerpt?: string | null;
  seoDescription?: string | null;
  /** Featured / hero image. */
  image?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  ogImageAlt?: string | null;
  twitterTitle?: string | null;
  twitterDescription?: string | null;
  twitterImage?: string | null;
  twitterImageAlt?: string | null;
  pinterestTitle?: string | null;
  pinterestDescription?: string | null;
  pinterestImage?: string | null;
  pinterestImageAlt?: string | null;
}

export interface SocialImageMeta {
  /** Absolute public URL. */
  url: string;
  /** Same as url when the URL is https (OG secure_url). */
  secureUrl?: string;
  /** Verified from the actual file; absent for remote/unverifiable images. */
  width?: number;
  height?: number;
  /** Verified MIME type (e.g. image/webp); absent when unverifiable. */
  type?: string;
  alt: string;
  /** File size in bytes, when verified locally. */
  sizeBytes?: number;
  /** width / height, when verified locally. */
  ratio?: number;
  /** How this image was chosen: the platform's own field, an inherited
   * image (OG / featured), or the configured global default. */
  source: "dedicated" | "inherited" | "default";
}

export interface ResolvedSocialMeta {
  title: string;
  description: string;
  og: { title: string; description: string; image: SocialImageMeta };
  twitter: {
    card: "summary" | "summary_large_image";
    title: string;
    description: string;
    image: SocialImageMeta;
    site?: string;
    creator?: string;
  };
  pinterest: { title: string; description: string; image: SocialImageMeta };
}

const MIME_BY_FORMAT: Record<string, string> = {
  webp: "image/webp",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  avif: "image/avif",
  gif: "image/gif",
  svg: "image/svg+xml",
};

interface VerifiedImage {
  width: number;
  height: number;
  type?: string;
  sizeBytes: number;
}

// One sharp probe per local path per build (Astro renders pages in
// parallel, so the promise itself is cached, not just the result).
const verifiedImageCache = new Map<string, Promise<VerifiedImage | null>>();

async function verifyLocalImage(
  siteRelativePath: string,
): Promise<VerifiedImage | null> {
  const cached = verifiedImageCache.get(siteRelativePath);
  if (cached) {
    return cached;
  }
  const probe = (async (): Promise<VerifiedImage | null> => {
    const rel = siteRelativePath.replace(/^\/+/, "");
    const file = path.join(process.cwd(), "public", rel);
    try {
      const [meta, stat] = await Promise.all([
        sharp(file).metadata(),
        fs.promises.stat(file),
      ]);
      if (!meta.width || !meta.height) {
        return null;
      }
      return {
        width: meta.width,
        height: meta.height,
        type: meta.format ? MIME_BY_FORMAT[meta.format] : undefined,
        sizeBytes: stat.size,
      };
    } catch {
      console.warn(
        `[social] could not verify image dimensions for ${siteRelativePath} ` +
          `(file missing or unreadable) — width/height/type omitted, ` +
          `never invented.`,
      );
      return null;
    }
  })();
  verifiedImageCache.set(siteRelativePath, probe);
  return probe;
}

/**
 * Resolve one raw image value to absolute-URL metadata. `raw` may be a
 * site-relative path or an absolute URL; when it is missing the
 * `fallbackPath` (a configured global default) is used instead.
 */
async function resolveImageMeta(
  raw: string | undefined,
  fallbackPath: string,
  alt: string,
  source: SocialImageMeta["source"],
): Promise<SocialImageMeta> {
  const sourcePath = raw ?? fallbackPath;
  const url = resolveImage(sourcePath);
  const meta: SocialImageMeta = { url, alt, source };
  if (url.startsWith("https://")) {
    meta.secureUrl = url;
  }
  // Only site-relative paths can be verified against public/; remote
  // URLs keep URL + alt and deliberately carry no dimensions or MIME.
  if (!isAbsoluteUrl(sourcePath)) {
    const verified = await verifyLocalImage(sourcePath);
    if (verified) {
      meta.width = verified.width;
      meta.height = verified.height;
      meta.type = verified.type;
      meta.sizeBytes = verified.sizeBytes;
      meta.ratio = verified.width / verified.height;
    }
  }
  return meta;
}

/** Alt text for a resolved image: platform alt -> OG alt -> page title -> site default alt. */
function altFor(
  platformAlt: string | null | undefined,
  ogAlt: string | null | undefined,
  title: string,
): string {
  return pickNonEmpty(platformAlt, ogAlt, title) ?? DEFAULT_ALT;
}

export async function resolveSocialMeta(
  input: SocialInput,
): Promise<ResolvedSocialMeta> {
  const seoTitle = pickNonEmpty(input.seoTitle);
  const title = pickNonEmpty(seoTitle, input.title) ?? SITE_TITLE;
  const seoDescription = pickNonEmpty(input.seoDescription);
  const description =
    pickNonEmpty(seoDescription, input.description, input.excerpt) ??
    SITE_DESCRIPTION;

  const ogTitle =
    pickNonEmpty(input.ogTitle, seoTitle, input.title) ?? SITE_TITLE;
  const ogDescription =
    pickNonEmpty(
      input.ogDescription,
      seoDescription,
      input.description,
      input.excerpt,
    ) ?? SITE_DESCRIPTION;
  const twitterTitle =
    pickNonEmpty(input.twitterTitle, input.ogTitle, seoTitle, input.title) ??
    SITE_TITLE;
  const twitterDescription =
    pickNonEmpty(
      input.twitterDescription,
      input.ogDescription,
      seoDescription,
      input.description,
      input.excerpt,
    ) ?? SITE_DESCRIPTION;
  const pinterestTitle =
    pickNonEmpty(input.pinterestTitle, input.ogTitle, seoTitle, input.title) ??
    SITE_TITLE;
  const pinterestDescription =
    pickNonEmpty(
      input.pinterestDescription,
      input.ogDescription,
      seoDescription,
      input.description,
      input.excerpt,
    ) ?? SITE_DESCRIPTION;

  const featured = pickNonEmpty(input.image);
  const ogRaw = pickNonEmpty(input.ogImage, featured);
  const twitterRaw = pickNonEmpty(input.twitterImage, input.ogImage, featured);
  const pinterestRaw = pickNonEmpty(
    input.pinterestImage,
    input.ogImage,
    featured,
  );

  const ogAlt = pickNonEmpty(input.ogImageAlt, title) ?? DEFAULT_ALT;
  const twitterAlt = altFor(input.twitterImageAlt, input.ogImageAlt, title);
  const pinterestAlt = altFor(input.pinterestImageAlt, input.ogImageAlt, title);

  const [ogImage, twitterImage, pinterestImage] = await Promise.all([
    resolveImageMeta(
      ogRaw,
      DEFAULT_OG_IMAGE,
      ogAlt,
      pickNonEmpty(input.ogImage)
        ? "dedicated"
        : ogRaw
          ? "inherited"
          : "default",
    ),
    resolveImageMeta(
      twitterRaw,
      DEFAULT_TWITTER_IMAGE,
      twitterAlt,
      pickNonEmpty(input.twitterImage)
        ? "dedicated"
        : twitterRaw
          ? "inherited"
          : "default",
    ),
    resolveImageMeta(
      pinterestRaw,
      DEFAULT_OG_IMAGE,
      pinterestAlt,
      pickNonEmpty(input.pinterestImage)
        ? "dedicated"
        : pinterestRaw
          ? "inherited"
          : "default",
    ),
  ]);

  const handles = resolveTwitterHandles();

  return {
    title,
    description,
    og: { title: ogTitle, description: ogDescription, image: ogImage },
    twitter: {
      // An image always resolves (at minimum the configured default),
      // so the large card always applies.
      card: "summary_large_image",
      title: twitterTitle,
      description: twitterDescription,
      image: twitterImage,
      site: handles.site,
      creator: handles.creator,
    },
    pinterest: {
      title: pinterestTitle,
      description: pinterestDescription,
      image: pinterestImage,
    },
  };
}

export interface SocialMetaIssue {
  level: "error" | "warning";
  code: string;
  message: string;
}

/**
 * Validate resolved metadata. Errors are facts that must be fixed
 * (missing/empty/invalid); warnings are quality signals (unverified
 * dimensions, off-spec aspect ratios, oversized files). Used by the
 * dist-HTML validator and the unit tests.
 */
export function validateResolvedMeta(
  meta: ResolvedSocialMeta,
): SocialMetaIssue[] {
  const issues: SocialMetaIssue[] = [];
  const checkImage = (
    label: string,
    image: SocialImageMeta,
    ratioRange: [number, number] | null,
    ratioLabel: string,
  ) => {
    if (!image.url || !/^https?:\/\//i.test(image.url)) {
      issues.push({
        level: "error",
        code: "invalid-image-url",
        message: `${label} image URL is not an absolute http(s) URL: ${image.url}`,
      });
    }
    if (!image.alt?.trim()) {
      issues.push({
        level: "error",
        code: "missing-image-alt",
        message: `${label} image has no alt text.`,
      });
    }
    if (image.width === undefined || image.height === undefined) {
      issues.push({
        level: "warning",
        code: "unverified-image-dimensions",
        message:
          `${label} image dimensions could not be verified from the file ` +
          `(${image.url}) — width/height omitted rather than invented.`,
      });
    } else if (ratioRange && image.ratio !== undefined) {
      if (image.ratio < ratioRange[0] || image.ratio > ratioRange[1]) {
        issues.push({
          level: "warning",
          code: "image-aspect-ratio",
          message:
            `${label} image aspect ratio is ${image.ratio.toFixed(2)} ` +
            `(recommended ${ratioLabel}); the image is still valid, ` +
            `platforms may crop it.`,
        });
      }
    }
    if (!image.type) {
      issues.push({
        level: "warning",
        code: "unverified-image-type",
        message: `${label} image MIME type could not be verified (${image.url}).`,
      });
    }
    if (image.sizeBytes !== undefined && image.sizeBytes > 300 * 1024) {
      issues.push({
        level: "warning",
        code: "image-file-size",
        message:
          `${label} image is ${(image.sizeBytes / 1024).toFixed(0)} KB, ` +
          `over the 300 KB practical target for social cards.`,
      });
    }
  };

  if (!meta.title?.trim()) {
    issues.push({
      level: "error",
      code: "missing-title",
      message: "Page title is empty.",
    });
  }
  if (!meta.description?.trim()) {
    issues.push({
      level: "error",
      code: "missing-description",
      message: "Page description is empty.",
    });
  }
  checkImage("OG", meta.og.image, [1.85, 1.95], "1.91:1");
  checkImage("Twitter", meta.twitter.image, [1.7, 2.0], "16:9");
  // Pinterest inherits the OG image by design (no dedicated vertical
  // Pin image is configured), so its ratio is only checked when a
  // dedicated Pinterest image was actually supplied.
  checkImage(
    "Pinterest",
    meta.pinterest.image,
    meta.pinterest.image.source === "dedicated" ? [0.6, 0.72] : null,
    "2:3",
  );
  return issues;
}

/** Canonical URL for a social image (absolute URL, unchanged). Kept for call sites that only need the URL. */
export function socialImageUrl(image: SocialImageMeta): string {
  return absoluteUrl(image.url);
}
