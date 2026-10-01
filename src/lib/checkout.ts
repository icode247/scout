import type { APIContext } from "astro";
import type { User } from "@supabase/supabase-js";
import type { Plan } from "../config/plans";
import { createCheckoutSession } from "./dodo";
import { googleClientIdFromCookie } from "./google-analytics";

/** Opens a Dodo checkout for a signed-in member. Shared by the JSON API and the /checkout/start link. */
export function startCheckout(context: APIContext, user: User, plan: Plan) {
  const origin = context.url.origin;
  return createCheckoutSession({
    plan,
    userId: user.id,
    email: user.email || "",
    name: (user.user_metadata as any)?.full_name,
    returnUrl: `${origin}/checkout/success?plan=${encodeURIComponent(plan.code)}`,
    cancelUrl: `${origin}/pricing?checkout=cancelled`,
    metadata: {
      ga_client_id: googleClientIdFromCookie(context.cookies.get("_ga")?.value) || "",
    },
  });
}
