import type { APIRoute } from "astro";
import { errorMessage, json } from "../../lib/api";
import { createSupabaseServiceClient } from "../../lib/supabase";
import { clientIp, rateLimit, tooManyRequests } from "../../lib/rate-limit";
import { getPostHogServer } from "../../lib/posthog-server";

export const prerender = false;

/** Field caps mirror the maxlength attributes the form already declares. */
const LIMITS = {
  first_name: 80, last_name: 80, email: 254,
  primary_role: 80, target_location: 120, challenge: 2000, source_path: 300,
} as const;

function text(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= LIMITS.email;
}

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Send your details as JSON." }, { status: 400 });

    // Honeypot: the form renders a hidden `website` field no human fills in.
    // Answer with a plausible success so bots learn nothing from the response.
    if (text((body as any).website, 200)) return json({ leadId: crypto.randomUUID() });

    const lead = {
      first_name: text((body as any).first_name, LIMITS.first_name),
      last_name: text((body as any).last_name, LIMITS.last_name),
      email: text((body as any).email, LIMITS.email).toLowerCase(),
      primary_role: text((body as any).primary_role, LIMITS.primary_role),
      target_location: text((body as any).target_location, LIMITS.target_location),
      challenge: text((body as any).challenge, LIMITS.challenge),
      source_path: text((body as any).source_path, LIMITS.source_path),
    };

    if (!lead.first_name || !lead.last_name) return json({ error: "Enter your first and last name." }, { status: 400 });
    if (!validEmail(lead.email)) return json({ error: "Enter a valid email address." }, { status: 400 });
    if (!lead.primary_role) return json({ error: "Choose the role family you are targeting." }, { status: 400 });
    if (!lead.target_location) return json({ error: "Tell us where you want to work." }, { status: 400 });
    if (!lead.challenge) return json({ error: "Tell us what is hardest about applying right now." }, { status: 400 });

    // Anonymous visitors have no session, so this writes with the service role.
    // Rate limit on IP so the public endpoint cannot be used to spam the table.
    const supabase = createSupabaseServiceClient();
    if (!(await rateLimit(supabase, `book-call:${clientIp(context.request)}`, { max: 10, windowSeconds: 600 })).allowed) {
      return tooManyRequests();
    }

    const saved = await supabase.from("booking_leads").insert(lead).select("id").single();
    if (saved.error) throw saved.error;

    const posthog = getPostHogServer();
    if (posthog) {
      posthog.capture({
        distinctId: lead.email,
        event: "strategy_call_lead_created",
        properties: { primary_role: lead.primary_role, target_location: lead.target_location, source_path: lead.source_path },
      });
      await posthog.flush();
    }

    return json({ leadId: saved.data.id });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};

/** Marks the lead scheduled once Calendly reports the booking. */
export const PATCH: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const leadId = text((body as any)?.leadId, 64);
    if (!leadId) return json({ error: "Missing lead id." }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    const updated = await supabase.from("booking_leads").update({
      status: "scheduled",
      calendly_event_uri: text((body as any)?.eventUri, 300) || null,
      calendly_invitee_uri: text((body as any)?.inviteeUri, 300) || null,
      scheduled_at: new Date().toISOString(),
    }).eq("id", leadId).select("id").maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) return json({ error: "Lead not found." }, { status: 404 });

    return json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};
