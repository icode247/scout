import type { APIRoute } from "astro";
import { assertSameOrigin, errorMessage, json, list, requireUser } from "../../../lib/api";
import { getDemoState } from "../../../lib/demo-store";
import { assignedHumanAssistant } from "../../../lib/human-assistants";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const form = await context.request.formData();
    const assistant = form.get("assistant") === "human" ? "human" : "ai";
    const roles = list(form.get("target_roles"));
    const locations = list(form.get("locations"));
    const name = String(form.get("profile_name") || roles[0] || "My job profile").trim();
    const salary = Number(String(form.get("salary_min") || "").replace(/[^0-9]/g, "")) || null;
    const resumeBehavior = form.get("resume_behavior") === "original" ? "original" : "tailor";
    const resumeId = String(form.get("resume_id") || "").trim();
    const humanAssistant = assignedHumanAssistant(user.id);
    const whatsappPhone = String(form.get("whatsapp_phone") || "").trim();

    if (!roles.length) return json({ error: "Add at least one target role" }, { status: 400 });
    if (!resumeId) return json({ error: "Upload and review a resume before finishing setup" }, { status: 400 });
    if (assistant === "human" && !/^\+?[0-9 ()-]{7,24}$/.test(whatsappPhone)) return json({ error: "Enter a valid WhatsApp phone number, including country code" }, { status: 400 });

    if (context.locals.demoMode) {
      const state = getDemoState(user.id, user.email);
      state.profile.assistant_type = assistant;
      state.profile.onboarding_complete = true;
      state.profile.assistant_name = assistant === "ai" ? "Scout AI" : humanAssistant.name;
      state.profile.whatsapp_phone = assistant === "human" ? whatsappPhone : null;
      state.jobProfiles.unshift({ id: crypto.randomUUID(), name, assistant_type: assistant, target_roles: roles, locations, salary_min: salary, resume_behavior: resumeBehavior, active: true, resume_ids: [resumeId] });
      return json({ ok: true, redirect: "/dashboard" });
    }

    const supabase = context.locals.supabase!;
    const resume = await supabase.from("resumes").select("id,extraction_status,extracted_data").eq("id", resumeId).eq("user_id", user.id).single();
    if (resume.error) return json({ error: "The selected resume could not be found" }, { status: 400 });
    if (resume.data.extraction_status === "processing") return json({ error: "Resume analysis is still running" }, { status: 409 });

    const reviewedData = {
      ...(resume.data.extracted_data || {}),
      reviewed_profile: { target_roles: roles, preferred_locations: locations, salary_min: salary },
      reviewed_at: new Date().toISOString(),
    };
    const reviewed = await supabase.from("resumes").update({ extracted_data: reviewedData }).eq("id", resumeId).eq("user_id", user.id);
    if (reviewed.error) throw reviewed.error;

    const jobProfile = await supabase.from("job_profiles").insert({
      user_id: user.id, name, assistant_type: assistant, target_roles: roles,
      locations, salary_min: salary, resume_behavior: resumeBehavior, resume_id: resumeId,
    }).select("id").single();
    if (jobProfile.error) throw jobProfile.error;

    const linked = await supabase.from("job_profile_resumes").insert({
      user_id: user.id, job_profile_id: jobProfile.data.id, resume_id: resumeId, is_primary: true,
    });
    if (linked.error) {
      await supabase.from("job_profiles").delete().eq("id", jobProfile.data.id).eq("user_id", user.id);
      throw linked.error;
    }

    const profileUpdate = await supabase.from("profiles").update({
      assistant_type: assistant, onboarding_complete: true,
      assistant_name: assistant === "ai" ? "Scout AI" : humanAssistant.name,
      whatsapp_phone: assistant === "human" ? whatsappPhone : null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);
    if (profileUpdate.error) throw profileUpdate.error;

    return json({ ok: true, redirect: "/dashboard" });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};
