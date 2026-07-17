import type { SupabaseClient, User } from "@supabase/supabase-js";
export async function fastApplyInlineProfile(supabase:SupabaseClient,user:User,profile:any){
 const resumeId=profile.resume_id;let resume:any=null,signedUrl:string|undefined;
 if(resumeId){const result=await supabase.from("resumes").select("name,storage_path,extracted_data").eq("id",resumeId).eq("user_id",user.id).maybeSingle();resume=result.data;if(resume?.storage_path){const signed=await supabase.storage.from("resumes").createSignedUrl(resume.storage_path,60*60*24*7);signedUrl=signed.data?.signedUrl}}
 const d=resume?.extracted_data?.data||resume?.extracted_data||{},parts=String(d.name||d.contact?.name||"").trim().split(/\s+/);
 return{name:profile.name,firstName:d.firstName||d.contact?.firstName||parts[0]||"Scout",lastName:d.lastName||d.contact?.lastName||parts.slice(1).join(" ")||"Member",email:d.email||d.contact?.email||user.email,
 phoneCountryCode:d.phoneCountryCode,phoneNumber:d.phoneNumber||d.contact?.phone,currentCity:d.currentCity||d.contact?.city,state:d.state,country:d.country,timezone:d.timezone,
 headline:d.headline||profile.target_roles?.[0],summary:d.summary,yearsOfExperience:d.yearsOfExperience,desiredSalary:profile.salary_min?String(profile.salary_min):undefined,
 linkedinURL:d.linkedinURL||d.contact?.linkedin,githubURL:d.githubURL||d.contact?.github,website:d.website||d.contact?.website,workAuthorization:d.workAuthorization,requiresSponsorship:d.requiresSponsorship,
 skills:d.skills||[],education:d.education||[],experience:d.experience||d.roles||[],projects:d.projects||[],certifications:d.certifications||[],languages:d.languages||[],
 ...(signedUrl?{resume:{fileUrl:signedUrl,fileName:resume.name||"resume.pdf",mimeType:String(resume.name||"").toLowerCase().endsWith(".docx")?"application/vnd.openxmlformats-officedocument.wordprocessingml.document":"application/pdf"}}:{})};
}
