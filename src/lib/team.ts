import type { SupabaseClient, User } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;

async function* allUsers(admin: SupabaseClient) {
  for (let page = 1; ; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (result.error) throw result.error;
    yield* result.data.users;
    if (result.data.users.length < PAGE_SIZE) return;
  }
}

/** Looks a login up by email; Supabase's admin API has no direct email lookup. */
export async function findUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const wanted = email.trim().toLowerCase();
  for await (const user of allUsers(admin)) if (user.email?.toLowerCase() === wanted) return user;
  return null;
}
