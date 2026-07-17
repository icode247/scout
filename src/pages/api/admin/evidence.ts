import type { APIRoute } from "astro";
import { createAdminClient, requireAdmin } from "../../../lib/admin";
import { assertSameOrigin, errorMessage, json } from "../../../lib/api";

export const prerender = false;
const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

export const GET: APIRoute = async (context) => {
  try {
    requireAdmin(context);
    const id = context.url.searchParams.get("id");
    if (!id) return json({ error: "Evidence id is required" }, { status: 400 });
    const admin = createAdminClient();
    const row = await admin.from("application_evidence").select("storage_path").eq("id", id).single();
    if (row.error) return json({ error: "Evidence not found" }, { status: 404 });
    const signed = await admin.storage.from("application-evidence").createSignedUrl(row.data.storage_path, 60);
    if (signed.error) throw signed.error;
    return context.redirect(signed.data.signedUrl, 302);
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 500 });
  }
};

export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    requireAdmin(context);
    const form = await context.request.formData();
    const applicationId = String(form.get("application_id") || "");
    const label = String(form.get("label") || "Application evidence").trim().slice(0, 160);
    const files = form.getAll("evidence").filter((value): value is File => value instanceof File && value.size > 0);
    if (!applicationId || !files.length) return json({ error: "Choose at least one evidence file" }, { status: 400 });
    for (const file of files) {
      if (!allowedTypes.has(file.type)) return json({ error: `${file.name} must be a PNG, JPEG, WebP, or PDF` }, { status: 400 });
      if (file.size > 10 * 1024 * 1024) return json({ error: `${file.name} is larger than 10 MB` }, { status: 400 });
    }

    const admin = createAdminClient();
    const application = await admin.from("applications").select("id,user_id,job_id").eq("id", applicationId).single();
    if (application.error) return json({ error: "Application not found" }, { status: 404 });
    const inserted: Array<{ id:string; label:string; mime_type:string; created_at:string }> = [];
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${application.data.user_id}/${applicationId}/${crypto.randomUUID()}-${safeName}`;
      const uploaded = await admin.storage.from("application-evidence").upload(path, file, { contentType: file.type, upsert: false });
      if (uploaded.error) throw uploaded.error;
      const row = await admin.from("application_evidence").insert({
        user_id: application.data.user_id, application_id: applicationId, label,
        storage_path: path, mime_type: file.type,
      }).select("id,label,mime_type,created_at").single();
      if (row.error) {
        await admin.storage.from("application-evidence").remove([path]);
        throw row.error;
      }
      inserted.push(row.data);
    }
    await admin.from("applications").update({ status: "evidence_ready", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", applicationId);
    await admin.from("jobs").update({ status: "applied", updated_at: new Date().toISOString() }).eq("id", application.data.job_id);
    return json({ evidence: inserted });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 500 });
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    requireAdmin(context);
    const id = context.url.searchParams.get("id");
    if (!id) return json({ error: "Evidence id is required" }, { status: 400 });
    const admin = createAdminClient();
    const row = await admin.from("application_evidence").select("storage_path").eq("id", id).single();
    if (row.error) return json({ error: "Evidence not found" }, { status: 404 });
    const removed = await admin.storage.from("application-evidence").remove([row.data.storage_path]);
    if (removed.error) throw removed.error;
    const deleted = await admin.from("application_evidence").delete().eq("id", id);
    if (deleted.error) throw deleted.error;
    return json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 500 });
  }
};
