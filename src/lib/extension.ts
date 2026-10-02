/** Placeholder value shipped in .env.example; treat it as "not configured". */
const PLACEHOLDER_ID = "abcdefghijklmnopqrstuvwxyzabcdef";

/**
 * Chrome Web Store URL for the Scout extension.
 *
 * Prefers an explicit PUBLIC_CHROME_EXTENSION_URL, but falls back to building
 * the store link from PUBLIC_CHROME_EXTENSION_ID — which is already configured
 * for the extension connect flow. Without this fallback the app advertised the
 * extension as "coming soon" even though it was live.
 */
export function chromeExtensionUrl(): string | null {
  const explicit = import.meta.env.PUBLIC_CHROME_EXTENSION_URL?.trim();
  if (explicit) return explicit;

  const [id] = chromeExtensionIds();
  return id ? `https://chromewebstore.google.com/detail/${id}` : null;
}

/**
 * Extension ids allowed to connect. PUBLIC_CHROME_EXTENSION_ID may list several,
 * comma-separated, with the Web Store id first (it builds the store link); an
 * unpacked test build gets a different id and needs its own entry.
 */
export function chromeExtensionIds(): string[] {
  return (import.meta.env.PUBLIC_CHROME_EXTENSION_ID || "")
    .split(",").map((id) => id.trim().toLowerCase())
    .filter((id) => /^[a-p]{32}$/.test(id) && id !== PLACEHOLDER_ID);
}
