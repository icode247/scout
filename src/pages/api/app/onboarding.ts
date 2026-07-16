import type { APIRoute } from "astro";
import { assertSameOrigin, errorMessage, json, list, readBody, requireUser } from "../../../lib/api";
import { getDemoState } from "../../../lib/demo-store";

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
    const file = form.get("resume");

    if (context.locals.demoMode) {
      const state = getDemoState(user.id, user.email);
      state.profile.assistant_type = assistant;
      state.profile.onboarding_complete = true;
      state.profile.assistant_name = assistant === "human" ? "Taylor" : "Scout AI";
      if (file instanceof File && file.size) state.resumes.unshift({ id: crypto.randomUUID(), name: file.name, kind: "original", storage_path: null, created_at: new Date().toISOString() });
      state.jobProfiles.unshift({ id: crypto.randomUUID(), name, assistant_type: assistant, target_roles: roles, locations, salary_min: salary, resume_behavior: resumeBehavior, active: true, resume_ids: state.resumes[0] ? [state.resumes[0].id] : [] });
      return json({ ok: true, redirect: "/dashboard" });
    }

    const supabase = context.locals.supabase!;
    let resumeId: string | null = null;
    if (file instanceof File && file.size) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
      const upload = await supabase.storage.from("resumes").upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) throw upload.error;
      const inserted = await supabase.from("resumes").insert({ user_id: user.id, name: file.name, storage_path: path, extracted_data: { status: "queued" } }).select("id").single();
      if (inserted.error) throw inserted.error;
      resumeId = inserted.data.id;
    }
    const profileUpdate = await supabase.from("profiles").update({ assistant_type: assistant, onboarding_complete: true, assistant_name: assistant === "human" ? "Your Scout assistant" : "Scout AI", updated_at: new Date().toISOString() }).eq("user_id", user.id);
    if (profileUpdate.error) throw profileUpdate.error;
    const jobProfile = await supabase.from("job_profiles").insert({ user_id: user.id, name, assistant_type: assistant, target_roles: roles, locations, salary_min: salary, resume_behavior: resumeBehavior, resume_id: resumeId }).select("id").single();
    if (jobProfile.error) throw jobProfile.error;
    if (resumeId) {
      const linked = await supabase.from("job_profile_resumes").insert({ user_id: user.id, job_profile_id: jobProfile.data.id, resume_id: resumeId, is_primary: true });
      if (linked.error) throw linked.error;
    }
    return json({ ok: true, redirect: "/dashboard" });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};
