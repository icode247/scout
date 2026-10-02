import type { SupabaseClient } from "@supabase/supabase-js";

export const EVIDENCE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
/** Label the member's Resume tab looks for to show the per-job resume. */
export const TAILORED_RESUME_LABEL = "Tailored resume";

export function evidenceFiles(form: FormData, field: string): File[] {
  return form.getAll(field).filter((value): value is File => value instanceof File && value.size > 0);
}

/**
 * The tailored resume may be a PDF or Word file. Some browsers send .docx with an
 * empty or generic type, so the extension decides; returns the type to store.
 */
export function tailoredResumeType(file: File): string | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "application/pdf";
  if (file.type === DOCX_TYPE || name.endsWith(".docx")) return DOCX_TYPE;
  return null;
}

/** Returns a user-facing problem with the files, or null when they can all be stored. */
export function evidenceProblem(files: File[]): string | null {
  for (const file of files) {
    if (!EVIDENCE_TYPES.has(file.type)) return `${file.name} must be a PNG, JPEG, WebP, or PDF`;
    if (file.size > EVIDENCE_MAX_BYTES) return `${file.name} is larger than 10 MB`;
  }
  return null;
}

/**
 * Stores files in the private evidence bucket and records one row per file. A
 * row that fails to insert removes its upload so storage never holds orphans.
 */
export async function storeEvidence(admin: SupabaseClient, userId: string, applicationId: string, files: File[], label: string, typeOf: (file: File) => string = (file) => file.type) {
  const inserted: Array<{ id: string; label: string; mime_type: string; created_at: string }> = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${userId}/${applicationId}/${crypto.randomUUID()}-${safeName}`;
    const contentType = typeOf(file);
    const uploaded = await admin.storage.from("application-evidence").upload(path, file, { contentType, upsert: false });
    if (uploaded.error) throw uploaded.error;
    const row = await admin.from("application_evidence").insert({
      user_id: userId, application_id: applicationId, label,
      storage_path: path, mime_type: contentType,
    }).select("id,label,mime_type,created_at").single();
    if (row.error) {
      await admin.storage.from("application-evidence").remove([path]);
      throw row.error;
    }
    inserted.push(row.data);
  }
  return inserted;
}
