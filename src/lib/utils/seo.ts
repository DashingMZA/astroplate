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
 * Escape a string for safe use inside `new RegExp(...)`.
 * Prevents user input such as `(`, `[`, `*` or `+` from throwing a
 * SyntaxError (or changing the match semantics) in search.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
