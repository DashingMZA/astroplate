import config from "@/config/config.json";

// Pure, side-effect-free SEO URL helpers.
// All URLs are built from `config.site.base_url` / `base_path` /
// `trailing_slash` so canonical, og:url and share links agree.

const baseUrl: string = String(config.site.base_url ?? "").replace(/\/+$/, "");
const basePathRaw: string = String(config.site.base_path ?? "/");
const basePath: string =
  basePathRaw === "/" ? "" : `/${basePathRaw.replace(/^\/+|\/+$/g, "")}`;
const trailingSlash: boolean = Boolean(config.site.trailing_slash);

/** True for `http://…`, `https://…` and protocol-relative `//…` URLs. */
export function isAbsoluteUrl(url: string): boolean {
  return /^(?:https?:)?\/\//i.test(url);
}

/**
 * Join a path onto the configured base URL, collapsing duplicate slashes.
 * Already-absolute (http/https/protocol-relative) input is returned
 * unchanged — the base URL is never prepended to it.
 */
export function absoluteUrl(pathOrUrl: string): string {
  if (!pathOrUrl) {
    return baseUrl || "/";
  }
  if (isAbsoluteUrl(pathOrUrl)) {
    return pathOrUrl;
  }
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${baseUrl}${basePath}${path}`.replace(/([^:])\/{2,}/g, "$1/");
}

/** Resolve an image value to an absolute URL (falls back to the default OG image). */
export function resolveImage(image?: string | null): string {
  const raw = image ? image : config.metadata.meta_image;
  return absoluteUrl(raw);
}

/**
 * Canonical URL for a site pathname, honouring `base_path` and
 * `trailing_slash`. A pathname that already starts with `base_path`
 * is not double-prefixed.
 */
export function canonicalFor(pathname: string): string {
  let path = pathname ? pathname : "/";
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  // Strip a leading base_path so it is not added twice.
  if (basePath && (path === basePath || path.startsWith(`${basePath}/`))) {
    path = path.slice(basePath.length) || "/";
  }
  if (trailingSlash) {
    if (!path.endsWith("/")) {
      path = `${path}/`;
    }
  } else if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  return `${baseUrl}${basePath}${path}`.replace(/([^:])\/{2,}/g, "$1/");
}

/**
 * Normalise an absolute URL's trailing slash to the configured
 * `trailing_slash` setting. Used for explicit `canonical` frontmatter
 * values, which must not disagree with the canonicals `canonicalFor()`
 * produces. Unparseable input is returned unchanged.
 */
export function normalizeUrlTrailingSlash(url: string): string {
  try {
    const parsed = new URL(url);
    let pathname = parsed.pathname;
    if (trailingSlash) {
      if (!pathname.endsWith("/")) {
        pathname = `${pathname}/`;
      }
    } else if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    parsed.pathname = pathname;
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Canonical URL for a page. An explicit `canonical` frontmatter value wins:
 * absolute URLs are used (trailing-slash normalised), site-relative paths
 * are resolved through `canonicalFor()`. Otherwise the page's own public
 * path is canonicalised.
 */
export function buildCanonical(
  explicitCanonical: string | undefined | null,
  pathname: string,
): string {
  if (explicitCanonical) {
    return isAbsoluteUrl(explicitCanonical)
      ? normalizeUrlTrailingSlash(explicitCanonical)
      : canonicalFor(explicitCanonical);
  }
  return canonicalFor(pathname);
}

/** og:title priority: og_title > meta_title > title > site title. */
export function resolveOgTitle(input: {
  og_title?: string | null;
  meta_title?: string | null;
  title?: string | null;
}): string {
  return input.og_title || input.meta_title || input.title || config.site.title;
}

/** <title> priority: meta_title > title > site title. (og_title is NOT a title fallback.) */
export function resolvePageTitle(input: {
  meta_title?: string | null;
  title?: string | null;
}): string {
  return input.meta_title || input.title || config.site.title;
}

/** meta description priority: description > excerpt > site default. */
export function resolvePageDescription(input: {
  description?: string | null;
  excerpt?: string | null;
}): string {
  return input.description || input.excerpt || config.metadata.meta_description;
}

/** og:description priority: og_description > description > excerpt > site default. */
export function resolveOgDescription(input: {
  og_description?: string | null;
  description?: string | null;
  excerpt?: string | null;
}): string {
  return (
    input.og_description ||
    input.description ||
    input.excerpt ||
    config.metadata.meta_description
  );
}

/**
 * OG image priority: og_image > image > site default. Returns the absolute
 * URL plus whether the image came from the page (true) or the site default
 * (false) — the alt text follows the image source.
 */
export function resolveOgImage(input: {
  og_image?: string | null;
  image?: string | null;
}): { url: string; isPageImage: boolean } {
  const pageImage = input.og_image || input.image;
  if (pageImage) {
    return { url: resolveImage(pageImage), isPageImage: true };
  }
  return { url: resolveImage(undefined), isPageImage: false };
}

/**
 * Twitter handles from config (`social.twitter_site` / `twitter_creator`).
 * Empty/missing values return undefined so no tag is emitted — handles are
 * never invented.
 */
export function resolveTwitterHandles(): {
  site?: string;
  creator?: string;
} {
  const social = (config as { social?: Record<string, unknown> }).social;
  const pick = (key: string): string | undefined => {
    const value = social?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };
  return { site: pick("twitter_site"), creator: pick("twitter_creator") };
}

/**
 * Escape a string for safe use inside `new RegExp(...)`.
 * Prevents user input such as `(`, `[`, `*` or `+` from throwing a
 * SyntaxError (or changing the match semantics) in search.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
