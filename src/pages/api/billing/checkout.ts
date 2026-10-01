import type { APIRoute } from "astro";
import { assertSameOrigin, errorMessage, json, requireUser } from "../../../lib/api";
import { planByCode } from "../../../config/plans";
import { DodoError } from "../../../lib/dodo";
import { startCheckout } from "../../../lib/checkout";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const body = await context.request.json().catch(() => ({}));
    const plan = planByCode(String((body as any).planCode || ""));
    if (!plan) return json({ error: "Choose a plan to continue." }, { status: 400 });

    const session = await startCheckout(context, user, plan);

    return json({
      url: session.checkoutUrl,
      sessionId: session.sessionId,
      analytics: {
        currency: "USD",
        value: plan.priceCents / 100,
        items: [{ item_id: plan.code, item_name: plan.name, item_category: plan.lane, price: plan.priceCents / 100, quantity: 1 }],
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: error instanceof DodoError ? error.status : 400 });
  }
};
