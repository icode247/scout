export type CountryPage = {
  slug: string;
  name: string;
  adjective: string;
  locale: string;
  currency: string;
  documentName: "resume" | "CV";
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  hero: string;
  contextTitle: string;
  context: string;
  realities: { title: string; body: string }[];
  profileFields: string[];
  humanBestFor: string;
  aiBestFor: string;
  faqs: { q: string; a: string }[];
};

export const COUNTRY_PAGES: CountryPage[] = [
  {
    slug: "united-states", name: "United States", adjective: "US", locale: "en-US", currency: "USD", documentName: "resume",
    title: "Job Application Service in the United States",
    description: "Too busy to apply? Scout's Human and AI assistants find suitable US jobs, tailor resumes, apply on your behalf, and track every submission.",
    eyebrow: "Done-for-you job applications in the United States", heading: "Let Scout apply for US jobs for you.",
    hero: "Tell Scout which US roles, states, remote arrangements, salary range, and employers fit. A Human or AI Assistant handles the repeatable application work while you prepare for interviews.",
    contextTitle: "A US search needs more than a job title",
    context: "US applications frequently combine state-by-state location preferences, remote eligibility, salary expectations, sponsorship questions, and employer-specific ATS forms. Scout turns those decisions into a written profile before applications begin.",
    realities: [
      { title: "Résumé and ATS targeting", body: "Choose whether Scout uses an approved résumé or tailors a truthful copy to emphasize relevant experience for each role." },
      { title: "Work authorization", body: "Record your US work authorization and sponsorship needs explicitly. Your assistant should never infer an answer." },
      { title: "Location and pay", body: "Target specific states, cities, remote arrangements, and a salary floor instead of treating the entire US as one market." },
    ],
    profileFields: ["Target titles and seniority", "States, cities, or US-remote", "Salary range in USD", "Employment type", "Work authorization and sponsorship", "Blocked employers and industries"],
    humanBestFor: "senior searches, career pivots, multiple role families, or applications with frequent judgment calls",
    aiBestFor: "a focused US search with repeatable titles, locations, eligibility rules, and resume instructions",
    faqs: [
      { q: "Can someone apply for US jobs for me?", a: "Yes. Scout offers a dedicated Human Assistant or a lower-cost AI Assistant. You define the search and provide accurate application facts; Scout handles suitable application work and records it in your dashboard." },
      { q: "Can Scout target remote jobs in the United States?", a: "Yes. A job profile can target US-remote work, named states or cities, or a combination. You should also state where you are legally eligible to work." },
      { q: "Will Scout answer US sponsorship questions?", a: "Scout uses the work-authorization and sponsorship information you approve. Questions that cannot be answered from your profile should be escalated rather than guessed." },
      { q: "How is Scout priced in the US?", a: "Scout prices plans in USD. AI plans are recurring subscriptions; Human Assistant plans are one-time application bundles. Check the pricing page for current allowances and terms." },
    ],
  },
  {
    slug: "united-kingdom", name: "United Kingdom", adjective: "UK", locale: "en-GB", currency: "GBP", documentName: "CV",
    title: "Job Application Service in the United Kingdom",
    description: "Scout's Human and AI assistants apply for UK jobs on your behalf using your CV, role criteria, right-to-work details, and salary preferences.",
    eyebrow: "A UK job application service that works from your brief", heading: "Let Scout apply for UK jobs for you.",
    hero: "Set the vacancies, locations, working pattern, salary expectations, and exclusions that suit you. Scout can then run the repetitive application work using a dedicated Human Assistant or a lower-cost AI Assistant.",
    contextTitle: "Built around a UK job-search brief",
    context: "UK candidates search for vacancies, submit CVs and covering letters, compare annual salaries or day rates, and answer right-to-work and sponsorship questions. Scout keeps those details in one profile so they do not have to be re-decided on every form.",
    realities: [
      { title: "CV and covering-letter language", body: "Your profile can preserve an approved CV or allow truthful tailoring for the vacancy. Scout uses UK terminology throughout the brief." },
      { title: "Right to work", body: "Record your UK work status and sponsorship needs as explicit facts. Scout does not decide eligibility on your behalf." },
      { title: "Working pattern", body: "Separate remote, hybrid and on-site preferences, along with commute limits and any location exclusions." },
    ],
    profileFields: ["Target roles and level", "UK nations, regions, or cities", "Remote, hybrid, or on-site", "Salary or contract day rate", "Right-to-work and sponsorship facts", "CV and covering-letter rules"],
    humanBestFor: "career changes, senior appointments, contract searches, or applications that need individual judgement",
    aiBestFor: "a clearly defined UK search with stable role, location, salary, and eligibility criteria",
    faqs: [
      { q: "Can I pay someone to apply for jobs for me in the UK?", a: "Yes. Scout's Human Assistant service assigns a person to application execution. The AI Assistant is a lower-cost option for a clear, repeatable search." },
      { q: "Does Scout use a CV or an American résumé?", a: "For UK searches, Scout works from your CV and can prepare a truthful tailored copy when your plan and profile call for it." },
      { q: "Can Scout apply for UK remote and hybrid vacancies?", a: "Yes. Your job profile can specify remote, hybrid or on-site work, preferred locations and commute limits." },
      { q: "Can Scout handle right-to-work questions?", a: "Scout uses only the right-to-work and sponsorship facts you approve. Ambiguous or employer-specific questions should return to you for a decision." },
    ],
  },
  {
    slug: "canada", name: "Canada", adjective: "Canadian", locale: "en-CA", currency: "CAD", documentName: "resume",
    title: "Job Application Service in Canada",
    description: "Scout applies for suitable Canadian jobs for you with a Human or AI Assistant, based on your resume, provinces, work eligibility, and preferences.",
    eyebrow: "Done-for-you job applications across Canada", heading: "Let Scout apply for jobs in Canada for you.",
    hero: "Choose the Canadian roles, provinces, cities, work arrangements, pay range, and employers you want. Scout handles suitable application work and shows you the job, status, and resume used.",
    contextTitle: "One Canadian search can span very different markets",
    context: "A Canada-wide search may cross provinces, time zones, bilingual requirements, regulated occupations, and different expectations about remote presence. Scout uses separate job profiles when one set of rules would be too broad.",
    realities: [
      { title: "Province-level targeting", body: "Choose provinces and cities deliberately, including whether a remote role must still be based in a particular province." },
      { title: "Language requirements", body: "Mark English, French, or bilingual requirements honestly. A translated application should only be used when you can work in that language." },
      { title: "Canadian work eligibility", body: "Provide your permit, residency, citizenship, or sponsorship facts so applications do not make assumptions." },
    ],
    profileFields: ["Target occupations and seniority", "Provinces and cities", "English, French, or bilingual roles", "Salary range in CAD", "Work permit or sponsorship facts", "Remote-work location constraints"],
    humanBestFor: "bilingual, regulated, senior, or multi-province searches where requirements vary substantially",
    aiBestFor: "one or more narrow Canadian profiles with clear occupations, locations, language requirements, and eligibility",
    faqs: [
      { q: "Can someone apply for jobs for me in Canada?", a: "Yes. Scout can assign a Human Assistant or run a lower-cost AI Assistant from your approved Canadian job profile." },
      { q: "Can I target more than one Canadian province?", a: "Yes. You can include several locations or create separate profiles when salary, language, licensing, or remote-work rules differ by province." },
      { q: "Does Scout support French-language Canadian applications?", a: "Your profile can target French or bilingual roles, but application materials and language claims must accurately reflect your ability. Full French page localization is planned separately." },
      { q: "Will Scout decide whether I need a Canadian work permit?", a: "No. You provide the correct work-eligibility and sponsorship answers. Scout applies those facts and escalates uncertainty." },
    ],
  },
  {
    slug: "australia", name: "Australia", adjective: "Australian", locale: "en-AU", currency: "AUD", documentName: "CV",
    title: "Job Application Service in Australia",
    description: "Scout's Human and AI assistants apply for Australian jobs for you using your CV, work-rights facts, target locations, salary, and role criteria.",
    eyebrow: "Job applications handled for Australian candidates", heading: "Let Scout apply for jobs in Australia for you.",
    hero: "Define the roles, states, cities, working arrangement, salary, and work-rights facts that shape your Australian search. Scout handles the repeatable application work while keeping a visible record.",
    contextTitle: "Australia-wide is rarely one search",
    context: "Sydney, Melbourne, Brisbane, Perth and regional opportunities can carry different relocation, on-site and salary trade-offs. Scout lets you split those choices into profiles instead of applying one vague rule across the country.",
    realities: [
      { title: "CV and selection criteria", body: "Set the CV strategy for each role family and flag applications that require substantial written criteria or candidate input." },
      { title: "Working rights", body: "Store your Australian work-rights and sponsorship facts accurately; never treat willingness to relocate as permission to claim eligibility." },
      { title: "Permanent or contract", body: "Separate permanent, fixed-term and contract searches, including salary or rate expectations in AUD." },
    ],
    profileFields: ["Target roles and industries", "States, cities, or regional areas", "Remote, hybrid, or on-site", "Salary or contract rate in AUD", "Work-rights and sponsorship facts", "Relocation and travel limits"],
    humanBestFor: "senior roles, career changes, selection-criteria applications, or searches spanning several employment types",
    aiBestFor: "a focused Australian search with repeatable roles, locations, work arrangements, and eligibility answers",
    faqs: [
      { q: "Can I hire someone to apply for jobs for me in Australia?", a: "Yes. Scout's Human Assistant handles application execution with direct communication. The AI Assistant provides a lower-cost option for a clearly defined search." },
      { q: "Can Scout target jobs in specific Australian states?", a: "Yes. Set states, cities, regional areas and remote-work preferences in your job profile, or separate them into different profiles." },
      { q: "How does Scout answer Australian work-rights questions?", a: "Scout uses the work-rights and sponsorship information you provide. It should not infer eligibility from your location or relocation preferences." },
      { q: "Can Scout handle permanent and contract searches?", a: "Yes. Employment type and salary or rate expectations can be defined in each profile so the two searches do not get mixed together." },
    ],
  },
  {
    slug: "nigeria", name: "Nigeria", adjective: "Nigerian", locale: "en-NG", currency: "NGN", documentName: "CV",
    title: "Job Application Service for Job Seekers in Nigeria",
    description: "Scout helps Nigerian job seekers delegate local, remote, and international applications to a Human or AI Assistant while retaining control.",
    eyebrow: "A job application assistant for Nigerian job seekers", heading: "Delegate your local, remote, or international job applications.",
    hero: "Searching locally, remotely, or internationally can mean running several campaigns at once. Scout turns each campaign into a clear profile, then a Human or AI Assistant handles suitable application work for you.",
    contextTitle: "Keep local, remote, and relocation searches separate",
    context: "A Lagos-based candidate targeting local roles, worldwide remote work, and relocation opportunities does not have one set of eligibility or salary answers. Scout supports multiple profiles so each campaign can use the right locations, currencies, work arrangements, and sponsorship facts.",
    realities: [
      { title: "Local roles", body: "Set Nigerian cities, on-site or hybrid preferences, compensation expectations, and sectors you want to include or avoid." },
      { title: "International remote work", body: "Distinguish genuinely worldwide remote roles from vacancies restricted to residents of the employer's country." },
      { title: "Relocation and sponsorship", body: "Target relocation only where your profile accurately states the countries, visa status, and sponsorship you require." },
    ],
    profileFields: ["Local, remote, or relocation campaign", "Target titles and experience level", "Cities, countries, and time zones", "Salary expectations by currency", "Work authorization and sponsorship", "Preferred CV and cover-note strategy"],
    humanBestFor: "international searches, career pivots, several destination countries, or applications where eligibility needs careful review",
    aiBestFor: "a narrow local or remote campaign with explicit geography, role, experience, and work-authorization rules",
    faqs: [
      { q: "Can someone apply for jobs for me from Nigeria?", a: "Yes. Scout supports Nigerian candidates through a dedicated Human Assistant or a lower-cost AI Assistant. Your location does not remove the need to meet each employer's work-eligibility rules." },
      { q: "Can Scout apply for remote jobs outside Nigeria?", a: "Scout can target remote roles based on your profile. The profile should distinguish worldwide remote jobs from roles restricted to a particular country or time zone." },
      { q: "Can Scout look for visa-sponsoring jobs?", a: "Sponsorship needs can be included in your profile. Scout cannot guarantee sponsorship and should only apply where the role and your stated eligibility align." },
      { q: "How do I communicate with a Human Assistant?", a: "Human Assistant members receive a private WhatsApp group for search updates and questions, which is especially useful when a multi-country campaign needs judgement." },
    ],
  },
  {
    slug: "india", name: "India", adjective: "Indian", locale: "en-IN", currency: "INR", documentName: "resume",
    title: "Job Application Service for Job Seekers in India",
    description: "Scout's Human and AI assistants apply for suitable jobs for Indian candidates using approved roles, locations, CTC, notice period, and resume rules.",
    eyebrow: "Done-for-you applications for job seekers in India", heading: "Delegate your India or international job applications.",
    hero: "Set your target roles, experience level, cities, remote preferences, compensation, notice period, and exclusions once. Scout then handles suitable repeat application work and tracks what was sent.",
    contextTitle: "Indian applications depend on details beyond job fit",
    context: "Recruiters commonly ask for current and expected CTC, notice period, preferred locations, relocation, and work arrangement. A useful delegated search needs those facts approved in advance rather than improvised form by form.",
    realities: [
      { title: "CTC and notice period", body: "Record current and expected compensation accurately and set a current notice period that can be updated when it changes." },
      { title: "City and relocation choices", body: "Separate Bengaluru, Hyderabad, Pune, Mumbai, Delhi NCR, Chennai, or remote searches when the trade-offs differ." },
      { title: "Local or international", body: "Keep India-based searches separate from overseas relocation or international remote campaigns, which require different eligibility answers." },
    ],
    profileFields: ["Target roles and years of experience", "Preferred cities and relocation", "Current and expected CTC", "Notice period", "Remote, hybrid, or office preference", "International work authorization"],
    humanBestFor: "senior searches, career pivots, multi-country campaigns, or applications with variable compensation and notice-period questions",
    aiBestFor: "a focused India-based campaign with stable titles, cities, CTC expectations, notice period, and resume instructions",
    faqs: [
      { q: "Can someone apply for jobs for me in India?", a: "Yes. Choose Scout's dedicated Human Assistant or a lower-cost AI Assistant, define the search rules, and review completed work in your dashboard." },
      { q: "Can Scout answer current CTC and expected CTC questions?", a: "Yes, when you provide approved figures or guidance. Scout should not invent compensation information, and you can update it when your expectations change." },
      { q: "How does Scout handle my notice period?", a: "Your notice period is stored as an application fact. Keep it current and provide instructions for questions about negotiability or an available joining date." },
      { q: "Can I run an India search and an overseas search?", a: "Yes. Use separate job profiles so locations, salary currencies, sponsorship requirements, and resume strategies do not become mixed." },
    ],
  },
];

export const COUNTRY_ALTERNATES = COUNTRY_PAGES.map(({ locale, slug }) => ({
  locale,
  href: `/job-application-service/${slug}`,
}));
