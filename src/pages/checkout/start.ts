import type { APIRoute } from "astro";
import { planByCode } from "../../config/plans";
import { startCheckout } from "../../lib/checkout";
import { staffMember } from "../../lib/admin";

export const prerender = false;

/**
 * A plain link that goes straight to payment: `/checkout/start?plan=human_focused`.
 * Middleware has already sent a signed-out visitor to /login and back here, so the
 * plan they chose survives sign-up and they land in checkout, not on pricing again.
 */
export const GET: APIRoute = async (context) => {
  const plan = planByCode(context.url.searchParams.get("plan") || "");
  if (!plan) return context.redirect("/pricing", 303);
  const user = context.locals.user;
  if (!user) return context.redirect(`/login?next=${encodeURIComponent(`/checkout/start?plan=${plan.code}`)}`, 303);
  if (staffMember(user)) return context.redirect("/admin", 303);
  try {
    const session = await startCheckout(context, user, plan);
    return context.redirect(session.checkoutUrl, 303);
  } catch (error) {
    console.error("Checkout start failed", error);
    return context.redirect(`/pricing?checkout=error&lane=${plan.lane}#${plan.lane}`, 303);
  }
};
