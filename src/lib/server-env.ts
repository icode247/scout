/**
 * Reads a server-side environment variable at runtime.
 *
 * `import.meta.env[key]` cannot be used with a computed key. Vite substitutes
 * only *literal* member accesses (`import.meta.env.DODO_API_KEY`) at build time,
 * so a dynamic lookup compiles down to an index into a frozen build-time object
 * that the value was never copied into. That is why every plan reported "not
 * available yet" in production no matter what the Vercel settings held: the ids
 * are never referenced literally anywhere, so they never make it into the bundle.
 *
 * process.env is the runtime source on the server. `astro dev` loads .env into
 * import.meta.env rather than process.env, so that stays as the fallback.
 *
 * Reading at runtime also keeps secrets out of the build output — a literal
 * reference inlines the value into the deployed bundle, which means rotating a
 * key silently does nothing until the next deploy.
 */
export function serverEnv(key: string): string | undefined {
  const fromProcess = typeof process !== "undefined" ? process.env?.[key] : undefined;
  const value = fromProcess ?? (import.meta.env as Record<string, string | undefined>)[key];
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
