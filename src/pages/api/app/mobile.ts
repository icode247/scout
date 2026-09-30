import type { APIRoute } from "astro";
import { json, requireUser } from "../../../lib/api";
import { applicationRows, loadScoutData } from "../../../lib/scout-data";

export const prerender = false;

/**
 * A compact bootstrap payload for native clients. Authentication, ownership,
 * normalization, and entitlement evaluation all stay on the existing Scout
 * backend rather than being reimplemented in the app.
 */
export const GET: APIRoute = async (context) => {
  try {
    const user = requireUser(context);
    const data = await loadScoutData(
      user,
      context.locals.supabase,
      context.locals.demoMode,
      context.locals.scoutProfile,
    );

    return json({
      profile: data.profile,
      jobProfiles: data.jobProfiles.filter((profile) => profile.active),
      resumes: data.resumes,
      jobs: data.jobs.slice(0, 250),
      applications: applicationRows(data).slice(0, 250),
      entitlement: context.locals.entitlement,
      syncedAt: new Date().toISOString(),
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Unable to load Scout";
    return json({ error: message }, { status: 500 });
  }
};
