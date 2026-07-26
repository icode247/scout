import type { APIRoute } from "astro";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertSameOrigin, errorMessage, json, requireUser } from "../../../lib/api";
import { resetDemoState } from "../../../lib/demo-store";
import { getSupabaseConfig } from "../../../lib/supabase";
import { firstApply } from "../../../lib/first-apply";
import { fastApplyExternalId } from "../../../lib/fastapply-applicant";
import { getPostHogServer } from "../../../lib/posthog-server";

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

    // Stop every billable FastApply automation and remove remotely-held PII BEFORE erasing the
    // account. Failures are collected and logged (never silently swallowed) so a billing/PII
    // leak is observable — but local erasure still proceeds afterwards, because the user's right
    // to deletion must not be blocked by a transient failure of the application service.
    const cleanupFailures: string[] = [];

    // 1) Recurring AI-agent automations — the primary source of ongoing charges.
    const agents = await admin.from("ai_agent_configs").select("id,first_apply_id").eq("user_id", user.id);
    for (const agent of agents.data || []) {
      if (!agent.first_apply_id) continue;
      try { await firstApply.cancelAutomation(agent.first_apply_id); }
      catch (error) { cleanupFailures.push(`agent ${agent.id}: ${errorMessage(error)}`); }
    }

    // 2) In-flight per-application automations that have not already reached a terminal state.
    const terminal = new Set(["cancelled", "canceled", "failed", "completed", "complete", "rejected"]);
    const runningApps = await admin.from("applications").select("id,remote_automation_id,remote_status").eq("user_id", user.id).not("remote_automation_id", "is", null);
    for (const application of runningApps.data || []) {
      if (terminal.has(String(application.remote_status || "").toLowerCase())) continue;
      try { await firstApply.cancelAutomation(application.remote_automation_id); }
      catch (error) { cleanupFailures.push(`application ${application.id}: ${errorMessage(error)}`); }
    }

    // 3) Delete the remote applicant profiles (erases PII held by the application service).
    const profiles = await admin.from("job_profiles").select("id").eq("user_id", user.id);
    for (const profile of profiles.data || []) {
      try { await firstApply.deleteApplicant(fastApplyExternalId(user.id, profile.id)); }
      catch (error) { cleanupFailures.push(`applicant ${profile.id}: ${errorMessage(error)}`); }
    }

    if (cleanupFailures.length) {
      console.error(`[account-deletion] user ${user.id}: ${cleanupFailures.length} FastApply cleanup failure(s)`, cleanupFailures);
      const posthogWarn = getPostHogServer();
      if (posthogWarn) {
        posthogWarn.capture({ distinctId: user.id, event: "account_deletion_remote_cleanup_failed", properties: { failures: cleanupFailures.length } });
        await posthogWarn.flush();
      }
    }

    await purgeBucket(admin, "resumes", user.id);
    await purgeBucket(admin, "application-evidence", user.id);

    const posthog = getPostHogServer();
    if (posthog) {
      posthog.capture({ distinctId: user.id, event: "account_deleted" });
      await posthog.flush();
    }

    const result = await admin.auth.admin.deleteUser(user.id);
    if (result.error) throw result.error;

    return context.redirect("/login?deleted=1", 303);
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 500 });
  }
};
