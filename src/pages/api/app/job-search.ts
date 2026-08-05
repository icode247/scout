import type { APIRoute } from "astro";
import { assertSameOrigin, errorMessage, json, list, requireUser } from "../../../lib/api";
import { FirstApplyError } from "../../../lib/first-apply";
import { searchJobBoard, JobBoardError } from "../../../lib/job-board";
import { sanitizeJobDescription } from "../../../lib/job-description";
import { initialsFor, normalizeBoardJob, salaryLabel } from "../../../lib/board-ingest";
import { rateLimit, tooManyRequests } from "../../../lib/rate-limit";
export const prerender = false;
export const maxDuration = 60;
const jobType=(v:string)=>v==="full_time"?"full-time":v==="part_time"?"part-time":v;
const posted=(v:string)=>({past_day:"24h",past_week:"7d",past_month:"30d"}[v]||v||"7d");
const POSTED_DAYS:Record<string,number>={"1h":1,"24h":1,"7d":7,"30d":30,"6m":183};
function filterFields(body:any){const roles=list(body.roles).slice(0,20),locations=list(body.locations).slice(0,20);if(!roles.length)throw new Error("Add at least one target role.");return{roles,locations,company_blacklist:list(body.companyBlacklist).slice(0,50),employment_types:list(body.employmentTypes),experience_levels:list(body.experienceLevels),work_modes:list(body.workModes),platforms:list(body.platforms).length?list(body.platforms):["greenhouse","lever","ashby","workable","recruitee","workday","smartrecruiters"],date_posted:posted(String(body.datePosted||"7d"))}}
async function contextFor(c:any,id:string,filterId=""){const user=requireUser(c);if(c.locals.demoMode)return{user,profile:{id,name:"Demo",applicant_profile:{}},config:{roles:["Software Engineer"],locations:["Remote"],platforms:["greenhouse","lever"],work_modes:["remote"],employment_types:["full-time"],experience_levels:[],company_blacklist:[],date_posted:"7d"}};const db=c.locals.supabase!,[profileResult,configResult]=await Promise.all([db.from("job_profiles").select("*").eq("id",id).eq("user_id",user.id).single(),filterId?db.from("job_search_filters").select("*").eq("id",filterId).eq("job_profile_id",id).eq("user_id",user.id).maybeSingle():db.from("job_search_filters").select("*").eq("job_profile_id",id).eq("user_id",user.id).eq("is_active",true).order("updated_at",{ascending:false}).limit(1).maybeSingle()]);if(profileResult.error)throw new Error("Job profile not found.");if(configResult.error)throw configResult.error;const profile=profileResult.data,applicant=profile.applicant_profile||{},config=configResult.data||{roles:(profile.target_roles?.length?profile.target_roles:[applicant.headline].filter(Boolean)),locations:(profile.locations?.length?profile.locations:[applicant.currentCity,applicant.country].filter(Boolean)),platforms:["greenhouse","lever","ashby","workable","recruitee","workday","smartrecruiters"],work_modes:applicant.remotePreference?[String(applicant.remotePreference).toLowerCase().replace("on-site","onsite")]:[],employment_types:[],experience_levels:[],company_blacklist:[],date_posted:"7d"};if(!config.roles?.length)throw new Error("Add a target role in Search filters.");return{user,profile,config}}

/** Shapes a `board_jobs` row into the object the jobs page already renders. */
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

    const locations=(config.locations||[]).filter((v:string)=>!/^remote($| global$| worldwide$)/i.test(v));
    const remoteWorldwide=(config.locations||[]).some((v:string)=>/remote (global|worldwide)/i.test(v));
    const remoteSelected=(config.locations||[]).some((v:string)=>/^remote$/i.test(v));

    // Search Scout's own corpus. The upstream board 500s on every one of these
    // predicates (q/location/work_mode/employment_type), which is why the jobs
    // page was empty in production -- see src/lib/board-ingest.ts.
    let query = db.from("board_jobs").select("*", { count: "estimated" });

    const roles = (config.roles || []).map((role: string) => String(role).trim()).filter(Boolean);
    if (roles.length) {
      // Against the generated `search_vector` column so the GIN index is used;
      // websearch_to_tsquery tolerates the free text members actually type.
      query = query.textSearch("search_vector", roles.map((role: string) => `"${role.replace(/"/g, "")}"`).join(" OR "), { type: "websearch" });
    }

    if (remoteWorldwide) query = query.eq("remote_worldwide", true);
    else if (remoteSelected && !locations.length) query = query.eq("is_remote", true);
    else if (locations.length) {
      const clauses = locations.map((value: string) => `location.ilike.%${String(value).replace(/[%,()]/g, "")}%`);
      if (remoteSelected) clauses.push("is_remote.eq.true");
      query = query.or(clauses.join(","));
    }

    const platforms = (config.platforms || []).filter(Boolean);
    if (platforms.length) query = query.in("ats", platforms);

    const employmentTypes = (config.employment_types || [])
      .map(jobType).map((v: string) => v === "contractor" ? "contract" : v)
      .filter((v: string) => ["full-time","part-time","contract","internship"].includes(v));
    if (employmentTypes.length) {
      query = query.or(employmentTypes.map((value: string) => `employment_type.ilike.${value}`).join(","));
    }

    const experienceLevels = (config.experience_levels || []).filter(Boolean);
    if (experienceLevels.length) query = query.in("experience_level", experienceLevels);

    const days = POSTED_DAYS[posted(config.date_posted)] ?? 7;
    query = query.gte("posted_at", new Date(Date.now() - days * 86400000).toISOString());

    const result = await query.order("posted_at", { ascending: false, nullsFirst: false }).range(offset, offset + limit - 1);
    if (result.error) throw result.error;

    const blacklist=(config.company_blacklist||[]).map((v:string)=>v.toLowerCase());
    let jobs = (result.data || [])
      .filter((row: any) => !blacklist.some((name: string) => String(row.company || "").toLowerCase().includes(name)))
      .map((row: any) => presentRow(row, profileId, assistantType, profileName, filterId));

    let nextOffset: number | null = (result.data || []).length === limit ? offset + limit : null;
    let total = Number(result.count ?? jobs.length);

    // Cold start: the corpus is still filling on a fresh deployment. Fall back to
    // one live board call using ONLY the parameters that do not time out, so the
    // page is never blank while ingestion catches up.
    if (!jobs.length && offset === 0) {
      try {
        const payload = await searchJobBoard({ limit, offset: 0, include: "description" });
        const rows = (Array.isArray(payload?.data) ? payload.data : []).map(normalizeBoardJob).filter(Boolean);
        jobs = rows.map((row: any) => presentRow(row, profileId, assistantType, profileName, filterId));
        total = jobs.length;
        nextOffset = null;
      } catch {
        // The board is down as well; an empty list is the honest answer.
      }
    }

    return json({ total, jobs, count: jobs.length, offset, nextOffset });
  }catch(error){
    if(error instanceof Response)return error;
    return json({error:errorMessage(error)},{status:error instanceof FirstApplyError||error instanceof JobBoardError?error.status:400});
  }
};
export const POST:APIRoute=async c=>{try{assertSameOrigin(c);const user=requireUser(c),body=await c.request.json(),profileId=String(body.jobProfileId||""),filterId=String(body.filterId||""),action=String(body.action||"save");if(action==="select"){if(!filterId)return json({error:"Choose a saved search."},{status:400});if(c.locals.demoMode)return json({ok:true});const db=c.locals.supabase!;await db.from("job_search_filters").update({is_active:false}).eq("user_id",user.id);const selected=await db.from("job_search_filters").update({is_active:true,updated_at:new Date().toISOString()}).eq("id",filterId).eq("user_id",user.id).select("*").single();if(selected.error)throw selected.error;return json({ok:true,config:selected.data})}if(!profileId)return json({error:"Choose a profile."},{status:400});const values=filterFields(body),name=String(body.name||"").trim().slice(0,120);if(!name)throw new Error("Give this search a name.");if(c.locals.demoMode)return json({ok:true,config:{job_profile_id:profileId,...values}});const db=c.locals.supabase!,owned=await db.from("job_profiles").select("id").eq("id",profileId).eq("user_id",user.id).single();if(owned.error)return json({error:"Job profile not found."},{status:404});await db.from("job_search_filters").update({is_active:false}).eq("user_id",user.id);const payload={user_id:user.id,job_profile_id:profileId,name,...values,is_active:true,updated_at:new Date().toISOString()};const saved=filterId?await db.from("job_search_filters").update(payload).eq("id",filterId).eq("user_id",user.id).select("*").single():await db.from("job_search_filters").insert(payload).select("*").single();if(saved.error)throw saved.error;return json({ok:true,config:saved.data})}catch(error){if(error instanceof Response)return error;return json({error:errorMessage(error)},{status:400})}};
