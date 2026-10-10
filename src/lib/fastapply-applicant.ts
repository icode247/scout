import type{SupabaseClient,User}from"@supabase/supabase-js";import{FirstApplyError,firstApply}from"./first-apply";import{withFastApplyBlanks,fastApplyProfilePayload}from"./applicant-payload";
import{stopProfileAutomation,syncApplicantPlanLimits}from"./fastapply-limits"
import{syncApplicantMedia}from"./fastapply-media"
export const fastApplyExternalId=(userId:string,profileId:string)=>`${userId}:${profileId}`;
// The payload builder is pure and lives in applicant-payload.ts (the browser editor runs the gate on it); re-exported for existing callers.
export{fastApplyProfilePayload,canonicalSecurityClearance,wholeYearsOfExperience,isoDateOfBirth}from"./applicant-payload";
async function loadPrimaryResume(supabase:SupabaseClient,userId:string,profileId:string){const link=await supabase.from("job_profile_resumes").select("resume_id").eq("user_id",userId).eq("job_profile_id",profileId).order("is_primary",{ascending:false}).order("created_at",{ascending:false}).limit(1).maybeSingle();if(link.error)throw link.error;if(!link.data?.resume_id)return{resume:null,reason:"unattached" as const};const result=await supabase.from("resumes").select("id,name,storage_path,extracted_data").eq("id",link.data.resume_id).eq("user_id",userId).single();if(result.error||!result.data)return{resume:null,reason:"unreadable" as const};return{resume:result.data,reason:null};}
/** Tolerant lookup for the profile-completeness gate, which reports a missing resume rather than throwing. */
export async function findPrimaryResume(supabase:SupabaseClient,userId:string,profileId:string){return(await loadPrimaryResume(supabase,userId,profileId)).resume}
export async function primaryResumeForProfile(supabase:SupabaseClient,userId:string,profileId:string){const{resume,reason}=await loadPrimaryResume(supabase,userId,profileId);if(reason==="unattached")throw new Error("Add a resume to this job profile before using Scout AI.");if(!resume)throw new Error("Scout could not find this profile's resume.");return resume;}
export async function ensureFastApplyApplicant(supabase:SupabaseClient,user:User,profile:any){const externalId=fastApplyExternalId(user.id,profile.id),resume=await primaryResumeForProfile(supabase,user.id,profile.id),sync=await supabase.from("fastapply_applicant_sync").select("*").eq("user_id",user.id).eq("job_profile_id",profile.id).maybeSingle();if(sync.error)throw sync.error;try{/* FastApply merges the profile it is sent, so every answer Scout owns goes, blank when the member removed it (applicant-payload.ts). */await firstApply.upsertApplicantProfile(externalId,withFastApplyBlanks(fastApplyProfilePayload(user,profile,resume)));
/* A brand-new applicant carries the customer's plan from its first minute (lib/fastapply-limits.ts). Best effort here: activation pushes again and refuses to start on failure, and every billing event pushes too. */if(!sync.data)await syncApplicantPlanLimits(supabase,user.id,externalId).catch(()=>null);let remoteResumeId=sync.data?.remote_resume_id||null;/* A local sync row is not evidence the remote still holds the resume. If the applicant vanished upstream — deleted, or the api key now points at a different account — the upsert above recreates the profile, but an unchanged resume id would skip the upload and leave remote_resume_id pointing at nothing. */let remoteHasResume=false;if(remoteResumeId&&sync.data?.resume_id===resume.id){try{const remote:any[]=await firstApply.listApplicantResumes(externalId)||[];remoteHasResume=remote.some((item:any)=>String(item?.id||item?.resumeId||"")===String(remoteResumeId))}catch{remoteHasResume=false}}if(sync.data?.resume_id!==resume.id||!remoteHasResume){const downloaded=await supabase.storage.from("resumes").download(resume.storage_path);if(downloaded.error||!downloaded.data)throw new Error("Scout could not read this profile's resume.");const uploaded:any=await firstApply.uploadApplicantResume(externalId,downloaded.data,resume.name||"resume.pdf",`Scout resume ${resume.id}`);remoteResumeId=uploaded?.id||uploaded?.resumeId||null}const now=new Date().toISOString(),saved=await supabase.from("fastapply_applicant_sync").upsert({user_id:user.id,job_profile_id:profile.id,external_id:externalId,resume_id:resume.id,remote_resume_id:remoteResumeId,profile_synced_at:now,resume_synced_at:sync.data?.resume_id===resume.id?sync.data?.resume_synced_at:now,last_error:null,updated_at:now},{onConflict:"user_id,job_profile_id"});if(saved.error)throw saved.error
/* The photo and showcase video follow the profile (lib/fastapply-media.ts). Best effort: a failure is recorded on the sync row and the profile still applies without them. */await syncApplicantMedia(supabase,user.id,profile,externalId).catch((error)=>console.error("[fastapply-media] sync failed",error))
return{externalId,resume,remoteResumeId}}catch(error){await supabase.from("fastapply_applicant_sync").upsert({user_id:user.id,job_profile_id:profile.id,external_id:externalId,resume_id:resume.id,last_error:error instanceof Error?error.message:String(error),updated_at:new Date().toISOString()},{onConflict:"user_id,job_profile_id"});throw error}}


/**
 * Before a job profile is deleted: its Scout AI automation is cancelled and FastApply's applicant
 * for it is deleted (FastApply disables it and removes its photo and video). The automation's
 * settings row and the sync row go with the profile (on delete cascade), after which nothing could
 * reach either. Throws when FastApply did not confirm, so the deletion is refused and can be retried.
 */
export async function retireProfileUpstream(supabase: SupabaseClient, userId: string, profileId: string): Promise<void> {
  await stopProfileAutomation(supabase, userId, profileId);
  const sync = await supabase.from("fastapply_applicant_sync").select("external_id").eq("user_id", userId).eq("job_profile_id", profileId).maybeSingle();
  if (sync.error) throw new Error(sync.error.message);
  // Never synced: FastApply holds nothing for this profile.
  if (!sync.data) return;
  try {
    await firstApply.deleteApplicant(String((sync.data as { external_id?: string }).external_id || fastApplyExternalId(userId, profileId)));
  } catch (error) {
    if (!(error instanceof FirstApplyError && error.status === 404)) throw error;
  }
}
