import type { APIRoute } from "astro";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertSameOrigin, errorMessage, json, requireUser } from "../../../lib/api";
import { resetDemoState } from "../../../lib/demo-store";
import { getSupabaseConfig } from "../../../lib/supabase";

export const prerender = false;

async function listFilesRecursively(client: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = [];
  const pageSize = 100;
  let offset = 0;

  while (true) {
    const result = await client.storage.from(bucket).list(prefix, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } });
    if (result.error) {
      if (result.error.message.toLowerCase().includes("not found")) return files;
      throw result.error;
    }

    const rows = result.data || [];
    for (const item of rows) {
      const path = prefix ? prefix + "/" + item.name : item.name;
      if (item.id || item.metadata) files.push(path);
      else files.push(...await listFilesRecursively(client, bucket, path));
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return files;
}

async function purgeBucket(client: SupabaseClient, bucket: string, userId: string) {
  const paths = await listFilesRecursively(client, bucket, userId);
  for (let index = 0; index < paths.length; index += 100) {
    const result = await client.storage.from(bucket).remove(paths.slice(index, index + 100));
    if (result.error) throw result.error;
  }
}

export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const form = await context.request.formData();
    if (String(form.get("confirmation") || "").trim().toUpperCase() !== "DELETE") {
      return context.redirect("/delete-account?error=confirmation", 303);
    }

    if (context.locals.demoMode) {
      resetDemoState(user.id, user.email);
      context.cookies.delete("scout_demo_email", { path: "/" });
      return context.redirect("/login?deleted=1", 303);
    }

    const config = getSupabaseConfig();
    const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!config.url || !serviceKey) {
      return context.redirect("/delete-account?error=configuration", 303);
    }

    const admin = createClient(config.url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await purgeBucket(admin, "resumes", user.id);
    await purgeBucket(admin, "application-evidence", user.id);

    const result = await admin.auth.admin.deleteUser(user.id);
    if (result.error) throw result.error;

    return context.redirect("/login?deleted=1", 303);
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 500 });
  }
};
