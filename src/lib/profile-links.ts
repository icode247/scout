/**
 * Profile links, one field per network, and what each may hold (FastApply's profile-links.util,
 * ported 2026-10-10). FastApply refuses the WHOLE profile save when, say, the GitHub field holds a
 * LinkedIn URL, so Scout checks the same rule: the editor says what is wrong, and the payload
 * leaves a link FastApply would refuse out rather than failing the sync.
 *
 * Scheme-less values ("linkedin.com/in/x") are accepted and sent as https, as FastApply does.
 */

export type ProfileLinkKind = "linkedin" | "github" | "twitter" | "website";

/** Profile field → network. */
export const PROFILE_LINK_FIELDS = {
  linkedinURL: "linkedin",
  githubURL: "github",
  twitterURL: "twitter",
  website: "website",
} as const satisfies Record<string, ProfileLinkKind>;

const HOSTS: Readonly<Record<Exclude<ProfileLinkKind, "website">, RegExp>> = {
  linkedin: /(^|\.)linkedin\.com$/i,
  github: /(^|\.)github\.com$/i,
  twitter: /(^|\.)(twitter|x)\.com$/i,
};

const LABELS: Readonly<Record<ProfileLinkKind, string>> = {
  linkedin: "LinkedIn",
  github: "GitHub",
  twitter: "X / Twitter",
  website: "Website",
};

/** Something that reads as a host: "linkedin.com/in/x", "www.github.com/x". */
const HOST_SHAPED = /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#]|$)/i;

/** The link as an http(s) URL, or null when the value is not a URL at all ("N/A", a bare handle). */
export function normalizeProfileLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : HOST_SHAPED.test(raw) ? `https://${raw}` : null;
  if (!withScheme) return null;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    // As pasted (plus the scheme): URL.toString() would append "/" to a bare host.
    return withScheme;
  } catch {
    return null;
  }
}

/** The network a URL belongs to, by host; "website" for any other URL. */
export function classifyProfileLink(value: unknown): ProfileLinkKind | null {
  const url = normalizeProfileLink(value);
  if (!url) return null;
  const host = new URL(url).hostname;
  for (const kind of Object.keys(HOSTS) as Array<keyof typeof HOSTS>) {
    if (HOSTS[kind].test(host)) return kind;
  }
  return "website";
}

/** Empty is fine (the field is optional); a website takes any URL, a network only its own. */
export function isValidProfileLink(kind: ProfileLinkKind, value: unknown): boolean {
  if (value == null || (typeof value === "string" && value.trim() === "")) return true;
  const actual = classifyProfileLink(value);
  if (!actual) return false;
  return kind === "website" ? true : actual === kind;
}

/** What the editor shows for a link FastApply would refuse; null when it is fine. */
export function profileLinkError(kind: ProfileLinkKind, value: unknown): string | null {
  if (isValidProfileLink(kind, value)) return null;
  const actual = classifyProfileLink(value);
  if (!actual) return `${LABELS[kind]} must be a link, for example https://…`;
  if (kind === "website") return "Website must be a link.";
  const expected = { linkedin: "linkedin.com", github: "github.com", twitter: "x.com or twitter.com" }[kind];
  return actual === "website"
    ? `${LABELS[kind]} must be a ${expected} link.`
    : `${LABELS[kind]} must be a ${expected} link. This one is a ${LABELS[actual]} link.`;
}

/** The link to send: normalised to https when FastApply would accept it, otherwise left out. */
export function sendableProfileLink(kind: ProfileLinkKind, value: unknown): string | undefined {
  if (!isValidProfileLink(kind, value)) return undefined;
  return normalizeProfileLink(value) ?? undefined;
}
