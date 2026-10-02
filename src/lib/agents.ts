import type { SupabaseClient } from "@supabase/supabase-js";
import { adminEmails } from "./admin";
import { mapAssistantRow, refreshHumanAssistants, type HumanAssistant } from "./human-assistants";
import { findUserByEmail } from "./team";

/**
 * Admin operations on the Human Assistant roster. Each assistant is a row in
 * human_assistants; the login that works as them carries
 * app_metadata { scout_role: "agent", assistant_name }, which is what grants
 * operations access. These functions keep the two in step.
 */
export class AgentError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const AVATAR_BUCKET = "assistant-avatars";
const AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export function cleanEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new AgentError("Enter a valid email address");
  return email;
}

export function cleanName(value: unknown) {
  const name = String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (name.length < 2) throw new AgentError("Enter the agent's name");
  return name;
}

async function loadRow(admin: SupabaseClient, id: string) {
  const row = await admin.from("human_assistants").select("*").eq("id", id).maybeSingle();
  if (row.error) throw row.error;
  if (!row.data) throw new AgentError("Agent not found", 404);
  return row.data;
}

async function assertUnique(admin: SupabaseClient, name: string, email: string | null, exceptId?: string) {
  const rows = await admin.from("human_assistants").select("id,name,email,former_names");
  if (rows.error) throw rows.error;
  for (const row of rows.data || []) {
    if (row.id === exceptId) continue;
    const names = [row.name, ...(row.former_names || [])].map((value: string) => value.toLowerCase());
    if (names.includes(name.toLowerCase())) throw new AgentError(`"${name}" is already used by another agent`, 409);
    if (email && row.email?.toLowerCase() === email) throw new AgentError("That email already belongs to another agent", 409);
  }
}

/** Uploads a photo to the public avatar bucket (created on first use) and returns its URL. */
async function uploadAvatar(admin: SupabaseClient, file: File) {
  if (!AVATAR_TYPES.has(file.type)) throw new AgentError("The photo must be a PNG, JPEG or WebP image");
  if (file.size > AVATAR_MAX_BYTES) throw new AgentError("The photo must be under 2 MB");
  const bucket = await admin.storage.getBucket(AVATAR_BUCKET);
  if (bucket.error) {
    const created = await admin.storage.createBucket(AVATAR_BUCKET, { public: true, fileSizeLimit: AVATAR_MAX_BYTES });
    if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
  }
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${crypto.randomUUID()}.${extension}`;
  const uploaded = await admin.storage.from(AVATAR_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (uploaded.error) throw uploaded.error;
  return admin.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Gives a login agent access as `assistantName`, creating the login when it is new. */
async function grantLogin(admin: SupabaseClient, email: string, assistantName: string) {
  const existing = await findUserByEmail(admin, email);
  if (existing) {
    const paying = await admin.from("subscriptions").select("id").eq("user_id", existing.id).eq("status", "active").limit(1).maybeSingle();
    if (paying.error) throw paying.error;
    if (paying.data) throw new AgentError("That email belongs to a paying client. Use a different email for the agent.", 409);
    // An admin keeps admin access and also works as this assistant.
    const role = adminEmails().has(email) ? {} : { scout_role: "agent" };
    const updated = await admin.auth.admin.updateUserById(existing.id, { app_metadata: { ...role, assistant_name: assistantName } });
    if (updated.error) throw updated.error;
    return;
  }
  const created = await admin.auth.admin.createUser({
    email, email_confirm: true,
    app_metadata: { scout_role: "agent", assistant_name: assistantName },
    user_metadata: { full_name: assistantName },
  });
  if (created.error) throw created.error;
}

/** Removes operations access from a login; the login itself stays. */
async function revokeLogin(admin: SupabaseClient, email: string) {
  const existing = await findUserByEmail(admin, email);
  if (!existing) return;
  // app_metadata updates merge, so clearing the two keys leaves everything else intact.
  const updated = await admin.auth.admin.updateUserById(existing.id, { app_metadata: { scout_role: null, assistant_name: null } });
  if (updated.error) throw updated.error;
}

/** Client ids currently assigned to this assistant under any of its names. */
async function clientIdsFor(admin: SupabaseClient, names: string[]) {
  const result = await admin.from("profiles").select("user_id,assistant_name").eq("assistant_type", "human");
  if (result.error) throw result.error;
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return (result.data || []).filter((row) => row.assistant_name && wanted.has(String(row.assistant_name).trim().toLowerCase())).map((row) => row.user_id as string);
}

async function moveClients(admin: SupabaseClient, userIds: string[], toName: string) {
  if (!userIds.length) return;
  const moved = await admin.from("profiles").update({ assistant_name: toName, updated_at: new Date().toISOString() }).in("user_id", userIds);
  if (moved.error) throw moved.error;
}

export interface AgentInput { name: unknown; email?: unknown; avatar?: File | null; active?: unknown }

export async function createAgent(admin: SupabaseClient, input: AgentInput): Promise<HumanAssistant> {
  const name = cleanName(input.name);
  const email = cleanEmail(input.email);
  await assertUnique(admin, name, email);
  const avatarUrl = input.avatar ? await uploadAvatar(admin, input.avatar) : null;
  if (email) await grantLogin(admin, email, name);
  const inserted = await admin.from("human_assistants").insert({
    name, first_name: name.split(" ")[0], email, avatar_url: avatarUrl, active: true,
  }).select("*").single();
  if (inserted.error) throw inserted.error;
  await refreshHumanAssistants(admin, true);
  return mapAssistantRow(inserted.data);
}

export async function updateAgent(admin: SupabaseClient, id: string, input: AgentInput): Promise<HumanAssistant> {
  const row = await loadRow(admin, id);
  const name = cleanName(input.name);
  const email = cleanEmail(input.email);
  await assertUnique(admin, name, email, id);

  const renamed = name !== row.name;
  const formerNames: string[] = row.former_names || [];
  if (renamed) {
    // Clients point at the assistant by name: move them, and remember the old one.
    await moveClients(admin, await clientIdsFor(admin, [row.name, ...formerNames]), name);
    if (!formerNames.some((value) => value.toLowerCase() === row.name.toLowerCase())) formerNames.push(row.name);
  }
  const oldEmail = row.email?.toLowerCase() || null;
  if (oldEmail && oldEmail !== email) await revokeLogin(admin, oldEmail);
  if (email && (email !== oldEmail || renamed)) await grantLogin(admin, email, name);

  const avatarUrl = input.avatar ? await uploadAvatar(admin, input.avatar) : row.avatar_url;
  const updated = await admin.from("human_assistants").update({
    name, first_name: name.split(" ")[0], email, avatar_url: avatarUrl,
    former_names: formerNames.filter((value) => value.toLowerCase() !== name.toLowerCase()),
    active: input.active === undefined ? row.active : input.active === true || input.active === "true" || input.active === "on",
    updated_at: new Date().toISOString(),
  }).eq("id", id).select("*").single();
  if (updated.error) throw updated.error;
  await refreshHumanAssistants(admin, true);
  return mapAssistantRow(updated.data);
}

/** Deletes an assistant. Their clients must move to another assistant first. */
export async function deleteAgent(admin: SupabaseClient, id: string, reassignToId?: string | null) {
  const row = await loadRow(admin, id);
  const clients = await clientIdsFor(admin, [row.name, ...(row.former_names || [])]);
  if (clients.length) {
    if (!reassignToId) throw new AgentError(`${row.name} has ${clients.length} client${clients.length === 1 ? "" : "s"}. Choose who takes them over.`, 409);
    if (reassignToId === id) throw new AgentError("Choose a different agent to take over the clients");
    const target = await loadRow(admin, reassignToId);
    await moveClients(admin, clients, target.name);
  }
  if (row.email) await revokeLogin(admin, row.email);
  const deleted = await admin.from("human_assistants").delete().eq("id", id);
  if (deleted.error) throw deleted.error;
  await refreshHumanAssistants(admin, true);
  return { moved: clients.length };
}
