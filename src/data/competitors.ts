export type Competitor = {
  slug: string;
  name: string;
  category: string;
  summary: string;
  bestFor: string;
  scoutBestFor: string;
  competitorStrengths: string[];
  scoutDifferences: string[];
  rows: Array<[string, string, string]>;
  sourceUrl: string;
  sourceLabel: string;
  researchChecked?: string;
  buyingQuestions?: Array<{ question: string; answer: string }>;
};

export const competitors: Competitor[] = [
  {
    slug: "scale-jobs-alternative",
    name: "scale.jobs",
    category: "Human application service",
    summary:
      "scale.jobs and Scout both offer human help with job applications. The main difference is choice: Scout keeps a Human Assistant and a lower-cost AI Assistant on the same profile and tracking system.",
    bestFor:
      "Choose scale.jobs when you specifically want a one-time package of human-completed applications and its current package structure fits your campaign.",
    scoutBestFor:
      "Choose Scout when you want to select either human or AI fulfillment, manage multiple job profiles, delegate jobs from the web, and keep the workflow in one dashboard.",
    competitorStrengths: [
      "Human assistants fill and submit job applications.",
      "Current plans are sold as one-time application packages rather than recurring subscriptions.",
      "Its official pricing page lists job sourcing, custom cover letters, team chat, and optional AI-tailored resumes.",
    ],
    scoutDifferences: [
      "Two distinct fulfillment lanes: Human Assistant or AI Assistant.",
      "Dedicated WhatsApp communication and detailed form evidence on Human plans.",
      "Shared profiles, resume choices, delegated jobs, and application records across both lanes.",
    ],
    rows: [
      ["Core service", "Human assistants apply for jobs", "Human or AI assistant applies for jobs"],
      ["Buying model", "One-time application packages", "Choose the Scout plan and fulfillment lane"],
      ["Human communication", "Team chat", "Dedicated WhatsApp group"],
      ["Lower-cost AI-only lane", "AI tools are listed separately", "Available within the Scout service"],
      ["Application visibility", "Tracking and assistant updates", "Job, status, resume used; detailed evidence on Human"],
    ],
    sourceUrl: "https://scale.jobs/pricing",
    sourceLabel: "scale.jobs official pricing",
  },
  {
    slug: "lazyapply-alternative",
    name: "LazyApply",
    category: "High-volume automation tool",
    summary:
      "LazyApply is designed around automated application volume. Scout is a managed application service built around job profiles, resume control, records, and the option to use a real person.",
    bestFor:
      "Choose LazyApply when daily application volume across its supported platforms is your primary requirement and you are comfortable supervising an automation-led workflow.",
    scoutBestFor:
      "Choose Scout when you want the work handled through defined search profiles, need visibility into the resume used, or want a Human Assistant available for judgment-heavy applications.",
    competitorStrengths: [
      "Automates applications across platforms named on its site, including Greenhouse, Dice, Indeed, and ZipRecruiter.",
      "Current annual plans advertise different daily application limits and resume-profile allowances.",
      "Includes application tracking and automated referral-email features.",
    ],
    scoutDifferences: [
      "A managed service rather than only a high-volume automation product.",
      "Multiple job profiles and explicit original-versus-tailored resume behavior.",
      "A separate Human Assistant lane for sensitive answers and application exceptions.",
    ],
    rows: [
      ["Core service", "Automated applications and referrals", "Managed applications through Human or AI"],
      ["Primary emphasis", "Daily application volume", "Fit, controls, and visible execution"],
      ["Human assistant option", "Not listed as the core model", "Dedicated Human Assistant available"],
      ["Resume profiles", "Allowance varies by plan", "Profiles organize distinct search strategies"],
      ["Application evidence", "Analytics dashboard", "Records on both lanes; detailed evidence on Human"],
    ],
    sourceUrl: "https://lazyapply.com/",
    sourceLabel: "LazyApply official website",
    researchChecked: "August 21, 2026",
    buyingQuestions: [
      {
        question: "How much application volume do you actually want?",
        answer: "LazyApply's published annual plans currently range from 15 to 1,500 applications per day and from one to 20 resume profiles. Those are materially different operating modes. Choose the smallest limit that you can still audit for job fit, answer accuracy, and duplicate submissions.",
      },
      {
        question: "Which parts of the search do you want automated?",
        answer: "The official site names Greenhouse, Dice, Indeed, and ZipRecruiter, and also promotes referral emails and an analytics dashboard. Confirm that your target employers and application routes overlap with that coverage before comparing only the headline volume.",
      },
      {
        question: "What control do you need when a form is ambiguous?",
        answer: "A high daily allowance is most useful for stable, repeatable searches. If sponsorship, compensation, disclosures, or resume changes regularly require judgment, test a small batch or choose a workflow with a human escalation path.",
      },
    ],
  },
  {
    slug: "jobcopilot-alternative",
    name: "JobCopilot",
    category: "AI auto-apply platform",
    summary:
      "JobCopilot and Scout both automate job applications. JobCopilot presents a broad AI career-tool suite; Scout focuses on application execution with a clear choice between AI throughput and human judgment.",
    bestFor:
      "Choose JobCopilot when you want an AI toolkit that combines auto-apply, company-career-page matching, hiring-manager contacts, resume tools, and interview tools.",
    scoutBestFor:
      "Choose Scout when your priority is a done-for-you application desk, a human escalation path, multiple search profiles, and a record of the materials used for every submission.",
    competitorStrengths: [
      "Finds jobs on official company career pages and can automate applications.",
      "Offers review-before-apply controls and AI training based on edited answers.",
      "Bundles tracking, resume, cover-letter, mock-interview, and career tools.",
    ],
    scoutDifferences: [
      "The product centers application fulfillment rather than a broad collection of career tools.",
      "Human Assistant plans add direct WhatsApp communication and judgment.",
      "Human fulfillment includes detailed evidence for important form answers.",
    ],
    rows: [
      ["Core service", "AI job matching and auto-apply", "Human or AI application fulfillment"],
      ["Job sources", "Official company career pages", "Supported employer workflows and delegated jobs"],
      ["Review control", "Save applications for review", "Approval rules and exception handling"],
      ["Human assistant option", "Not listed as the core model", "Dedicated Human Assistant available"],
      ["Career-tool breadth", "Broad AI career toolkit", "Focused application operations desk"],
    ],
    sourceUrl: "https://jobcopilot.com/pricing/",
    sourceLabel: "JobCopilot official pricing",
  },
  {
    slug: "aiapply-alternative",
    name: "AIApply",
    category: "AI job-search toolkit",
    summary:
      "AIApply combines job matching, tailored application materials, auto-apply, and coaching. Scout is narrower by design: it handles applications through an AI Assistant or a dedicated Human Assistant and records the work.",
    bestFor:
      "Choose AIApply when you want a single AI toolkit spanning job discovery, resume and cover-letter generation, automatic applications, and interview coaching.",
    scoutBestFor:
      "Choose Scout when you want application execution to be the center of the service, with a human alternative, defined job profiles, resume controls, and lane-specific proof.",
    competitorStrengths: [
      "Its official site combines high-match job discovery, resume and cover-letter tailoring, and auto-apply.",
      "Includes live coaching and additional job-search tools.",
      "Designed as an AI-led workflow from discovery through interview preparation.",
    ],
    scoutDifferences: [
      "Users can choose a dedicated person instead of relying only on AI.",
      "The Human Assistant communicates through WhatsApp and handles ambiguous application questions.",
      "Every application records its job, status, and resume; Human plans add detailed evidence.",
    ],
    rows: [
      ["Core service", "AI job-search and application toolkit", "Human or AI application fulfillment"],
      ["Job discovery", "AI match discovery", "Job sourcing plus user-delegated jobs"],
      ["Application materials", "AI-tailored resume and cover letter", "Original or tailored resume workflow"],
      ["Human assistant option", "Not listed as the core model", "Dedicated Human Assistant available"],
      ["Execution evidence", "Product activity and application tools", "Records on both lanes; detailed evidence on Human"],
    ],
    sourceUrl: "https://aiapply.co/",
    sourceLabel: "AIApply official website",
    researchChecked: "August 21, 2026",
    buyingQuestions: [
      {
        question: "Do you want a broad career toolkit or a focused application service?",
        answer: "AIApply's current site combines job matching, resume and cover-letter generation, automatic applications, interview practice, and live interview assistance. That breadth can be useful when you want one AI suite; it is less relevant when the only bottleneck is careful application execution.",
      },
      {
        question: "Is an AI-led operating model enough?",
        answer: "AIApply presents an AI-led workflow. Scout's practical difference is the option to choose a dedicated Human Assistant for searches where exceptions, sensitive answers, and direct communication matter more than software breadth.",
      },
      {
        question: "Which outcome claims can you verify?",
        answer: "Treat interview-rate and speed claims as marketing until you understand the sample, eligibility rules, and measurement window. Compare the workflow you can inspect—targeting, material accuracy, submission records, and pause controls—before relying on an employer outcome no service controls.",
      },
    ],
  },
  {
    slug: "wearecareer-alternative",
    name: "WeAreCareer",
    category: "Reverse recruiting and career coaching",
    summary: "WeAreCareer is a premium reverse-recruiting and coaching program. Scout focuses more narrowly on executing applications, with separate Human and AI Assistant lanes.",
    bestFor: "Choose WeAreCareer when you want a multi-month coaching engagement with positioning, outreach, interview support, and application execution—and its selective intake and hybrid fee structure fit your goals.",
    scoutBestFor: "Choose Scout when your primary need is getting applications handled with visible profiles, resume controls, tracking, and a choice between human judgment and lower-cost AI execution.",
    competitorStrengths: ["Combines one-to-one coaching with reverse recruiting.", "Includes application execution and recruiter or hiring-manager outreach on qualifying programs.", "Offers programs for different career levels with client approval before applications."],
    scoutDifferences: ["Application operations are the primary product rather than a broad coaching program.", "Users choose a Human Assistant or lower-cost AI Assistant.", "Human plans include WhatsApp communication and detailed application evidence."],
    rows: [["Core service","Coaching plus reverse recruiting","Human or AI application fulfillment"],["Typical engagement","Multi-month structured program","Application service with a selected lane"],["Outreach","Included on qualifying programs","Application execution is the core focus"],["Human support","Career coaches and recruiting team","Dedicated Human Assistant available"],["Best fit","Qualified corporate professionals","Job seekers mainly delegating application work"]],
    sourceUrl: "https://wearecareer.com/pages/reverse-recruiting",
    sourceLabel: "WeAreCareer reverse recruiting page",
  },
  {
    slug: "reverse-recruiting-agency-alternative",
    name: "Reverse Recruiting Agency",
    category: "Full-service reverse recruiting",
    summary: "Reverse Recruiting Agency manages applications, outreach, positioning, and coaching through a premium recruiter-led engagement. Scout offers a more focused application service with Human and AI options.",
    bestFor: "Choose Reverse Recruiting Agency when you want a high-touch, full-search engagement that includes career strategy, resume work, personalized outreach, and a success-fee model.",
    scoutBestFor: "Choose Scout when you want to delegate applications without buying a full reverse-recruiting engagement, or when you want a lower-cost AI lane alongside human support.",
    competitorStrengths: ["Deep resume rewriting and job-specific customization.", "Direct LinkedIn and email outreach to recruiters and hiring managers.", "Career coaching and an incentive model tied partly to accepted offers."],
    scoutDifferences: ["Offers both Human and AI application lanes.", "Centers profiles, resume choice, delegated jobs, and application receipts.", "Does not require the same broad outreach-and-coaching service model."],
    rows: [["Core service","Full reverse recruiting","Managed job applications"],["Search strategy","Recruiter-led strategy and coaching","Job profiles and application rules"],["Direct outreach","A central service component","Not the primary product"],["Pricing structure","Monthly fee plus success fee","Plan-based Human or AI service"],["Lower-cost automation","Not the core model","AI Assistant available"]],
    sourceUrl: "https://www.reverserecruitingagency.com/pricing",
    sourceLabel: "Reverse Recruiting Agency pricing",
  },
  {
    slug: "topstack-personal-recruiting-alternative",
    name: "TopStack Personal Recruiting",
    category: "Personal recruiter service",
    summary: "TopStack Personal Recruiting is a customized, outcome-oriented job-search service. Scout is an application operations service with a defined Human Assistant and lower-cost AI Assistant.",
    bestFor: "Choose TopStack Personal Recruiting when you want a personal recruiter to oversee a customized job-search strategy and work with you through employment.",
    scoutBestFor: "Choose Scout when application execution and visibility are the priority, especially if you want to start with AI or manage several distinct job profiles.",
    competitorStrengths: ["Customized job-search plans built around career goals.", "A personal recruiter oversees the search.", "Broader career-document and job-search support than application submission alone."],
    scoutDifferences: ["Two clearly separated fulfillment lanes.", "Dashboard records the job, status, and resume used.", "Human plans include dedicated WhatsApp communication and form evidence."],
    rows: [["Core service","Customized personal recruiting","Human or AI application fulfillment"],["Engagement","Individual job-search plan","Profile-driven application service"],["Career documents","Part of the broader service","Original or tailored resume workflow"],["AI-only option","Not the core model","Available"],["Application proof","Progress reporting","Records on both lanes; detailed evidence on Human"]],
    sourceUrl: "https://www.topstackresume.com/personal-recruiting",
    sourceLabel: "TopStack Personal Recruiting page",
  },
  {
    slug: "icareersolutions-alternative",
    name: "iCareerSolutions",
    category: "Executive reverse recruiting",
    summary: "iCareerSolutions provides premium reverse recruiting, executive positioning, targeted outreach, and applications. Scout is designed for broader job seekers who mainly need the application workload handled.",
    bestFor: "Choose iCareerSolutions when you are a senior leader seeking executive positioning, recruiter outreach, networking, reporting, and a high-touch monthly search engagement.",
    scoutBestFor: "Choose Scout when you need done-for-you applications, multiple search profiles, resume controls, and transparent execution without an executive-branding program.",
    competitorStrengths: ["Built for mid-senior, executive, and C-suite searches.", "Combines targeted applications with recruiter and decision-maker outreach.", "Publishes process KPIs and offers tier-dependent interview-support guarantees."],
    scoutDifferences: ["Accessible Human and AI fulfillment lanes.", "Application records and delegated-job workflow are central.", "Human plans provide detailed evidence for important application answers."],
    rows: [["Core service","Executive reverse recruiting","Managed applications"],["Primary audience","Mid-senior to C-suite","Broader professional job seekers"],["Outreach","Recruiter and decision-maker campaigns","Applications are the core workflow"],["Reporting","Campaign KPIs and check-ins","Application tracker and receipts"],["Lower-cost AI lane","Not the core model","Available"]],
    sourceUrl: "https://icareersolutions.com/reverse-recruiting-process/",
    sourceLabel: "iCareerSolutions process page",
  },
  {
    slug: "top-prospect-careers-alternative",
    name: "Top Prospect Careers",
    category: "Boutique reverse recruiting",
    summary: "Top Prospect Careers combines founder-led reverse recruiting, coaching, resume writing, and interview preparation. Scout concentrates on scalable application execution with optional human judgment.",
    bestFor: "Choose Top Prospect Careers when you want boutique, one-to-one support throughout the search, including candidacy positioning and interview coaching.",
    scoutBestFor: "Choose Scout when you primarily want applications sourced or delegated, submitted, and tracked through a repeatable Human or AI workflow.",
    competitorStrengths: ["Direct one-to-one work with boutique reverse recruiters.", "Manages the broader job search and coaches interview performance.", "Offers resume writing and other career services."],
    scoutDifferences: ["Lower-cost AI execution is available alongside Human service.", "Multiple profiles organize different role and location searches.", "The dashboard records applications and resume usage."],
    rows: [["Core service","Boutique reverse recruiting and coaching","Human or AI application fulfillment"],["Delivery","Founder-led, one-to-one","Operational assistant workflow"],["Interview coaching","A core part of the service","Not the primary product"],["Resume support","Professional writing available","Original or tailored application resumes"],["Best fit","High-touch personalized search","Delegated application execution"]],
    sourceUrl: "https://www.topprospectcareers.com/top-prospect-reverse-recruiting",
    sourceLabel: "Top Prospect reverse recruiting page",
  },
  {
    slug: "relentless-alternative",
    name: "Relentless",
    category: "Done-for-you job search",
    summary: "Relentless combines software and human expertise across targeting, resumes, outreach, interviews, and negotiation. Scout focuses on application fulfillment and gives users a Human or AI lane.",
    bestFor: "Choose Relentless when you want a hands-off, end-to-end search with coaching, large-scale hiring-manager outreach, interview scheduling, and success-fee alignment.",
    scoutBestFor: "Choose Scout when you want applications handled and documented without purchasing the same breadth of coaching, outbound outreach, and negotiation support.",
    competitorStrengths: ["Combines human expertise with proprietary software.", "Includes resume, applications, hiring-manager outreach, and interview support.", "Provides coaching through interviewing and negotiation."],
    scoutDifferences: ["A focused application service with clearer lane choice.", "AI Assistant provides a lower-cost entry point.", "Human Assistant includes WhatsApp and detailed submission evidence."],
    rows: [["Core service","End-to-end done-for-you search","Managed application execution"],["Outreach","Hiring-manager email outreach","Not the primary product"],["Coaching","Interview and negotiation support","Application workflow is the focus"],["Pricing model","Initiation fee plus success fee","Selected Human or AI plan"],["Application visibility","Managed search updates","Dashboard records and Human evidence"]],
    sourceUrl: "https://www.joinrelentless.com/",
    sourceLabel: "Relentless official website",
  },
  {
    slug: "applyall-alternative",
    name: "ApplyAll",
    category: "Human-reviewed application service",
    summary: "ApplyAll and Scout both handle applications for job seekers. ApplyAll sells hand-reviewed application packages with an interview guarantee; Scout offers separate Human and AI fulfillment lanes.",
    bestFor: "Choose ApplyAll when you want a fixed package of hand-reviewed applications, its supported role and geography coverage fits, and its refund-backed interview guarantee is important to you.",
    scoutBestFor: "Choose Scout when you want ongoing profile-based control, an AI or Human service choice, browser-extension delegation, and detailed evidence on the Human lane.",
    competitorStrengths: ["Finds, ranks, and submits jobs with human verification.", "Current packages use one-time pricing and application allotments.", "Publishes an interview guarantee with defined refund terms."],
    scoutDifferences: ["Human and AI execution are offered as separate lanes.", "Multiple job profiles and resume behavior support distinct searches.", "Human service provides a dedicated WhatsApp group and detailed evidence."],
    rows: [["Core service","Human-reviewed application packages","Human or AI application service"],["Job matching","Outcome-informed ranking","Profile rules and fit controls"],["Buying model","One-time application allotment","Choose a fulfillment plan"],["Guarantee","Defined interview refund guarantee","No invented hiring guarantee"],["Human communication","Support team","Dedicated WhatsApp assistant on Human"]],
    sourceUrl: "https://applyall.com/job-application-service",
    sourceLabel: "ApplyAll job application service",
    researchChecked: "August 21, 2026",
    buyingQuestions: [
      {
        question: "What exactly qualifies for ApplyAll's guarantee?",
        answer: "ApplyAll currently defines a qualifying interview as a live first-round conversation with someone at the hiring company within 30 days after application completion. Its page excludes automated assessments and third-party recruiter screens. Read the full eligibility and refund terms before treating the guarantee as equivalent to a job offer.",
      },
      {
        question: "How much search control remains with you?",
        answer: "The service says candidates set target titles, locations, salary requirements, work authorization, and companies to avoid, while people review applications before submission. Confirm how quickly those rules can be changed or paused once a package is underway.",
      },
      {
        question: "Do you prefer a fixed package or an ongoing operating desk?",
        answer: "ApplyAll markets this package without a recurring subscription. Scout instead organizes work around reusable profiles and separate Human or AI fulfillment lanes. The better model depends on whether you want a bounded campaign or a continuing system for multiple searches.",
      },
    ],
  },
  {
    slug: "careery-alternative",
    name: "Careery",
    category: "Managed applications and career positioning",
    summary: "Careery combines managed applications with optional resume, LinkedIn, and authority-building packages. Scout combines application execution with explicit Human and AI Assistant choices.",
    bestFor: "Choose Careery when you want managed applications plus a broader career-positioning bundle such as resume, LinkedIn, or published-authority support.",
    scoutBestFor: "Choose Scout when you want the application operations desk itself—profiles, resume rules, delegated jobs, tracking, and a human escalation option.",
    competitorStrengths: ["Managed applications across major company ATS platforms.", "Offers applications-only and broader positioning bundles.", "Configures targeting around roles, authorization, contract type, and industry."],
    scoutDifferences: ["Separates Human Assistant and AI Assistant fulfillment.", "Human communication and detailed form evidence are explicit product features.", "Browser extension lets users delegate jobs they find."],
    rows: [["Core service","Managed applications and positioning","Human or AI managed applications"],["Application sources","Company ATS platforms","Supported workflows plus delegated jobs"],["Career branding","Resume, LinkedIn, and authority bundles","Application materials tied to profiles"],["Human lane","Team-configured managed service","Dedicated Human Assistant option"],["Execution proof","Application pipeline tracking","Records on both lanes; detailed Human evidence"]],
    sourceUrl: "https://careery.pro/pricing",
    sourceLabel: "Careery official pricing",
    researchChecked: "August 21, 2026",
    buyingQuestions: [
      {
        question: "What is the full program commitment?",
        answer: "Careery's published installment schedule currently totals $1,025 across three stages: $275, then $375, then $375. The page says future stages can be cancelled. Compare the full likely campaign cost, not only the first payment shown in the call to action.",
      },
      {
        question: "Are you buying applications or a positioning bundle?",
        answer: "The six-month program currently combines managed applications with an ATS resume rebuild and LinkedIn rewrite. It also advertises unlimited applications and two additional months if the candidate does not find a job. That is broader than an applications-only purchase.",
      },
      {
        question: "How will you evaluate unlimited volume?",
        answer: "Ask how targeting, duplicate prevention, resume approval, and application evidence work before assigning value to an unlimited allowance. Qualified submissions and usable materials matter more than an uncapped count.",
      },
    ],
  },
  {
    slug: "dsd-recruitment-alternative",
    name: "DSD Recruitment",
    category: "Employer-side staffing and recruitment",
    summary: "DSD Recruitment is primarily an employer-facing staffing and talent-acquisition agency, so it is not a direct substitute for Scout's candidate-paid application service.",
    bestFor: "Engage with DSD Recruitment as a candidate when it represents a relevant open role, or as an employer when you need sourcing, screening, assessment, and placement support.",
    scoutBestFor: "Choose Scout when you are a job seeker who wants an assistant working across your own target companies and roles, applying on your behalf and tracking submissions.",
    competitorStrengths: ["Full-cycle recruitment and talent acquisition for employers.", "Sources and screens candidates across multiple business functions.", "Connects candidates with roles represented by its recruiting team."],
    scoutDifferences: ["Scout works directly for the job seeker.", "Searches across the user's target criteria rather than one agency's requisitions.", "Handles applications through a Human or AI Assistant."],
    rows: [["Who is the client?","Primarily employers","The job seeker"],["Core service","Staffing and talent acquisition","Candidate-side application fulfillment"],["Role coverage","Openings represented by the agency","User-defined target roles and companies"],["Candidate cost","Recruiters are generally employer-paid","User chooses a Scout service plan"],["Application handling","Candidate placement workflow","Assistant applies and records submissions"]],
    sourceUrl: "https://www.linkedin.com/company/dsdrecruitment",
    sourceLabel: "DSD Recruitment company profile",
  },
  {
    slug: "samnova-alternative",
    name: "SamNova",
    category: "Career coaching and resume services",
    summary: "SamNova primarily provides career coaching, assessments, resumes, LinkedIn development, and interview preparation. Scout primarily performs and tracks job applications.",
    bestFor: "Choose SamNova when your biggest need is clarifying direction, improving career materials, building networking skills, or preparing for interviews with a coach.",
    scoutBestFor: "Choose Scout when your direction and materials are sufficiently defined but repetitive application work is consuming your time.",
    competitorStrengths: ["Personalized career and executive coaching.", "Resume writing, LinkedIn development, assessments, and interview preparation.", "Specialized coaching for career transitions and experienced professionals."],
    scoutDifferences: ["Scout's core outcome is applications completed on the user's behalf.", "Human and AI lanes share profiles and application tracking.", "Human plans show detailed evidence of execution."],
    rows: [["Core service","Coaching and career materials","Managed job applications"],["Primary outcome","Stronger strategy and candidate readiness","Application work completed"],["Resume support","Professional writing and optimization","Application-specific resume workflow"],["Interview support","A major service area","Not the primary product"],["Done-for-you applications","Not the central offer","Core Human and AI service"]],
    sourceUrl: "https://samnovainc.com/career-coaching",
    sourceLabel: "SamNova career coaching page",
  },
  {
    slug: "boxresume-alternative",
    name: "BoxResume",
    category: "Resume writing and application support",
    summary: "BoxResume leads with professional resume writing and also offers job-application assistance. Scout leads with managed applications and connects materials to profiles, jobs, and fulfillment records.",
    bestFor: "Choose BoxResume when your first priority is a professionally written ATS-oriented resume, with optional cover-letter, LinkedIn, or limited application support.",
    scoutBestFor: "Choose Scout when your resume is only one part of a larger managed application workflow and you want either an AI Assistant or dedicated Human Assistant.",
    competitorStrengths: ["Professional and executive resume writing across industries.", "Cover-letter, LinkedIn, and job-application support options.", "Its application service lets users select roles and receive submission confirmations."],
    scoutDifferences: ["Application execution—not resume writing alone—is the core service.", "Multiple profiles and resume rules organize the campaign.", "Human plans include direct communication and detailed form evidence."],
    rows: [["Core service","Resume writing with application support","Managed application service"],["Resume creation","Primary offering","Original or tailored application workflow"],["Job selection","User selects roles for application help","Profiles plus user-delegated jobs"],["Human assistant","Service team supports deliverables","Dedicated Human Assistant available"],["Application tracking","Confirmation emails and response access","Dashboard records plus Human evidence"]],
    sourceUrl: "https://boxresume.com/job-application-services/",
    sourceLabel: "BoxResume application service",
    researchChecked: "August 21, 2026",
    buyingQuestions: [
      {
        question: "Is your first problem the resume or the application workload?",
        answer: "BoxResume leads with professional resume writing and offers application help alongside it. Start there when the core asset needs a professional rebuild; start with an application operations service when the resume is usable but repeated forms consume the time.",
      },
      {
        question: "Who chooses the jobs?",
        answer: "Its current application-service page says the customer selects the roles to apply for and provides core answers once. Confirm whether that means individual job approval, role-level approval, or provider-led sourcing for the package you are considering.",
      },
      {
        question: "What proof arrives after submission?",
        answer: "BoxResume advertises confirmation emails and progress visibility. Ask for a sample before purchase and compare it with the level of evidence you need, from a basic submission record to screenshots of important form answers.",
      },
    ],
  },
];

export const competitorBySlug = new Map(competitors.map((competitor) => [competitor.slug, competitor]));
