import type { APIRoute } from "astro";
import { safeNext } from "../../lib/api";
import { createSupabaseServerClient } from "../../lib/supabase";
import { getPostHogServer } from "../../lib/posthog-server";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const next = safeNext(context.url.searchParams.get("next"));
  const code = context.url.searchParams.get("code");
  const tokenHash = context.url.searchParams.get("token_hash");
  const type = context.url.searchParams.get("type") as "email" | "magiclink" | null;
  const supabase = createSupabaseServerClient(context);

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const u = data?.user;
      if (u) {
        const posthog = getPostHogServer();
        if (posthog) {
          posthog.identify({ distinctId: u.id, properties: { name: u.user_metadata?.full_name || undefined } });
          posthog.capture({ distinctId: u.id, event: "user_signed_in", properties: { method: u.app_metadata?.provider || "google" } });
          await posthog.flush();
        }
      }
      return context.redirect(next, 303);
    }
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      const u = data?.user;
      if (u) {
        const posthog = getPostHogServer();
        if (posthog) {
          posthog.identify({ distinctId: u.id, properties: { name: u.user_metadata?.full_name || undefined } });
          posthog.capture({ distinctId: u.id, event: "user_signed_in", properties: { method: "magic_link" } });
          await posthog.flush();
        }
      }
      return context.redirect(next, 303);
    }
  }
  return context.redirect("/login?error=callback", 303);
};
