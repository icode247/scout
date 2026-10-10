/**
 * The one rule every Scout surface applies to self-identification answers
 * before they are stored locally or sent to FastApply (privacy.ts has the
 * field list and the contract):
 *
 * - "granted"    → the answers go as typed, with `sensitiveDataConsent: "granted"`.
 * - "declined"   → every one of the eleven fields becomes "Prefer not to say",
 *                  with `sensitiveDataConsent: "declined"`. FastApply does the
 *                  same on its side; doing it here keeps Scout's copy truthful.
 * - not answered → neither the consent key nor any of the eleven answers is
 *                  sent. FastApply refuses an answer without consent (400), and
 *                  an answer it stored before the question existed is left as
 *                  it is rather than re-sent or cleared.
 */
import {
  SELF_ID_DECLINE_VALUE,
  SENSITIVE_CONSENT_VALUES,
  SENSITIVE_SELF_ID_FIELDS,
  type SensitiveConsentValue,
  type SensitiveSelfIdField,
} from "./privacy";

export function normalizeSensitiveConsent(value: unknown): SensitiveConsentValue | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return (SENSITIVE_CONSENT_VALUES as readonly string[]).includes(trimmed) ? (trimmed as SensitiveConsentValue) : null;
}

export function isSelfIdField(key: string): key is SensitiveSelfIdField {
  return (SENSITIVE_SELF_ID_FIELDS as readonly string[]).includes(key);
}

/** The answers with the consent rule applied. Returns a new object; `answers` is not mutated. */
export function applySelfIdConsent<T extends Record<string, any>>(
  answers: T,
  consent: unknown = answers.sensitiveDataConsent,
): T {
  const decision = normalizeSensitiveConsent(consent);
  const out: Record<string, any> = { ...answers };
  if (decision === "granted") {
    out.sensitiveDataConsent = "granted";
    return out as T;
  }
  if (decision === "declined") {
    out.sensitiveDataConsent = "declined";
    for (const key of SENSITIVE_SELF_ID_FIELDS) out[key] = SELF_ID_DECLINE_VALUE;
    return out as T;
  }
  delete out.sensitiveDataConsent;
  for (const key of SENSITIVE_SELF_ID_FIELDS) delete out[key];
  return out as T;
}

/**
 * Reconciles a saved form against what the job profile already holds, for the
 * profiles API:
 *
 * - a decision sent with the form is applied and stamped on
 *   `sensitiveDataConsentAt`: the stored stamp stays when the decision is
 *   unchanged, a new or changed decision is stamped now;
 * - a form with no decision leaves the stored decision, its stamp and the
 *   stored self-identification answers exactly as they were, so an older
 *   client or a partial save never withdraws consent or clears answers;
 * - with no decision anywhere, answers on file from before the question
 *   existed stay on file (FastApply keeps its copy the same way) and nothing
 *   the form sent for them is taken, because the member could not edit them.
 *
 * The stamp is Scout's own record of when its member decided. FastApply keeps
 * its own and refuses one from a client, so `fastApplyProfilePayload` never
 * forwards it, and a client cannot set it here either.
 */
export function reconcileSelfIdConsent<T extends Record<string, any>>(
  incoming: T,
  existing: Record<string, any> | null | undefined,
  now: () => string = () => new Date().toISOString(),
): T {
  const stored = existing || {};
  const sent = normalizeSensitiveConsent(incoming.sensitiveDataConsent);
  const kept = normalizeSensitiveConsent(stored.sensitiveDataConsent);
  const decision = sent ?? kept;
  const merged: Record<string, any> = { ...incoming };
  delete merged.sensitiveDataConsentAt;

  if (!decision) {
    delete merged.sensitiveDataConsent;
    for (const key of SENSITIVE_SELF_ID_FIELDS) {
      if (stored[key] !== undefined) merged[key] = stored[key];
      else delete merged[key];
    }
    return merged as T;
  }

  if (!sent) {
    for (const key of SENSITIVE_SELF_ID_FIELDS) {
      if (merged[key] === undefined && stored[key] !== undefined) merged[key] = stored[key];
    }
  }
  const out: Record<string, any> = applySelfIdConsent(merged, decision);
  out.sensitiveDataConsentAt =
    decision === kept && typeof stored.sensitiveDataConsentAt === "string" ? stored.sensitiveDataConsentAt : now();
  return out as T;
}
