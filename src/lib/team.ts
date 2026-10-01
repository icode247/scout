import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Agents are ordinary Scout logins whose app_metadata says `scout_role: "agent"`
 * and which assistant they work as. app_metadata is writable only with the
 * service role, so a user can never grant themselves operations access.
 */
export interface TeamAgent { userId: string; email: string; assistantName: string; lastSignInAt: string | null; createdAt: string }

const PAGE_SIZE = 1000;

async function* allUsers(admin: SupabaseClient) {
  for (let page = 1; ; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (result.error) throw result.error;
    yield* result.data.users;
    if (result.data.users.length < PAGE_SIZE) return;
  }
}

export async function findUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const wanted = email.trim().toLowerCase();
  for await (const user of allUsers(admin)) if (user.email?.toLowerCase() === wanted) return user;
  return null;
}

export async function listAgents(admin: SupabaseClient): Promise<TeamAgent[]> {
  const agents: TeamAgent[] = [];
  for await (const user of allUsers(admin)) {
    const metadata = user.app_metadata || {};
    if (metadata.scout_role !== "agent" || typeof metadata.assistant_name !== "string") continue;
    agents.push({ userId: user.id, email: user.email || "", assistantName: metadata.assistant_name, lastSignInAt: user.last_sign_in_at ?? null, createdAt: user.created_at });
  }
  return agents.sort((a, b) => a.assistantName.localeCompare(b.assistantName) || a.email.localeCompare(b.email));
}
