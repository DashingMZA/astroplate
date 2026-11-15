// Domain-verification meta tags (Pinterest, Facebook, Google, Bing,
// Yandex, Baidu, Naver, Ahrefs). The codes live in config.json
// (`verification`), one per provider, empty when unconfigured.
// Only the home page renders them (Base gets a `verification` prop);
// a provider with no code emits no tag — never a placeholder code.

/** Provider key (config.json) -> the meta `name` the provider checks. */
export const VERIFICATION_META_NAMES: Record<string, string> = {
  pinterest: "p:domain_verify",
  facebook: "facebook-domain-verification",
  google: "google-site-verification",
  bing: "msvalidate.01",
  yandex: "yandex-verification",
  baidu: "baidu-site-verification",
  naver: "naver-site-verification",
  ahrefs: "ahrefs-site-verification",
};

/** The meta tags to emit for the configured codes, in provider order. */
export function verificationMetaTags(
  values: Record<string, unknown> | null | undefined,
): { name: string; content: string }[] {
  if (!values) {
    return [];
  }
  const tags: { name: string; content: string }[] = [];
  for (const [key, name] of Object.entries(VERIFICATION_META_NAMES)) {
    const value = values[key];
    if (typeof value === "string" && value.trim() !== "") {
      tags.push({ name, content: value.trim() });
    }
  }
  return tags;
}
