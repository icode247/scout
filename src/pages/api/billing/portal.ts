import type { APIRoute } from "astro";
import { errorMessage, json, requireUser } from "../../../lib/api";
import { DodoError, createPortalSession } from "../../../lib/dodo";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const user = requireUser(context);
    const supabase = context.locals.supabase;
    if (!supabase) return json({ error: "Billing is unavailable." }, { status: 503 });

    const { data } = await supabase
      .from("subscriptions")
      .select("dodo_customer_id")
      .eq("user_id", user.id)
      .not("dodo_customer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data?.dodo_customer_id) return json({ error: "No billing account found." }, { status: 404 });

    const { link } = await createPortalSession(String(data.dodo_customer_id));
    return context.redirect(link, 303);
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: error instanceof DodoError ? error.status : 400 });
  }
};
