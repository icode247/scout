import type { APIRoute } from "astro";
import { createAdminClient, requireStaff } from "../../../lib/admin";
import { assertSameOrigin, errorMessage, json } from "../../../lib/api";
import { AgentError, createAgent, deleteAgent, updateAgent } from "../../../lib/agents";

export const prerender = false;

function requireAdminRole(context: Parameters<APIRoute>[0]) {
  const staff = requireStaff(context);
  if (staff.role !== "admin") throw new Response(JSON.stringify({ error: "Only an admin can manage agents" }), { status: 403, headers: { "content-type": "application/json" } });
}

function fail(error: unknown) {
  if (error instanceof Response) return error;
  if (error instanceof AgentError) return json({ error: error.message }, { status: error.status });
  // The roster table only exists once the human_assistants migration has run.
  if (/human_assistants/.test(errorMessage(error))) return json({ error: "Run the human_assistants database migration first, then try again." }, { status: 503 });
  return json({ error: errorMessage(error) }, { status: 500 });
}

function photo(form: FormData) {
  const file = form.get("avatar");
  return file instanceof File && file.size > 0 ? file : null;
}

/** Add an agent (no `id`) or edit one (with `id`). Multipart, so a photo can come along. */
export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    requireAdminRole(context);
    const form = await context.request.formData();
    const id = String(form.get("id") || "");
    const input = { name: form.get("name"), email: form.get("email"), avatar: photo(form), active: id ? form.get("active") === "on" : undefined };
    const admin = createAdminClient();
    const agent = id ? await updateAgent(admin, id, input) : await createAgent(admin, input);
    return json({ agent });
  } catch (error) {
    return fail(error);
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    requireAdminRole(context);
    const id = context.url.searchParams.get("id") || "";
    if (!id) return json({ error: "Agent is required" }, { status: 400 });
    const result = await deleteAgent(createAdminClient(), id, context.url.searchParams.get("reassign_to"));
    return json(result);
  } catch (error) {
    return fail(error);
  }
};
