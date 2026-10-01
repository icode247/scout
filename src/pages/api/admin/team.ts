import type { APIRoute } from "astro";
import { adminEmails, createAdminClient, requireStaff } from "../../../lib/admin";
import { assertSameOrigin, errorMessage, json, readBody } from "../../../lib/api";
import { humanAssistants } from "../../../lib/human-assistants";
import { findUserByEmail } from "../../../lib/team";

export const prerender = false;

function requireAdminRole(context: Parameters<APIRoute>[0]) {
  const staff = requireStaff(context);
  if (staff.role !== "admin") throw new Response(JSON.stringify({ error: "Only an admin can manage the team" }), { status: 403, headers: { "content-type": "application/json" } });
  return staff;
}

/**
 * Adds an agent, or changes which assistant they work as. Creates the login when
 * the email is new; Scout has no passwords, so the agent then signs in at /login
 * with that email (Google or an emailed link).
 */
export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    requireAdminRole(context);
    const body = await readBody(context.request);
    const email = String(body.email || "").trim().toLowerCase();
    const assistantName = String(body.assistant_name || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "Enter a valid email address" }, { status: 400 });
    if (!humanAssistants.some((assistant) => assistant.name === assistantName)) return json({ error: "Choose which assistant they work as" }, { status: 400 });

    const admin = createAdminClient();
    const existing = await findUserByEmail(admin, email);
    if (existing) {
      // A paying client turned into staff would lose their own dashboard.
      const paying = await admin.from("subscriptions").select("id").eq("user_id", existing.id).eq("status", "active").limit(1).maybeSingle();
      if (paying.error) throw paying.error;
      if (paying.data) return json({ error: "That email belongs to a paying client. Use a different email for the agent." }, { status: 409 });
      // An admin listed in ADMIN_EMAILS keeps admin access and also works as this assistant.
      const role = adminEmails().has(email) ? undefined : "agent";
      const updated = await admin.auth.admin.updateUserById(existing.id, {
        app_metadata: { ...(existing.app_metadata || {}), ...(role ? { scout_role: role } : {}), assistant_name: assistantName },
      });
      if (updated.error) throw updated.error;
      return json({ created: false, email });
    }

    const created = await admin.auth.admin.createUser({
      email, email_confirm: true,
      app_metadata: { scout_role: "agent", assistant_name: assistantName },
      user_metadata: { full_name: assistantName },
    });
    if (created.error) throw created.error;
    return json({ created: true, email });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 500 });
  }
};

/** Removes operations access. The login itself stays, with no special role. */
export const DELETE: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const staff = requireAdminRole(context);
    const userId = context.url.searchParams.get("user_id") || "";
    if (!userId) return json({ error: "Agent is required" }, { status: 400 });
    const admin = createAdminClient();
    const user = await admin.auth.admin.getUserById(userId);
    if (user.error || !user.data.user) return json({ error: "Agent not found" }, { status: 404 });
    if (user.data.user.email?.toLowerCase() === staff.email) return json({ error: "You cannot remove your own access" }, { status: 400 });
    // app_metadata updates merge, so clearing the two keys leaves everything else intact.
    const updated = await admin.auth.admin.updateUserById(userId, { app_metadata: { scout_role: null, assistant_name: null } });
    if (updated.error) throw updated.error;
    return json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 500 });
  }
};
