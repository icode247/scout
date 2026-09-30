import type { Application, BootstrapData, Job } from './types';

const profileId = 'demo-product-profile';
const resumeId = 'demo-resume';
const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

export const demoJobs: Job[] = [
  {
    id: 'board:canopy-growth-pm', persisted: false,
    title: 'Senior Product Manager, Growth', company: 'Canopy Systems',
    location: 'Remote · United States', employment_type: 'full-time', salary: '$150k–$185k',
    description: 'Lead activation and retention strategy for a collaborative workflow platform. You will partner with design, data, and engineering to turn customer insight into focused experiments and durable product improvements.',
    external_url: 'https://example.com/jobs/canopy-growth', source: 'job_board', status: 'search', is_saved: false,
    fit_score: null, fit_status: 'complete', assistant_type: 'ai', job_profile_id: profileId,
    fit_analysis: { summary: 'Strong overlap with your product-led growth and cross-functional launch experience.', matched_skills: ['Product strategy', 'Growth'], workplace_type: 'remote', platform: 'greenhouse', date_posted: isoDaysAgo(1) },
    posted_at: isoDaysAgo(1),
  },
  {
    id: 'board:northstar-platform', persisted: false,
    title: 'Principal Product Manager', company: 'Northstar Health',
    location: 'New York, NY · Hybrid', employment_type: 'full-time', salary: '$170k–$205k',
    description: 'Own a platform roadmap used by clinical and operations teams. Set product direction, simplify complex workflows, and guide a cross-functional group through discovery and delivery.',
    external_url: 'https://example.com/jobs/northstar-platform', source: 'job_board', status: 'search', is_saved: true,
    fit_score: null, fit_status: 'complete', assistant_type: 'ai', job_profile_id: profileId,
    fit_analysis: { summary: 'Your platform work and healthcare operations experience map directly to the role.', matched_skills: ['Platform', 'Leadership'], workplace_type: 'hybrid', platform: 'lever', date_posted: isoDaysAgo(2) },
    posted_at: isoDaysAgo(2),
  },
  {
    id: 'board:relay-ai-product', persisted: false,
    title: 'Product Lead, AI Workflows', company: 'Relay Works',
    location: 'Remote · Americas', employment_type: 'full-time', salary: '$155k–$190k',
    description: 'Build practical AI workflow products for operations teams. Define the product thesis, work closely with applied AI engineers, and create a trusted experience for high-stakes business tasks.',
    external_url: 'https://example.com/jobs/relay-ai', source: 'job_board', status: 'search', is_saved: false,
    fit_score: null, fit_status: 'complete', assistant_type: 'ai', job_profile_id: profileId,
    fit_analysis: { summary: 'A good fit for your automation, operations, and zero-to-one product background.', matched_skills: ['AI products', '0→1'], workplace_type: 'remote', platform: 'ashby', date_posted: isoDaysAgo(3) },
    posted_at: isoDaysAgo(3),
  },
  {
    id: 'board:harbor-product-ops', persisted: false,
    title: 'Director, Product Operations', company: 'Harbor Cloud',
    location: 'Austin, TX · Hybrid', employment_type: 'full-time', salary: '$145k–$175k',
    description: 'Build the operating system for a growing product organization, including planning, research operations, launch readiness, and portfolio reporting.',
    external_url: 'https://example.com/jobs/harbor-ops', source: 'job_board', status: 'search', is_saved: false,
    fit_score: null, fit_status: 'complete', assistant_type: 'ai', job_profile_id: profileId,
    fit_analysis: { summary: 'Your planning systems and launch operations experience match the core mandate.', matched_skills: ['Operations', 'Planning'], workplace_type: 'hybrid', platform: 'workday', date_posted: isoDaysAgo(4) },
    posted_at: isoDaysAgo(4),
  },
  {
    id: 'board:fieldwork-mobile', persisted: false,
    title: 'Senior Product Manager, Mobile', company: 'Fieldwork',
    location: 'Remote · US / Canada', employment_type: 'full-time', salary: '$140k–$172k',
    description: 'Own the mobile experience for distributed teams in the field. Improve daily workflows, offline reliability, and the quality of operational data captured on the go.',
    external_url: 'https://example.com/jobs/fieldwork-mobile', source: 'job_board', status: 'search', is_saved: false,
    fit_score: null, fit_status: 'complete', assistant_type: 'ai', job_profile_id: profileId,
    fit_analysis: { summary: 'Your mobile product and workflow design experience are both relevant.', matched_skills: ['Mobile', 'B2B SaaS'], workplace_type: 'remote', platform: 'workable', date_posted: isoDaysAgo(5) },
    posted_at: isoDaysAgo(5),
  },
];

const applicationJobs: Job[] = [
  {
    ...demoJobs[1], id: 'demo-job-northstar', persisted: true, status: 'applied',
    created_at: isoDaysAgo(7),
  },
  {
    ...demoJobs[3], id: 'demo-job-pilot', persisted: true, title: 'Product Operations Lead', company: 'Pilot Fiber', status: 'preparing',
    created_at: isoDaysAgo(2),
  },
  {
    ...demoJobs[2], id: 'demo-job-apricot', persisted: true, title: 'Group Product Manager', company: 'Apricot', status: 'interview',
    created_at: isoDaysAgo(14),
  },
];

const applications: Application[] = [
  {
    id: 'demo-application-pilot', job_id: applicationJobs[1].id, job_profile_id: profileId, resume_id: resumeId,
    assistant_type: 'ai', status: 'preparing', submitted_at: null, created_at: isoDaysAgo(1),
    notes: 'Scout is tailoring your product operations resume and checking the application questions.',
    answer_evidence: [], evidence: [], job: applicationJobs[1],
    jobProfile: null, resume: null,
  },
  {
    id: 'demo-application-northstar', job_id: applicationJobs[0].id, job_profile_id: profileId, resume_id: resumeId,
    assistant_type: 'ai', status: 'evidence_ready', submitted_at: isoDaysAgo(4), created_at: isoDaysAgo(5),
    notes: 'Submitted with your approved salary range and the platform leadership version of your resume.',
    answer_evidence: [{ label: 'Work authorization' }, { label: 'Salary expectation' }],
    evidence: [
      { id: 'demo-evidence-1', label: 'Submission receipt', mime_type: 'image/png', created_at: isoDaysAgo(4) },
      { id: 'demo-evidence-2', label: 'Application answers', mime_type: 'application/pdf', created_at: isoDaysAgo(4) },
    ],
    job: applicationJobs[0], jobProfile: null, resume: null,
  },
  {
    id: 'demo-application-apricot', job_id: applicationJobs[2].id, job_profile_id: profileId, resume_id: resumeId,
    assistant_type: 'ai', status: 'interview', submitted_at: isoDaysAgo(12), created_at: isoDaysAgo(13),
    notes: 'Interview marked from your Scout application desk. Good luck — this is the work the queue is for.',
    answer_evidence: [], evidence: [], job: applicationJobs[2], jobProfile: null, resume: null,
  },
];

export function createDemoBootstrap(): BootstrapData {
  const jobProfile = {
    id: profileId, name: 'Product leadership', assistant_type: 'ai' as const,
    target_roles: ['Senior Product Manager', 'Product Lead'], locations: ['Remote', 'United States'],
    salary_min: 140000, resume_behavior: 'tailor' as const, active: true, resume_ids: [resumeId],
  };
  const resume = { id: resumeId, name: 'Alex_Kim_Product.pdf', kind: 'original' as const, storage_path: null, extraction_status: 'complete' as const, created_at: isoDaysAgo(45) };

  return {
    profile: {
      user_id: 'demo-user', full_name: 'Alex Kim', email: 'alex@example.com', assistant_type: 'ai',
      onboarding_complete: true, assistant_name: 'Scout AI', whatsapp_url: null, whatsapp_phone: null,
    },
    jobProfiles: [jobProfile], resumes: [resume], jobs: applicationJobs,
    applications: applications.map((application) => ({ ...application, jobProfile, resume })),
    entitlement: {
      paid: true, lane: 'ai', planCode: 'ai_plus', status: 'active', applicationsUsed: 38,
      applicationsQuota: 200, applicationsRemaining: 162, canApply: true, canActivateAgent: true,
      hasHumanAssistant: false, profileLimit: 3, reason: null,
    },
    syncedAt: new Date().toISOString(),
  };
}

