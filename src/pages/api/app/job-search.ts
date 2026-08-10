import type { APIRoute } from "astro";
import { assertSameOrigin, errorMessage, json, list, requireUser } from "../../../lib/api";
import { FirstApplyError } from "../../../lib/first-apply";
import { JobBoardError } from "../../../lib/job-board";
import { sanitizeJobDescription } from "../../../lib/job-description";
import { initialsFor, normalizeBoardJob, salaryLabel } from "../../../lib/board-ingest";
import { searchJobBoard } from "../../../lib/job-board";
import { rateLimit, tooManyRequests } from "../../../lib/rate-limit";
export const prerender = false;
export const maxDuration = 60;
// The board's own worst case is ~24s and the route has 60s, so leave room for the
// widen-the-dates retry without ever letting a request outlive the function.
const BOARD_TIMEOUT_MS = 45000;

/**
 * A board page costs 2-24s upstream, so an instance keeps the last few payloads for a
 * few minutes. This is a request cache, not a corpus: it holds raw board responses keyed
 * by the exact upstream query, never anything member-specific (profile, assistant and
 * blacklist are applied after), and it dies with the instance.
 */
const CACHE_TTL_MS = 180_000;
const CACHE_MAX = 40;
const boardCache = new Map<string, { at: number; payload: any }>();
async function fetchBoard(params: Record<string, string | number>) {
  const key = JSON.stringify(params);
  const hit = boardCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.payload;
  const payload = await searchJobBoard(params, { timeoutMs: BOARD_TIMEOUT_MS });
  boardCache.set(key, { at: Date.now(), payload });
  if (boardCache.size > CACHE_MAX) boardCache.delete(boardCache.keys().next().value!);
  return payload;
}
import { boardSearchParams, dateWindowDays, nextBoardOffset, posted, postedWindow } from "../../../lib/board-search";
function filterFields(body:any){const roles=list(body.roles).slice(0,20),locations=list(body.locations).slice(0,20);if(!roles.length)throw new Error("Add at least one target role.");return{roles,locations,company_blacklist:list(body.companyBlacklist).slice(0,50),employment_types:list(body.employmentTypes),experience_levels:list(body.experienceLevels),work_modes:list(body.workModes),platforms:list(body.platforms).length?list(body.platforms):["greenhouse","lever","ashby","workable","recruitee","workday","smartrecruiters"],date_posted:posted(String(body.datePosted||"7d"))}}
async function contextFor(c:any,id:string,filterId=""){const user=requireUser(c);if(c.locals.demoMode)return{user,profile:{id,name:"Demo",applicant_profile:{}},config:{roles:["Software Engineer"],locations:["Remote"],platforms:["greenhouse","lever"],work_modes:["remote"],employment_types:["full-time"],experience_levels:[],company_blacklist:[],date_posted:"7d"}};const db=c.locals.supabase!,[profileResult,configResult]=await Promise.all([db.from("job_profiles").select("*").eq("id",id).eq("user_id",user.id).single(),filterId?db.from("job_search_filters").select("*").eq("id",filterId).eq("job_profile_id",id).eq("user_id",user.id).maybeSingle():db.from("job_search_filters").select("*").eq("job_profile_id",id).eq("user_id",user.id).eq("is_active",true).order("updated_at",{ascending:false}).limit(1).maybeSingle()]);if(profileResult.error)throw new Error("Job profile not found.");if(configResult.error)throw configResult.error;const profile=profileResult.data,applicant=profile.applicant_profile||{},config=configResult.data||{roles:(profile.target_roles?.length?profile.target_roles:[applicant.headline].filter(Boolean)),locations:(profile.locations?.length?profile.locations:[applicant.currentCity,applicant.country].filter(Boolean)),platforms:["greenhouse","lever","ashby","workable","recruitee","workday","smartrecruiters"],work_modes:applicant.remotePreference?[String(applicant.remotePreference).toLowerCase().replace("on-site","onsite")]:[],employment_types:[],experience_levels:[],company_blacklist:[],date_posted:"7d"};if(!config.roles?.length)throw new Error("Add a target role in Search filters.");return{user,profile,config}}

/** Shapes a normalized board job into the object the jobs page already renders. */
function presentRow(row: any, profileId: string, assistantType: string, profileName: string, filterId: string | null) {
  const description = String(row.description || "");
  return {
    id: `board:${row.external_id}`,
    persisted: false,
    job_profile_id: profileId,
    title: row.title,
    company: row.company,
    companyLogo: row.logo_url || null,
    initials: initialsFor(row.company),
    location: row.location || "",
    employment_type: row.employment_type || null,
    salary: salaryLabel(row.salary),
    description,
    summaryHtml: sanitizeJobDescription(description),
    external_url: row.external_url,
    source: "job_board",
    assistant_type: assistantType,
    status: "search",
    is_saved: false,
    fit_score: null,
    fit_status: "complete",
    fit_analysis: {
      search_filter_id: filterId,
      platform: row.ats || null,
      date_posted: row.posted_at,
      workplace_type: row.workplace_type || null,
      experience_level: row.experience_level || null,
    },
    posted_at: row.posted_at,
    profileName,
  };
}

export const GET:APIRoute=async c=>{
  try{
    const user=requireUser(c);
    const profileId=String(c.url.searchParams.get("profileId")||"");
    if(c.url.searchParams.get("config")==="1"){if(c.locals.demoMode)return json({configs:[]});const r=await c.locals.supabase!.from("job_search_filters").select("*").order("created_at");if(r.error)throw r.error;return json({configs:r.data||[]})}
    if(!profileId)return json({error:"Choose a profile."},{status:400});

    const{profile,config}=await contextFor(c,profileId,String(c.url.searchParams.get("filterId")||""));
    const limit=Math.max(10,Math.min(50,Number(c.url.searchParams.get("limit")||30)));
    const offset=Math.max(0,Number(c.url.searchParams.get("offset")||0));
    if(c.locals.demoMode)return json({total:0,jobs:[],offset,nextOffset:null});

    const db=c.locals.supabase!;
    if(!(await rateLimit(db,`job-search:${user.id}`,{max:60,windowSeconds:60})).allowed)return tooManyRequests();

    const assistantType = c.locals.scoutProfile?.assistant_type === "human" ? "human" : "ai";
    const profileName = profile.name || "General profile";
    const filterId = config.id || null;

    const selected = (config.locations || []).map((value: string) => String(value).trim()).filter(Boolean);
    const days = dateWindowDays(config);
    const window = postedWindow(config);

    /**
     * Search the board itself. Scout used to mirror it into `board_jobs` because the
     * upstream 500d on q/location/work_mode/employment_type; that is no longer true, and
     * the mirror only ever held ~52k of the board's corpus — the same saved search that
     * returns 2,257 jobs live returned 31 from the copy.
     *
     * The date window is applied separately so the same search can be re-run over the
     * whole board when nothing recent matches. `ats` is deliberately not sent: the saved
     * filter carries a seven-platform default that no control in the UI can change, and
     * forwarding it would hide every other source the board carries.
     */
    const runQuery = async (withinDateWindow: boolean, withLocation = true) => {
      const payload = await fetchBoard(boardSearchParams(config, { limit, offset, withinDateWindow, withLocation }));
      return { rows: Array.isArray(payload?.data) ? payload.data : [], meta: payload?.meta || {} };
    };

    const relaxRequested = c.url.searchParams.get("relaxed") === "1";
    let relaxedDate = relaxRequested;
    let result = await runQuery(!relaxRequested);
    // Nothing to widen when the search already asks for any date.
    if (!result.rows.length && !relaxRequested && offset === 0 && window) {
      const widened = await runQuery(false);
      if (widened.rows.length) { result = widened; relaxedDate = true; }
    }

    const blacklist=(config.company_blacklist||[]).map((v:string)=>v.toLowerCase());
    const jobs = result.rows
      .map((raw: any) => normalizeBoardJob(raw))
      .filter((row: any): row is NonNullable<typeof row> => Boolean(row))
      .filter((row: any) => !blacklist.some((name: string) => String(row.company || "").toLowerCase().includes(name)))
      .map((row: any) => presentRow(row, profileId, assistantType, profileName, filterId));

    const nextOffset = nextBoardOffset(result.rows.length, result.meta, limit, offset);
    const total = Number(result.meta.total ?? jobs.length);

    // An empty result reads as a broken product unless it says which filter emptied it.
    // The location list is FastApply's verbatim, and some of its entries are wordings no
    // posting uses, so naming the culprit is what stops a member concluding Scout found
    // nothing for them.
    let emptyReason: string | null = null;
    if (!jobs.length && offset === 0 && selected.length) {
      const withoutLocation = await runQuery(false, false);
      if (withoutLocation.rows.length) {
        emptyReason = `No jobs are listed under ${selected.map((value: string) => `“${value}”`).join(" or ")}. Try a broader location — a country, or the city on its own.`;
      }
    }

    return json({ total, jobs, count: jobs.length, offset, nextOffset, relaxedDate, dateWindowDays: days, emptyReason });
  }catch(error){
    if(error instanceof Response)return error;
    // A country-wide search costs the board 27-41s and 500s outright maybe one time in
    // four, because `location ILIKE '%…%'` has no usable index upstream (job-aggregator
    // src/db/repositories/jobs.js:115). Say that plainly rather than leaking "the job
    // board returned 500": the jobs page prints this text and offers a retry.
    if (error instanceof JobBoardError && error.status >= 500) {
      return json({ error: "The job board took too long on this search. Tap to try again, or narrow the location." }, { status: 503 });
    }
    return json({error:errorMessage(error)},{status:error instanceof FirstApplyError||error instanceof JobBoardError?error.status:400});
  }
};
export const POST:APIRoute=async c=>{try{assertSameOrigin(c);const user=requireUser(c),body=await c.request.json(),profileId=String(body.jobProfileId||""),filterId=String(body.filterId||""),action=String(body.action||"save");if(action==="select"){if(!filterId)return json({error:"Choose a saved search."},{status:400});if(c.locals.demoMode)return json({ok:true});const db=c.locals.supabase!;await db.from("job_search_filters").update({is_active:false}).eq("user_id",user.id);const selected=await db.from("job_search_filters").update({is_active:true,updated_at:new Date().toISOString()}).eq("id",filterId).eq("user_id",user.id).select("*").single();if(selected.error)throw selected.error;return json({ok:true,config:selected.data})}if(!profileId)return json({error:"Choose a profile."},{status:400});const values=filterFields(body),name=String(body.name||"").trim().slice(0,120);if(!name)throw new Error("Give this search a name.");if(c.locals.demoMode)return json({ok:true,config:{job_profile_id:profileId,...values}});const db=c.locals.supabase!,owned=await db.from("job_profiles").select("id").eq("id",profileId).eq("user_id",user.id).single();if(owned.error)return json({error:"Job profile not found."},{status:404});await db.from("job_search_filters").update({is_active:false}).eq("user_id",user.id);const payload={user_id:user.id,job_profile_id:profileId,name,...values,is_active:true,updated_at:new Date().toISOString()};const saved=filterId?await db.from("job_search_filters").update(payload).eq("id",filterId).eq("user_id",user.id).select("*").single():await db.from("job_search_filters").insert(payload).select("*").single();if(saved.error)throw saved.error;return json({ok:true,config:saved.data})}catch(error){if(error instanceof Response)return error;return json({error:errorMessage(error)},{status:400})}};
