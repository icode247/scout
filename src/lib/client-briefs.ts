import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Client briefs live in their own private bucket, one folder per client:
 * `client-briefs/<user_id>/<timestamp>-<file name>`. No table is needed — the
 * folder listing is the list of briefs, newest first by the timestamp prefix.
 */
export const BRIEF_BUCKET = "client-briefs";
export const BRIEF_MAX_BYTES = 20 * 1024 * 1024;
export const BRIEF_TYPES = new Map<string, string>([
  ["application/pdf", "PDF"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Word"],
  ["application/msword", "Word"],
  ["text/plain", "Text"],
  ["text/markdown", "Text"],
  ["image/png", "Image"],
  ["image/jpeg", "Image"],
  ["image/webp", "Image"],
]);
export const BRIEF_ACCEPT = ".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.webp";

export interface ClientBrief { path: string; name: string; uploadedAt: string; size: number; kind: string }

/** Creates the private bucket the first time a brief is uploaded. */
export async function ensureBriefBucket(admin: SupabaseClient) {
  const existing = await admin.storage.getBucket(BRIEF_BUCKET);
  if (!existing.error) return;
  const created = await admin.storage.createBucket(BRIEF_BUCKET, { public: false, fileSizeLimit: BRIEF_MAX_BYTES });
  if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
}

export function briefProblem(file: File): string | null {
  if (!BRIEF_TYPES.has(file.type)) return `${file.name} must be a PDF, Word document, text file, or image`;
  if (file.size > BRIEF_MAX_BYTES) return `${file.name} is larger than 20 MB`;
  return null;
}

export function briefPath(userId: string, fileName: string) {
  const safe = fileName.replace(/[^a-zA-Z0-9._ -]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "brief";
  return `${userId}/${Date.now()}-${safe}`;
}

/** The client a brief path belongs to, or null for a path outside a client folder. */
export function briefOwner(path: string): string | null {
  const [owner, file, ...rest] = path.split("/");
  return owner && file && !rest.length && /^[0-9a-f-]{36}$/i.test(owner) ? owner : null;
}

function kindOf(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() || "";
  if (extension === "pdf") return "PDF";
  if (extension === "doc" || extension === "docx") return "Word";
  if (["png", "jpg", "jpeg", "webp"].includes(extension)) return "Image";
  return "Text";
}

export async function listBriefs(admin: SupabaseClient, userId: string): Promise<ClientBrief[]> {
  const result = await admin.storage.from(BRIEF_BUCKET).list(userId, { limit: 100, sortBy: { column: "name", order: "desc" } });
  // A missing bucket just means nobody has uploaded a brief yet.
  if (result.error) return [];
  return (result.data || []).filter((item) => item.id).map((item) => {
    const match = item.name.match(/^(\d{10,})-(.*)$/);
    return {
      path: `${userId}/${item.name}`,
      name: match ? match[2] : item.name,
      uploadedAt: match ? new Date(Number(match[1])).toISOString() : String(item.created_at || ""),
      size: Number((item.metadata as any)?.size || 0),
      kind: kindOf(item.name),
    };
  });
}

/** Client ids that have at least one brief — one listing call for the whole overview. */
export async function clientsWithBriefs(admin: SupabaseClient): Promise<Set<string>> {
  const result = await admin.storage.from(BRIEF_BUCKET).list("", { limit: 1000 });
  if (result.error) return new Set();
  return new Set((result.data || []).filter((item) => !item.id).map((item) => item.name));
}
