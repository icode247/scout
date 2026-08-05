import type { APIRoute } from "astro";
import { assertSameOrigin } from "../../../lib/api";
import { getPostHogServer } from "../../../lib/posthog-server";
import { sealSupabaseCookies } from "../../../lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  assertSameOrigin(context);
  const userId = context.locals.user?.id;
  if (userId) {
    const posthog = getPostHogServer();
    if (posthog) {
      posthog.capture({ distinctId: userId, event: "user_signed_out" });
      await posthog.flush();
    }
  }
  if (context.locals.supabase) {
    // signOut() clears the session cookies synchronously; sealing afterwards
    // stops the async SIGNED_OUT notification writing again post-response.
    await context.locals.supabase.auth.signOut();
    sealSupabaseCookies(context.locals.supabase);
  }
  context.cookies.delete("scout_demo_email", { path: "/" });
  return context.redirect("/login", 303);
};
