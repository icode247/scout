import type { APIRoute } from "astro";
import { assertCanWorkClient, createAdminClient, requireStaff } from "../../../lib/admin";
import { assertSameOrigin, errorMessage, json } from "../../../lib/api";
import { BRIEF_BUCKET, briefOwner, briefPath, briefProblem, ensureBriefBucket } from "../../../lib/client-briefs";

export const prerender = false;

const forbidden = (message: string) => json({ error: message }, { status: 403 });

/** Opens a brief through a short-lived signed link. */
export const GET: APIRoute = async (context) => {
  try {
    const staff = requireStaff(context);
    const path = context.url.searchParams.get("path") || "";
    const owner = briefOwner(path);
    if (!owner) return json({ error: "Brief not found" }, { status: 404 });
    const admin = createAdminClient();
    await assertCanWorkClient(staff, admin, owner);
    const signed = await admin.storage.from(BRIEF_BUCKET).createSignedUrl(path, 300);
    if (signed.error) return json({ error: "Brief not found" }, { status: 404 });
    return context.redirect(signed.data.signedUrl, 302);
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 500 });
  }
};

/** Adds files and/or a written brief to a client's folder. */
export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const staff = requireStaff(context);
    const form = await context.request.formData();
    const userId = String(form.get("user_id") || "");
    const written = String(form.get("text") || "").trim().slice(0, 50000);
    const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
    if (!userId) return json({ error: "Client is required" }, { status: 400 });
    if (!files.length && !written) return json({ error: "Attach a file or write the brief" }, { status: 400 });
    for (const file of files) {
      const problem = briefProblem(file);
      if (problem) return json({ error: problem }, { status: 400 });
    }
    const admin = createAdminClient();
    await assertCanWorkClient(staff, admin, userId);
    await ensureBriefBucket(admin);

    const uploads: Array<{ path: string; body: Blob; type: string }> = files.map((file) => ({ path: briefPath(userId, file.name), body: file, type: file.type }));
    if (written) {
      const date = new Date().toISOString().slice(0, 10);
      uploads.push({ path: briefPath(userId, `Written brief ${date}.txt`), body: new Blob([written], { type: "text/plain" }), type: "text/plain" });
    }
    for (const upload of uploads) {
      const stored = await admin.storage.from(BRIEF_BUCKET).upload(upload.path, upload.body, { contentType: upload.type, upsert: false });
      if (stored.error) throw stored.error;
    }
    return json({ uploaded: uploads.length });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 500 });
  }
};

/** Admins only: removes an outdated brief. */
export const DELETE: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const staff = requireStaff(context);
    if (staff.role !== "admin") return forbidden("Only an admin can delete a brief");
    const path = context.url.searchParams.get("path") || "";
    if (!briefOwner(path)) return json({ error: "Brief not found" }, { status: 404 });
    const removed = await createAdminClient().storage.from(BRIEF_BUCKET).remove([path]);
    if (removed.error) throw removed.error;
    return json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 500 });
  }
};
