import type { APIRoute } from "astro";
import { errorMessage, json } from "../../lib/api";
import { createSupabaseServiceClient } from "../../lib/supabase";
import { clientIp, rateLimit, tooManyRequests } from "../../lib/rate-limit";
import { validateResumeFile } from "../../lib/resume";
import { INTAKE_MAX_RESUME_BYTES, cleanIntakeAnswers, validWhatsappPhone } from "../../lib/applicant-intake";

export const prerender = false;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;
}

/** Public Human Assistant intake: no session, so it writes with the service role. */
export const POST: APIRoute = async (context) => {
  try {
    const form = await context.request.formData().catch(() => null);
    if (!form) return json({ error: "Send the form again." }, { status: 400 });
    const fields: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) if (typeof value === "string") fields[key] = value;

    // Honeypot: a hidden `website` field no human fills in. Answer as if saved.
    if (text(fields.website, 200)) return json({ ok: true });

    const email = text(fields.email, 254).toLowerCase();
    const fullName = text(fields.full_name, 160);
    const resume = form.get("resume");
    if (!fullName) return json({ error: "Enter your full name." }, { status: 400 });
    if (!validEmail(email)) return json({ error: "Enter a valid email address." }, { status: 400 });
    if (!validWhatsappPhone(text(fields.whatsappPhone, 40))) return json({ error: "Enter your WhatsApp number with the country code, e.g. +44 7700 900123." }, { status: 400 });
    if (!(resume instanceof File) || !resume.size) return json({ error: "Add your resume." }, { status: 400 });
    // Vercel caps a function request at 4.5 MB, so the form enforces this before sending too.
    if (resume.size > INTAKE_MAX_RESUME_BYTES) return json({ error: "Your resume must be under 4 MB." }, { status: 400 });
    await validateResumeFile(resume);
    const answers = cleanIntakeAnswers(fields);
    if (!answers.workAuthorizationCountries) return json({ error: "Add at least one country you're allowed to work in." }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    if (!(await rateLimit(supabase, `intake:${clientIp(context.request)}`, { max: 10, windowSeconds: 600 })).allowed) {
      return tooManyRequests();
    }

    const path = `intake/${crypto.randomUUID()}-${resume.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120)}`;
    const stored = await supabase.storage.from("resumes").upload(path, resume, { contentType: resume.type || "application/octet-stream", upsert: false });
    if (stored.error) throw stored.error;

    const saved = await supabase.from("assistant_intakes").insert({
      email, full_name: fullName, answers,
      resume_path: path, resume_name: resume.name.slice(0, 200),
    }).select("id").single();
    if (saved.error) {
      await supabase.storage.from("resumes").remove([path]);
      throw saved.error;
    }
    return json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};
