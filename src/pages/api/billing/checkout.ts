import type { APIRoute } from "astro";
import { assertSameOrigin, errorMessage, json, requireUser } from "../../../lib/api";
import { planByCode } from "../../../config/plans";
import { DodoError, createCheckoutSession } from "../../../lib/dodo";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const body = await context.request.json().catch(() => ({}));
    const plan = planByCode(String((body as any).planCode || ""));
    if (!plan) return json({ error: "Choose a plan to continue." }, { status: 400 });

    const origin = context.url.origin;
    const session = await createCheckoutSession({
      plan,
      userId: user.id,
      email: user.email || "",
      name: (user.user_metadata as any)?.full_name,
      returnUrl: `${origin}/checkout/success?plan=${encodeURIComponent(plan.code)}`,
      cancelUrl: `${origin}/pricing?checkout=cancelled`,
    });

    return json({ url: session.checkoutUrl, sessionId: session.sessionId });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: error instanceof DodoError ? error.status : 400 });
  }
};
