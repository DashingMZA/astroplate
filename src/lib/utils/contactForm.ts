// Contact-form endpoint resolution (config strategy).
//
// The form has no backend of its own: it POSTs to an external form
// provider (Formspree, Getform, Netlify Forms, …) whose endpoint is
// configured in `src/config/config.json` under `contact_form.action`
// (legacy fallback: `params.contact_form_action`). An empty value or the
// template placeholder `"#"` means the form is NOT configured — the page
// renders a visibly disabled form with setup instructions and never
// fakes a successful submission. No endpoint is ever invented here.
//
// This module is pure (no Astro / DOM imports) so node:test can exercise
// both states directly; contact.astro renders from its result.
export interface ContactFormConfig {
  contact_form?: {
    action?: string | null;
    provider?: string | null;
  } | null;
  params?: {
    contact_form_action?: string | null;
  } | null;
}

export interface ResolvedContactForm {
  /** True only when a real endpoint string is configured. */
  configured: boolean;
  /** The endpoint to submit to, or null when unconfigured. */
  action: string | null;
  /** Provider name from config (documentation only, may be null). */
  provider: string | null;
}

/** Values that mean "no endpoint configured". */
const UNCONFIGURED_VALUES = new Set(["", "#"]);

export function resolveContactFormAction(
  config: ContactFormConfig,
): ResolvedContactForm {
  const raw = (
    config.contact_form?.action ??
    config.params?.contact_form_action ??
    ""
  ).trim();
  const provider = config.contact_form?.provider?.trim() || null;
  if (UNCONFIGURED_VALUES.has(raw)) {
    return { configured: false, action: null, provider };
  }
  return { configured: true, action: raw, provider };
}
