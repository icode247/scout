import type{APIRoute}from"astro";import{assertSameOrigin,errorMessage,json,requireUser}from"../../../lib/api";import{firstApply,FirstApplyError}from"../../../lib/first-apply";import{ensureFastApplyApplicant}from"../../../lib/fastapply-applicant";import{getPostHogServer}from"../../../lib/posthog-server";import{rateLimit,tooManyRequests}from"../../../lib/rate-limit";import{assertCanApply}from"../../../lib/entitlements";export const prerender=false;export const maxDuration=120;
const jobType=(v:string)=>v==="full_time"?"full-time":v==="part_time"?"part-time":v;const posted=(v:string)=>({past_day:"24h",past_week:"7d",past_month:"30d"}[v]||v||"7d");function requireAccount(c:any){return requireUser(c)}async function ctx(c:any,id:string){const user=requireAccount(c);if(c.locals.demoMode)return{user,profile:{id,name:"Demo"},config:{roles:["Software Engineer"],locations:["Remote"],platforms:["greenhouse","lever"],work_modes:["remote"],employment_types:["full-time"],experience_levels:["mid"],company_blacklist:[],date_posted:"7d"}};const db=c.locals.supabase!,[p,x]=await Promise.all([db.from("job_profiles").select("*").eq("id",id).eq("user_id",user.id).single(),db.from("ai_agent_configs").select("*").eq("job_profile_id",id).eq("user_id",user.id).maybeSingle()]);if(p.error)throw new Error("Job profile not found.");if(x.error)throw x.error;const applicant=p.data.applicant_profile||{},config=x.data||{roles:(p.data.target_roles?.length?p.data.target_roles:[applicant.headline].filter(Boolean)),locations:(p.data.locations?.length?p.data.locations:[applicant.currentCity,applicant.country].filter(Boolean)),platforms:["greenhouse","lever","ashby","workable","recruitee","workday","smartrecruiters"],work_modes:applicant.remotePreference?[String(applicant.remotePreference).toLowerCase().replace("on-site","onsite")]:[],employment_types:[],experience_levels:[],company_blacklist:[],date_posted:"past_week",accuracy_threshold:70};if(!config.roles?.length)throw new Error("Add a professional headline to this job profile so Scout can find matching jobs.");return{user,profile:p.data,config}}const detail=(x:any)=>x?.job||x||{},urlOf=(x:any)=>{const j=detail(x);return String(j.jobUrl||j.applyUrl||j.apply_url||j.url||j.external_url||"")};
export const GET:APIRoute=async c=>{try{const id=String(c.url.searchParams.get("profileId")||"");if(!id)return json({error:"Choose a profile."},{status:400});const{user,profile,config}=await ctx(c,id);if(c.locals.demoMode)return json({jobs:[],total:0,imported:0});const db=c.locals.supabase!;if(!(await rateLimit(db,`ai-match:${user.id}`,{max:15,windowSeconds:60})).allowed)return tooManyRequests();const{externalId}=await ensureFastApplyApplicant(db,user,profile),matched=await firstApply.matchApplicant(externalId,{keywords:config.roles,locations:config.locations,platforms:config.platforms,workModes:config.work_modes,jobTypes:(config.employment_types||[]).map(jobType),experienceLevels:config.experience_levels,datePosted:posted(config.date_posted),companyBlacklist:config.company_blacklist}),allJobs=Array.isArray(matched)?matched:[],jobs=allJobs.filter((result:any)=>Number(result.matchPercentage||0)>=Number(config.accuracy_threshold||70));let imported=0;for(const result of jobs){const j=detail(result),url=urlOf(result);if(!url)continue;const old=await db.from("jobs").select("id,status,is_saved").eq("user_id",user.id).eq("external_url",url).maybeSingle(),values={job_profile_id:id,title:String(j.jobTitle||j.title||"Untitled role").slice(0,180),company:String(j.company||"Company").slice(0,180),location:String(j.location||"").slice(0,240),employment_type:j.employmentType||j.jobType||null,salary:j.salary||null,description:String(j.description||result.summary||"").slice(0,50000),external_url:url,source:"fastapply_match",assistant_type:c.locals.scoutProfile?.assistant_type==="human"?"human":"ai",fit_score:Math.max(0,Math.min(100,Number(result.matchPercentage||0))),fit_status:"complete",fit_analysis:{summary:result.summary||result.reason,match_reason:result.reason,can_apply:result.canApply,remote_job_id:j.id||j.jobId,platform:j.platform}};if(old.error)throw old.error;if(old.data?.id){const q=await db.from("jobs").update(values).eq("id",old.data.id);if(q.error)throw q.error}else{const q=await db.from("jobs").insert({user_id:user.id,...values,status:"saved",is_saved:false});if(q.error)throw q.error;imported++}}return json({jobs,total:jobs.length,imported})}catch(e){if(e instanceof Response)return e;return json({error:errorMessage(e)},{status:e instanceof FirstApplyError?e.status:400})}};
export const POST: APIRoute = async (c) => {
  try {
    assertSameOrigin(c);
    if (c.locals.scoutProfile?.assistant_type !== "ai") {
      return json({ error: "Human Assistant jobs must be sent through the assistant queue." }, { status: 403 });
    }
    // Paywall. Applying is the billable action, so it is refused here rather than
    // in the UI — a client-side check would be trivially bypassed.
    assertCanApply(c.locals.entitlement);
    const b = await c.request.json();
    const id = String(b.profileId || b.job_profile_id || "");
    const { user, profile } = await ctx(c, id);
    const url = String(b.url || b.applyUrl || b.external_url || "");
    if (!url) throw new Error("This job does not include an application URL.");
    if (c.locals.demoMode) return json({ ok: true, application: { automationId: crypto.randomUUID(), queued: true } });

    const db = c.locals.supabase!;
    // Guard the billable apply action against runaway/abusive submission rates.
    if (!(await rateLimit(db, `ai-apply:${user.id}`, { max: 20, windowSeconds: 60 })).allowed) return tooManyRequests();

    const { externalId, resume } = await ensureFastApplyApplicant(db, user, profile);
    const now = () => new Date().toISOString();

    // Resolve (or create) the local job row BEFORE any billable call, so the application can
    // be keyed on job_id and deduplicated by the unique(user_id, job_id) constraint.
    let jobId = String(b.localId || "");
    if (!jobId) {
      const existing = await db.from("jobs").select("id").eq("user_id", user.id).eq("external_url", url).maybeSingle();
      if (existing.error) throw existing.error;
      jobId = existing.data?.id || "";
    }
    if (!jobId) {
      const row = await db.from("jobs").insert({
        user_id: user.id, job_profile_id: id,
        title: b.title || "Untitled role", company: b.company || "Company", location: b.location || "",
        external_url: url, source: "fastapply_match", status: "delegated", assistant_type: "ai",
      }).select("id").single();
      if (row.error) throw row.error;
      jobId = row.data.id;
    } else {
      const q = await db.from("jobs").update({ status: "delegated", updated_at: now() }).eq("id", jobId).eq("user_id", user.id);
      if (q.error) throw q.error;
    }

    // Idempotency claim. The unique(user_id, job_id) constraint means concurrent double-submits
    // collapse to a single winner; the loser takes the "already exists" branch below and never
    // fires a second billable automation.
    const claim = await db.from("applications").upsert({
      user_id: user.id, job_id: jobId, job_profile_id: id, resume_id: resume.id,
      assistant_type: "ai", status: "preparing", remote_status: "queued",
      notes: "Queued by Scout AI.", updated_at: now(),
    }, { onConflict: "user_id,job_id", ignoreDuplicates: true }).select("id").maybeSingle();
    if (claim.error) throw claim.error;

    if (!claim.data) {
      // A row already exists — decide whether an application is genuinely in flight (skip and
      // return idempotently) or in a terminal/failed state that a fresh apply may retry.
      const existing = await db.from("applications")
        .select("id,status,remote_status,remote_automation_id")
        .eq("user_id", user.id).eq("job_id", jobId).maybeSingle();
      if (existing.error) throw existing.error;
      const row = existing.data;
      const inFlight = row != null && (
        Boolean(row.remote_automation_id) ||
        ["submitted", "evidence_ready", "interview"].includes(row.status) ||
        ["queued", "pending"].includes(String(row.remote_status || ""))
      );
      if (!row || inFlight) {
        return json({ ok: true, application: { automationId: row?.remote_automation_id || null, queued: true, deduplicated: true } });
      }
      // Terminal/failed: compare-and-swap on the prior remote_status so exactly one concurrent
      // retry re-claims the row and proceeds to the billable call.
      let reclaimQuery = db.from("applications")
        .update({ status: "preparing", remote_status: "queued", remote_automation_id: null, resume_id: resume.id, updated_at: now() })
        .eq("id", row.id);
      reclaimQuery = row.remote_status == null ? reclaimQuery.is("remote_status", null) : reclaimQuery.eq("remote_status", row.remote_status);
      const reclaim = await reclaimQuery.select("id").maybeSingle();
      if (reclaim.error) throw reclaim.error;
      if (!reclaim.data) return json({ ok: true, application: { automationId: null, queued: true, deduplicated: true } });
    }

    // Eligibility check (non-billable) only after we own the claim.
    const eligible = await firstApply.canApply(externalId, url, b.id ? String(b.id) : undefined);
    if (eligible?.canApply === false) {
      await db.from("applications").update({ remote_status: "ineligible", updated_at: now() }).eq("user_id", user.id).eq("job_id", jobId);
      throw new Error(eligible.reason || "This job cannot be applied to.");
    }

    // Billable automation — reached at most once per (user, job) claim.
    let remote: { automationId: string; queued: boolean };
    try {
      remote = await firstApply.applyApplicant(externalId, url);
    } catch (error) {
      // Release the claim so the user can retry; the row is left in a non-in-flight state.
      await db.from("applications").update({ remote_status: "failed", updated_at: now() }).eq("user_id", user.id).eq("job_id", jobId);
      throw error;
    }

    const finalize = await db.from("applications").update({
      remote_automation_id: remote.automationId, remote_status: "pending", updated_at: now(),
    }).eq("user_id", user.id).eq("job_id", jobId);
    if (finalize.error) throw finalize.error;

    // Quota is consumed only once the automation is genuinely queued, so a failed
    // submission never costs the member an application.
    await db.rpc("increment_application_usage", { p_user_id: user.id });

    const phApply = getPostHogServer();
    if (phApply) {
      phApply.capture({ distinctId: user.id, event: "job_applied_via_ai", properties: { job_profile_id: id, has_session_id: !!c.request.headers.get("X-PostHog-Session-Id") } });
      await phApply.flush();
    }
    return json({ ok: true, application: remote });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: errorMessage(e) }, { status: e instanceof FirstApplyError ? e.status : 400 });
  }
};
