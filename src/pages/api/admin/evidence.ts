import type { APIRoute } from "astro";
import { assertCanWorkClient, createAdminClient, requireStaff } from "../../../lib/admin";
import { assertSameOrigin, errorMessage, json } from "../../../lib/api";
import { evidenceFiles, evidenceProblem, storeEvidence } from "../../../lib/application-evidence";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const staff = requireStaff(context);
    const id = context.url.searchParams.get("id");
    if (!id) return json({ error: "Evidence id is required" }, { status: 400 });
    const admin = createAdminClient();
    const row = await admin.from("application_evidence").select("storage_path,user_id").eq("id", id).single();
    if (row.error) return json({ error: "Evidence not found" }, { status: 404 });
    await assertCanWorkClient(staff, admin, row.data.user_id);
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
    const staff = requireStaff(context);
    const form = await context.request.formData();
    const applicationId = String(form.get("application_id") || "");
    const label = String(form.get("label") || "Application evidence").trim().slice(0, 160);
    const files = evidenceFiles(form, "evidence");
    if (!applicationId || !files.length) return json({ error: "Choose at least one evidence file" }, { status: 400 });
    const problem = evidenceProblem(files);
    if (problem) return json({ error: problem }, { status: 400 });

    const admin = createAdminClient();
    const application = await admin.from("applications").select("id,user_id,job_id").eq("id", applicationId).single();
    if (application.error) return json({ error: "Application not found" }, { status: 404 });
    await assertCanWorkClient(staff, admin, application.data.user_id);
    const inserted = await storeEvidence(admin, application.data.user_id, applicationId, files, label);
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
    const staff = requireStaff(context);
    const id = context.url.searchParams.get("id");
    if (!id) return json({ error: "Evidence id is required" }, { status: 400 });
    const admin = createAdminClient();
    const row = await admin.from("application_evidence").select("storage_path,user_id").eq("id", id).single();
    if (row.error) return json({ error: "Evidence not found" }, { status: 404 });
    await assertCanWorkClient(staff, admin, row.data.user_id);
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
