import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;

export function getPostHogServer(): PostHog | null {
  const token = import.meta.env.POSTHOG_PROJECT_TOKEN?.trim();
  if (!token) {
    if (import.meta.env.DEV) {
      console.error("POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_PROJECT_TOKEN is configured");
    }
    return null;
  }
  if (!posthogClient) {
    posthogClient = new PostHog(token, {
      host: import.meta.env.POSTHOG_HOST?.trim() || "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}
