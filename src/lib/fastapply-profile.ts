import type { SupabaseClient, User } from "@supabase/supabase-js";
import { normalizeResumeExtraction } from "./resume-extraction";
export async function fastApplyInlineProfile(supabase:SupabaseClient,user:User,profile:any){
 const resumeId=profile.resume_id;let resume:any=null,signedUrl:string|undefined;
 if(resumeId){const result=await supabase.from("resumes").select("name,storage_path,extracted_data").eq("id",resumeId).eq("user_id",user.id).maybeSingle();resume=result.data;if(resume?.storage_path){const signed=await supabase.storage.from("resumes").createSignedUrl(resume.storage_path,60*60*24*7);signedUrl=signed.data?.signedUrl}}
 const d=normalizeResumeExtraction(resume?.extracted_data);
 return{name:profile.name,firstName:d.firstName||"Scout",lastName:d.lastName||"Member",email:d.email||user.email,
 phoneCountryCode:d.phoneCountryCode,phoneNumber:d.phoneNumber,streetAddress:d.streetAddress,currentCity:d.currentCity,state:d.state,zipcode:d.zipcode,country:d.country,timezone:d.timezone,
 headline:d.headline||profile.target_roles?.[0],summary:d.summary,yearsOfExperience:d.yearsOfExperience,desiredSalary:profile.salary_min?String(profile.salary_min):d.desiredSalary,
 linkedinURL:d.linkedinURL,githubURL:d.githubURL,website:d.website,workAuthorization:d.workAuthorization,requiresSponsorship:d.requiresSponsorship,securityClearance:d.securityClearance,
 skills:d.skills||[],education:d.education||[],experience:d.experience||[],projects:d.projects||[],certifications:d.certifications||[],languages:d.languages||[],
 ...(signedUrl?{resume:{fileUrl:signedUrl,fileName:resume.name||"resume.pdf",mimeType:String(resume.name||"").toLowerCase().endsWith(".docx")?"application/vnd.openxmlformats-officedocument.wordprocessingml.document":"application/pdf"}}:{})};
}
