import type { APIRoute } from "astro";
import { createAdminClient, requireAdmin } from "../../../lib/admin";
import { assertSameOrigin, errorMessage, json, readBody } from "../../../lib/api";
import { humanAssistants } from "../../../lib/human-assistants";

export const prerender = false;

function validGroupUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "chat.whatsapp.com" || url.hostname === "wa.me");
  } catch { return false; }
}

export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    requireAdmin(context);
    const body = await readBody(context.request);
    const userId = String(body.user_id || "");
    const assistantName = String(body.assistant_name || "").trim();
    const whatsappUrl = String(body.whatsapp_url || "").trim();
    if (!userId) return json({ error: "Member is required" }, { status: 400 });
    if (!humanAssistants.some((assistant) => assistant.name === assistantName)) return json({ error: "Choose a valid Human Assistant" }, { status: 400 });
    if (!validGroupUrl(whatsappUrl)) return json({ error: "Enter a valid WhatsApp group invite link" }, { status: 400 });
    const admin = createAdminClient();
    const result = await admin.from("profiles").update({ assistant_name: assistantName, whatsapp_url: whatsappUrl, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("assistant_type", "human").select("user_id,assistant_name,whatsapp_url").single();
    if (result.error) throw result.error;
    return json({ profile: result.data });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 500 });
  }
};
