/**
 * Who a Dodo billing event is for, and which Scout plan it pays for.
 *
 * Scout's own checkout stamps `metadata.user_id` and `metadata.plan_code` on the payment, but a
 * payment made another way (a Dodo payment link, an invoice, a payment the Dodo dashboard
 * started) arrives with empty metadata. Those used to be skipped, so a returning customer
 * paid and stayed on their used-up allowance. Without metadata the event is attributed from
 * what Dodo always sends:
 *
 * - the plan from the product bought (`product_cart[].product_id`, or `product_id` on
 *   subscription events), matched against the DODO_PRODUCT_* ids. Scout and FastApply share one
 *   Dodo account, so a product that is not a Scout plan means the event is not Scout's;
 * - the customer from a stored row that carries this Dodo subscription or customer id, and
 *   failing that from the one Scout profile with the payer's email.
 *
 * Anything ambiguous (two Scout products in one cart, an email shared by two profiles, a Dodo
 * customer id on two users' rows) is left unattributed rather than guessed.
 */
import { PLANS, planByCode, type Plan } from "../config/plans";
import { serverEnv } from "./server-env";

/** The Scout plan sold as this Dodo product, or null when it is not one of Scout's. */
export function planForProductId(productId: string | null | undefined): Plan | null {
  if (!productId) return null;
  const matches = PLANS.filter((plan) => serverEnv(plan.productEnvKey) === productId);
  return matches.length === 1 ? matches[0] : null;
}

/** Every product id the event's payload names. */
export function productIdsOf(data: any): string[] {
  const ids = new Set<string>();
  for (const item of Array.isArray(data?.product_cart) ? data.product_cart : []) {
    if (item?.product_id) ids.add(String(item.product_id));
  }
  if (data?.product_id) ids.add(String(data.product_id));
  return [...ids];
}

export type Attribution =
  | { userId: string; plan: Plan; via: "metadata" | "subscription" | "customer" | "email"; error?: undefined }
  | { userId: null; plan: Plan | null; via?: undefined; error?: string };

function onlyOne(values: string[]): string | null {
  const distinct = [...new Set(values.filter(Boolean))];
  return distinct.length === 1 ? distinct[0] : null;
}

/** `ilike` without wildcards: an email's `_` must match only `_`. */
function literalPattern(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function attributeEvent(supabase: any, data: any): Promise<Attribution> {
  const metadata = data?.metadata || {};

  let plan = planByCode(String(metadata.plan_code || ""));
  if (!plan) {
    const plans = [...new Set(productIdsOf(data).map(planForProductId).filter((found): found is Plan => Boolean(found)))];
    plan = plans.length === 1 ? plans[0] : null;
  }
  if (!plan) return { userId: null, plan: null };

  const metadataUser = String(metadata.user_id || "");
  if (metadataUser) return { userId: metadataUser, plan, via: "metadata" };

  const subscriptionId = data?.subscription_id ? String(data.subscription_id) : "";
  if (subscriptionId) {
    const rows = await supabase.from("subscriptions").select("user_id").eq("dodo_subscription_id", subscriptionId);
    if (rows.error) return { userId: null, plan, error: rows.error.message };
    const userId = onlyOne((rows.data || []).map((row: { user_id: string }) => row.user_id));
    if (userId) return { userId, plan, via: "subscription" };
    if (rows.data?.length) return { userId: null, plan };
  }

  const customerId = data?.customer?.customer_id ? String(data.customer.customer_id) : "";
  if (customerId) {
    const rows = await supabase.from("subscriptions").select("user_id").eq("dodo_customer_id", customerId);
    if (rows.error) return { userId: null, plan, error: rows.error.message };
    const userId = onlyOne((rows.data || []).map((row: { user_id: string }) => row.user_id));
    if (userId) return { userId, plan, via: "customer" };
    if (rows.data?.length) return { userId: null, plan };
  }

  const email = String(data?.customer?.email || "").trim();
  if (email) {
    const rows = await supabase.from("profiles").select("user_id").ilike("email", literalPattern(email)).limit(2);
    if (rows.error) return { userId: null, plan, error: rows.error.message };
    const found = (rows.data || []) as { user_id: string }[];
    if (found.length === 1) return { userId: found[0].user_id, plan, via: "email" };
  }

  return { userId: null, plan };
}
