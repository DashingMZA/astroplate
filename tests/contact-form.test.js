// Wave C tests — contact-form endpoint resolution.
// `src/lib/utils/contactForm.ts` is pure (no Astro/DOM imports), so
// node:test exercises both states directly. The shipped config is
// asserted unconfigured: no endpoint is ever invented.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveContactFormAction } from "../src/lib/utils/contactForm.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("configured endpoint resolves as configured, with provider", () => {
  const result = resolveContactFormAction({
    contact_form: {
      action: "https://formspree.io/f/abc123",
      provider: "Formspree",
    },
  });
  assert.deepEqual(result, {
    configured: true,
    action: "https://formspree.io/f/abc123",
    provider: "Formspree",
  });
});

test("empty action is unconfigured", () => {
  assert.deepEqual(
    resolveContactFormAction({ contact_form: { action: "", provider: "" } }),
    { configured: false, action: null, provider: null },
  );
});

test("'#' placeholder is unconfigured", () => {
  assert.deepEqual(
    resolveContactFormAction({ contact_form: { action: "#" } }),
    { configured: false, action: null, provider: null },
  );
});

test("whitespace-only action is unconfigured; padded URL is trimmed", () => {
  assert.equal(
    resolveContactFormAction({ contact_form: { action: "   " } }).configured,
    false,
  );
  assert.equal(
    resolveContactFormAction({
      contact_form: { action: "  https://getform.io/f/x  " },
    }).action,
    "https://getform.io/f/x",
  );
});

test("legacy params.contact_form_action is the fallback", () => {
  const result = resolveContactFormAction({
    params: { contact_form_action: "https://formspree.io/f/legacy" },
  });
  assert.deepEqual(result, {
    configured: true,
    action: "https://formspree.io/f/legacy",
    provider: null,
  });
  // Legacy "#" is unconfigured too.
  assert.equal(
    resolveContactFormAction({ params: { contact_form_action: "#" } })
      .configured,
    false,
  );
});

test("contact_form.action wins over the legacy fallback", () => {
  const result = resolveContactFormAction({
    contact_form: { action: "https://getform.io/f/new", provider: "Getform" },
    params: { contact_form_action: "https://formspree.io/f/old" },
  });
  assert.equal(result.action, "https://getform.io/f/new");
  assert.equal(result.provider, "Getform");
});

test("missing contact_form/params sections are unconfigured, not a crash", () => {
  assert.deepEqual(resolveContactFormAction({}), {
    configured: false,
    action: null,
    provider: null,
  });
  assert.deepEqual(
    resolveContactFormAction({ contact_form: null, params: null }),
    { configured: false, action: null, provider: null },
  );
});

test("shipped config.json is unconfigured (no invented endpoint)", () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "src/config/config.json"), "utf8"),
  );
  const result = resolveContactFormAction(config);
  assert.equal(result.configured, false);
  assert.equal(result.action, null);
});
