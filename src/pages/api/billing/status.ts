import type { APIRoute } from "astro";
import { json, requireUser } from "../../../lib/api";

export const prerender = false;

/** Poll target for /checkout/success while the Dodo webhook is in flight. */
export const GET: APIRoute = async (context) => {
  try {
    requireUser(context);
    const entitlement = context.locals.entitlement;
    return json({
      paid: entitlement.paid,
      lane: entitlement.lane,
      planCode: entitlement.planCode,
      status: entitlement.status,
      applicationsRemaining: entitlement.applicationsRemaining,
      applicationsQuota: entitlement.applicationsQuota,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Unavailable" }, { status: 400 });
  }
};
