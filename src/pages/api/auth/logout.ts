import type { APIRoute } from "astro";
import { assertSameOrigin } from "../../../lib/api";
import { getPostHogServer } from "../../../lib/posthog-server";
import { sealSupabaseCookies } from "../../../lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  // Returning the thrown Response keeps a rejected origin a clean 403 rather
  // than an unhandled throw surfacing as a 500.
  try { assertSameOrigin(context); } catch (error) { if (error instanceof Response) return error; throw error; }
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
