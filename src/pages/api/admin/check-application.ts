import type { APIRoute } from "astro";
import { assertCanWorkClient, createAdminClient, requireStaff } from "../../../lib/admin";
import { errorMessage, json } from "../../../lib/api";
import { applicationCheckVerdict, findApplicationMatches, jobLinkKey, type ClientApplicationRow, type ClientJobRow } from "../../../lib/application-check";

export const prerender = false;

const param = (context: Parameters<APIRoute>[0], key: string, max = 500) => (context.url.searchParams.get(key) || "").trim().slice(0, max);

/**
 * Answers "has this client already applied here?" before an assistant applies.
 * Pass `user_id` and a `job_url`, or a `title` and `company`, or all three. The
 * answer covers every lane (requested, found by the assistant, Scout AI, the
 * client's own saves) so the assistant never doubles up.
 */
export const GET: APIRoute = async (context) => {
  try {
    const staff = requireStaff(context);
    const userId = param(context, "user_id", 64);
    const jobUrl = param(context, "job_url", 2000);
    const title = param(context, "title", 200);
    const company = param(context, "company", 200);
    if (!userId) return json({ error: "Client is required" }, { status: 400 });
    if (!jobUrl && !(title && company)) return json({ error: "Paste the job link, or enter the job title and company" }, { status: 400 });
    if (jobUrl && !jobLinkKey(jobUrl)) return json({ error: "Enter a valid job link" }, { status: 400 });

    const admin = createAdminClient();
    await assertCanWorkClient(staff, admin, userId);
    const [jobs, applications] = await Promise.all([
      admin.from("jobs").select("id,title,company,external_url,status,source,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(5000),
      admin.from("applications").select("id,job_id,status,assistant_type,submitted_at,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(5000),
    ]);
    if (jobs.error) throw jobs.error;
    if (applications.error) throw applications.error;

    const matches = findApplicationMatches({ jobUrl, title, company }, (jobs.data || []) as ClientJobRow[], (applications.data || []) as ClientApplicationRow[]);
    return json({ ...applicationCheckVerdict(matches), matches });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 500 });
  }
};
