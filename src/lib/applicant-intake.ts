/**
 * The Human Assistant intake questionnaire (/intake): a public link operations can
 * send any client, signed in or not. It asks only for the answers a resume does not
 * reliably carry — the resume parser supplies name, email, experience, education and
 * skills. Address and phone are asked directly: resumes often leave them out, and
 * application forms require them. Answers are stored under the applicant-profile keys so an
 * assistant can copy them straight into the client's job profile.
 */
export const INTAKE_KEYS = [
  "whatsappPhone", "phoneCountryCode", "phoneNumber",
  "streetAddress", "addressLine2", "currentCity", "state", "zipcode", "country",
  "middleName", "nationality", "timezone",
  "workAuthorizationCountries", "workAuthorization", "requiresSponsorship", "securityClearance",
  "desiredSalary", "desiredSalaryCurrency", "desiredSalaryNegotiable", "currentSalary", "currentSalaryCurrency",
  "noticePeriod", "remotePreference", "willingToRelocate",
  "twitterURL", "additionalLinks", "references",
  "coverLetter", "howDidYouHearAboutUs",
  "dateOfBirth", "gender", "ethnicity", "race", "veteranStatus", "disabilityStatus",
] as const;

export const INTAKE_LABELS: Record<(typeof INTAKE_KEYS)[number], string> = {
  whatsappPhone: "WhatsApp number", phoneCountryCode: "Phone country code", phoneNumber: "Phone number",
  streetAddress: "Address line 1", addressLine2: "Address line 2", currentCity: "Town / city", state: "County / state",
  zipcode: "Post code", country: "Country of residence",
  middleName: "Middle name", nationality: "Nationality", timezone: "Timezone",
  workAuthorizationCountries: "Authorized to work in", workAuthorization: "Work authorization", requiresSponsorship: "Requires sponsorship", securityClearance: "Security clearance",
  desiredSalary: "Expected annual salary", desiredSalaryCurrency: "Expected salary currency", desiredSalaryNegotiable: "Salary negotiable",
  currentSalary: "Current annual salary", currentSalaryCurrency: "Current salary currency",
  noticePeriod: "Notice period", remotePreference: "Work arrangement", willingToRelocate: "Willing to relocate",
  twitterURL: "X / Twitter", additionalLinks: "Other links", references: "References",
  coverLetter: "Cover letter template", howDidYouHearAboutUs: "\"How did you hear about us?\" answer",
  dateOfBirth: "Date of birth", gender: "Gender", ethnicity: "Hispanic or Latino", race: "Race",
  veteranStatus: "Veteran status", disabilityStatus: "Disability status",
};

/** Below Vercel's 4.5 MB request cap, which the resume shares with the answers. */
export const INTAKE_MAX_RESUME_BYTES = 4 * 1024 * 1024;

const LONG_TEXT = new Set(["coverLetter"]);

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** One link per line, as "Label | URL" or a bare URL (labelled by its host). */
function parseLinks(value: string) {
  const links: Record<string, string> = {};
  for (const line of value.split("\n").slice(0, 20)) {
    const parts = line.split("|").map((part) => part.trim());
    const url = (parts.length > 1 ? parts.slice(1).join("|") : parts[0]).trim().slice(0, 2_000);
    if (!url) continue;
    let label = parts.length > 1 ? parts[0] : "";
    if (!label) { try { label = new URL(/^https?:\/\//i.test(url) ? url : "https://" + url).hostname.replace(/^www\./, ""); } catch { label = "Link"; } }
    links[label.slice(0, 100)] = url;
  }
  return links;
}

/** One reference per line, as "Name | Email | Phone | Relationship" — the /profiles editor's shape. */
function parseReferences(value: string) {
  return value.split("\n").slice(0, 20).map((line) => {
    const [name = "", email = "", phone = "", type = ""] = line.split("|").map((part) => part.trim());
    return { name: name.slice(0, 200), email: email.slice(0, 320), phone: phone.slice(0, 80), type: type.slice(0, 80) };
  }).filter((reference) => reference.name);
}

/** Same rule as onboarding: digits with an optional +, spaces, brackets or dashes. */
export function validWhatsappPhone(value: string) {
  return /^\+?[0-9 ()-]{7,24}$/.test(value);
}

/** Keeps only questionnaire answers, trimmed and typed as the applicant profile stores them. Blank answers are dropped. */
export function cleanIntakeAnswers(raw: Record<string, unknown>) {
  const answers: Record<string, any> = {};
  for (const key of INTAKE_KEYS) {
    const value = raw[key];
    if (key === "desiredSalaryNegotiable") {
      if (value === true || value === "true" || value === "on") answers[key] = true;
      continue;
    }
    const cleaned = text(value, LONG_TEXT.has(key) ? 10_000 : 2_000);
    if (!cleaned) continue;
    if (key === "workAuthorizationCountries") {
      // One country per line; duplicates collapse.
      const countries = [...new Set(cleaned.split("\n").map((country) => country.trim().slice(0, 80)).filter(Boolean))].slice(0, 50);
      if (countries.length) answers[key] = countries;
    }
    else if (key === "additionalLinks") { const links = parseLinks(cleaned); if (Object.keys(links).length) answers[key] = links; }
    else if (key === "references") { const references = parseReferences(cleaned); if (references.length) answers[key] = references; }
    else answers[key] = cleaned;
  }
  return answers;
}

/** Renders a stored answer as one line of text for the operations queue. */
export function formatIntakeAnswer(value: unknown): string {
  if (value === true) return "Yes";
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value.join(", ");
  if (Array.isArray(value)) return value.map((item: any) => [item.name, item.type, item.email, item.phone].filter(Boolean).join(" · ")).join("\n");
  if (value && typeof value === "object") return Object.entries(value).map(([label, url]) => `${label}: ${url}`).join("\n");
  return String(value ?? "");
}
