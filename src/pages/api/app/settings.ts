import type { APIRoute } from "astro";
import { assertSameOrigin, errorMessage, json, readBody, requireUser } from "../../../lib/api";
import { getDemoState } from "../../../lib/demo-store";
export const prerender = false;
export const PATCH: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const body = await readBody(context.request);
    const fullName = String(body.full_name || "").trim().replace(/\s+/g, " ");
    if (fullName.length < 2 || fullName.length > 100) return json({ error: "Enter a name between 2 and 100 characters" }, { status: 400 });
    if (context.locals.demoMode) { getDemoState(user.id, user.email).profile.full_name = fullName; return json({ ok: true, full_name: fullName }); }
    const result = await context.locals.supabase!.from("profiles").update({ full_name: fullName, updated_at: new Date().toISOString() }).eq("user_id", user.id).select("full_name").single();
    if (result.error) throw result.error;
    return json({ ok: true, full_name: result.data.full_name });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 500 });
  }
};
