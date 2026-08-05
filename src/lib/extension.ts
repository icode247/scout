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

  const id = import.meta.env.PUBLIC_CHROME_EXTENSION_ID?.trim();
  if (!id || id === PLACEHOLDER_ID) return null;
  return `https://chromewebstore.google.com/detail/${id}`;
}
