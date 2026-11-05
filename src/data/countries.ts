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
  /** Market-specific sections shown after the local search brief. */
  guide?: { title: string; body: string }[];
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
    guide: [
      { title: "What US application forms ask for", body: "Most US employers collect applications through an applicant tracking system, so the same facts get retyped into a different form at every company. Beyond work history, those forms commonly ask whether you are authorized to work in the US, whether you will need sponsorship now or in the future, what pay you expect, and which state you live in. Many add voluntary self-identification questions on gender, race, veteran status, and disability. Decide once how each of these should be answered and write it down, so nothing depends on how a form happens to phrase the question that day." },
      { title: "Building a US job profile", body: "Treat location as a list rather than a country. A remote posting can still be limited to certain states, and the same title can pay very differently in New York and in Kansas City. Name the states and metro areas you accept and say whether you would relocate. Give a salary floor in USD and mark it as base pay or total compensation, because employers quote both. Write out your two sponsorship answers exactly as they should be given. Then list the employers to skip, starting with your current company and any staffing firms you do not want representing you." },
      { title: "Which lane fits a US search", body: "The AI Assistant suits a steady search: one title family, a fixed state list, and the same answers on every form. AI Essential runs 1 active job profile and AI Plus runs up to 3, which helps if remote and on-site searches need different rules. A Human Assistant fits when the answers shift from job to job, for example a pivot into a new field or senior roles with very different scopes. Human plans also add a dedicated WhatsApp group and screenshots of important form answers, which AI plans do not include. If several states or role families are in play, Full Search covers up to 2 profiles and Career Campaign up to 4." },
    ],
    faqs: [
      { q: "Can someone apply for US jobs for me?", a: "Yes. Scout offers a dedicated Human Assistant or a lower-cost AI Assistant. You define the search and provide accurate application facts; Scout handles suitable application work and records it in your dashboard." },
      { q: "Can Scout target remote jobs in the United States?", a: "Yes. A job profile can target US-remote work, named states or cities, or a combination. You should also state where you are legally eligible to work." },
      { q: "Will Scout answer US sponsorship questions?", a: "Scout uses the work-authorization and sponsorship information you approve. Questions that cannot be answered from your profile should be escalated rather than guessed." },
      { q: "How is Scout priced in the US?", a: "AI plans are $39 or $79 a month and Human Assistant plans are $299, $499 or $999 a month, in US dollars. Prepaying 90 days saves about 10%, and there is no placement fee or percentage of your salary. Check the [pricing page](/pricing) for current allowances and terms." },
      { q: "Do I need a call before Scout starts applying for US jobs?", a: "No call is required. Activate a plan from your dashboard and set up your job profile. A free call is optional if you would rather talk through your state list or sponsorship answers first." },
      { q: "Does Scout guarantee interviews in the US?", a: "No. Scout does not guarantee interviews or offers, and it charges no placement fee and no percentage of your salary. You pay for the application work, and each job, status, and resume used is recorded in your dashboard." },
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
    guide: [
      { title: "How a UK application differs", body: "Most UK vacancies ask for a CV, often kept to about two pages, and many still expect a covering letter. Employers must check that a person is allowed to work for them before employing them, so right-to-work and sponsorship questions appear early in many forms. Public-sector recruitment works differently again: Civil Service and NHS applications often rely on a written personal or supporting statement tied to set criteria, not just an uploaded CV. Those statements need your own examples, so decide in advance which vacancies should come back to you." },
      { title: "Writing your UK job brief", body: "Say which nations or cities you mean, because a London role and a Glasgow role rarely share a salary, commute, or hybrid pattern. Give your salary in pounds. If you contract, give a day rate too and say whether you will accept roles inside IR35. Add the notice period written in your contract, since employers ask and it shapes start dates. If you need sponsorship, say so plainly. GOV.UK publishes a register of licensed sponsors, which is a useful first check on a target employer, although being listed does not mean a particular vacancy can be sponsored. Scout does not advise on visas or IR35 status." },
      { title: "Choosing a lane for a UK search", body: "The AI Assistant works well for a permanent search with one role family and a stable region. AI Plus runs up to 3 active job profiles, which keeps a London search apart from a Manchester search, or permanent roles apart from contract work. Choose a Human Assistant if vacancies need individual judgement: career changes, senior appointments, or a mix of private-sector forms and public-sector statements. You talk to your assistant in a dedicated WhatsApp group, and important form answers come back as screenshots. AI plans do not include those screenshots." },
    ],
    faqs: [
      { q: "Can I pay someone to apply for jobs for me in the UK?", a: "Yes. Scout's Human Assistant service assigns a person to application execution. The AI Assistant is a lower-cost option for a clear, repeatable search." },
      { q: "Does Scout use a CV or an American résumé?", a: "For UK searches, Scout works from your CV and can prepare a truthful tailored copy when your plan and profile call for it." },
      { q: "Can Scout apply for UK remote and hybrid vacancies?", a: "Yes. Your job profile can specify remote, hybrid or on-site work, preferred locations and commute limits." },
      { q: "Can Scout handle right-to-work questions?", a: "Scout uses only the right-to-work and sponsorship facts you approve. Ambiguous or employer-specific questions should return to you for a decision." },
      { q: "How is Scout priced in the UK?", a: "All plans are priced in US dollars, not pounds. AI plans are $39 or $79 a month and Human Assistant plans are $299, $499 or $999 a month, in US dollars. Prepaying 90 days saves about 10%, and there is no placement fee or percentage of your salary. No call is required to start: Activate a plan from your dashboard. The [pricing page](/pricing) lists current allowances." },
      { q: "Can Scout look for contract and day-rate roles in the UK?", a: "Yes. A job profile can set a day rate, contract length, and working pattern, and you can keep it separate from a permanent search. Tell Scout how to treat vacancies marked inside or outside IR35. Scout follows your rule and does not judge a role's IR35 status." },
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
    guide: [
      { title: "How Canadian applications differ", body: "Canadian employers ask for a resume, and forms usually ask whether you are legally entitled to work in Canada. The answer depends on your status: citizens, permanent residents, and work permit holders all answer differently, and an open work permit is not the same as an employer-specific one. Language can decide eligibility as much as skills, especially for Quebec roles and positions that require both official languages. Some occupations are regulated too, and each province and territory sets entry requirements for most of them, so what a posting needs from you can change at a provincial border." },
      { title: "Setting up a Canadian job profile", body: "Start with geography. Toronto, Montreal, Calgary, and Vancouver are different searches, and a job advertised as remote may still require you to live in one province. Give your salary range in CAD and say whether it changes by city. State your French level honestly: if a role needs bilingual work and you cannot do it, the application should not go out. If your occupation is regulated, record your licence or registration status for each province you are targeting. Add your permit type and expiry date, and say how questions about future sponsorship should be answered." },
      { title: "Which lane suits a Canadian search", body: "An AI Assistant fits a narrow search, such as one occupation in Ontario with English-only roles and no licensing questions. AI Plus runs up to 3 active job profiles, so Ontario, Quebec, and remote Canada can each keep their own rules. A Human Assistant fits when a person needs to read the posting: bilingual roles, regulated work, senior hires, or a move between provinces. Full Search covers up to 2 profiles and Career Campaign covers up to 4 with 2 Human Assistants. Human plans add a dedicated WhatsApp group and screenshots of important form answers. AI plans do not include those screenshots." },
    ],
    faqs: [
      { q: "Can someone apply for jobs for me in Canada?", a: "Yes. Scout can assign a Human Assistant or run a lower-cost AI Assistant from your approved Canadian job profile." },
      { q: "Can I target more than one Canadian province?", a: "Yes. You can include several locations or create separate profiles when salary, language, licensing, or remote-work rules differ by province." },
      { q: "Does Scout support French-language Canadian applications?", a: "Your profile can target French or bilingual roles, but application materials and language claims must accurately reflect your ability. Full French page localization is planned separately." },
      { q: "Will Scout decide whether I need a Canadian work permit?", a: "No. You provide the correct work-eligibility and sponsorship answers. Scout applies those facts and escalates uncertainty." },
      { q: "How is Scout priced in Canada?", a: "Every plan is priced in US dollars, not Canadian dollars. AI plans are $39 or $79 a month and Human Assistant plans are $299, $499 or $999 a month, in US dollars. Prepaying 90 days saves about 10%, with no placement fee and no percentage of salary. No call is required to start: Activate a plan from your dashboard. See the [pricing page](/pricing) for allowances." },
      { q: "Can Scout apply for regulated occupations in Canada?", a: "Yes, if your profile states the licence or registration you actually hold and where it applies. Scout does not assess whether you meet a regulator's requirements, so confirm those with the regulator in your province or territory." },
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
    guide: [
      { title: "How Australian applications differ", body: "Australian employers usually ask for a CV or resume with a cover letter, and CVs often run longer than a one-page American resume. Many end with referees or a note that they are available on request. Government and university roles often ask for written responses to selection criteria, which can take longer than the CV itself. Forms also commonly ask whether you are a citizen, a permanent resident, or a visa holder with work rights. Advertised pay needs a careful read too, since a figure may be quoted plus super or as a package that includes it." },
      { title: "Filling in an Australian job profile", body: "Decide what Australia-wide means for you. Sydney, Melbourne, Brisbane, Perth, and Adelaide are different searches, and regional or fly-in fly-out work brings its own travel limits, so state those rather than leaving them open. Give your expected pay in AUD and mark it as base or including super. If you contract, add a day or hourly rate. Record your visa type and any work conditions as facts, and say how sponsorship questions should be answered. Name referees only if they have agreed, and say whether their details can be shared at application stage." },
      { title: "Picking a lane for an Australian search", body: "An AI Assistant is a good match for a repeatable search, such as one role family in one capital city with the same work-rights answers each time. AI Plus runs up to 3 active job profiles if you want Melbourne, Sydney, and remote kept apart. Pick a Human Assistant when selection criteria, a career change, or a mix of permanent and contract roles calls for someone to read each advertisement. Your assistant talks to you in a dedicated WhatsApp group and sends screenshots of important form answers, which AI plans do not include. Written criteria responses still need your real examples." },
    ],
    faqs: [
      { q: "Can I hire someone to apply for jobs for me in Australia?", a: "Yes. Scout's Human Assistant handles application execution with direct communication. The AI Assistant provides a lower-cost option for a clearly defined search." },
      { q: "Can Scout target jobs in specific Australian states?", a: "Yes. Set states, cities, regional areas and remote-work preferences in your job profile, or separate them into different profiles." },
      { q: "How does Scout answer Australian work-rights questions?", a: "Scout uses the work-rights and sponsorship information you provide. It should not infer eligibility from your location or relocation preferences." },
      { q: "Can Scout handle permanent and contract searches?", a: "Yes. Employment type and salary or rate expectations can be defined in each profile so the two searches do not get mixed together." },
      { q: "How is Scout priced in Australia?", a: "Plans are priced in US dollars, not Australian dollars. AI plans are $39 or $79 a month and Human Assistant plans are $299, $499 or $999 a month, in US dollars. Prepaying 90 days saves about 10%, and Scout takes no placement fee or percentage of salary. No call is required to start: Activate a plan from your dashboard. Current allowances are on the [pricing page](/pricing)." },
      { q: "Can Scout write selection criteria responses for me?", a: "Flag these roles in your profile and supply real examples from your work. Long responses depend on your own evidence, so they should come back to you for input rather than being answered from a CV alone. A Human Assistant is the better fit if these roles are a large part of your search." },
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
    guide: [
      { title: "Local applications: what Nigerian employers ask", body: "Local employers usually want a CV and a short cover note, and many forms ask about NYSC status, your highest qualification, and your expected salary. Record whether you have completed NYSC, hold an exemption, or are still serving, so the answer is the same every time. Give salary in naira and mark it as monthly or annual, gross or net, because employers quote it in different ways. Separate Lagos, Abuja, and Port Harcourt if your commute or relocation limits differ between them." },
      { title: "Remote roles: read the location line", body: "A remote label does not mean a role is open to candidates in Nigeria. Many postings limit hiring to a region, a country, or a set of time zones. Your profile should say which regions you will accept, how many hours of overlap you can offer from West Africa Time, and whether you would work as a contractor. Set a pay target in the currency the employer is likely to use, separate from your naira figure. Every application should state where you really live." },
      { title: "Relocation and sponsorship campaigns", body: "Relocation searches carry the most risk of wasted applications, because a strong CV does not change whether an employer can sponsor you. Treat each destination country as its own profile, with its own CV format and a clear statement of what you would need there. Scout cannot obtain a visa or promise sponsorship, and it does not give immigration advice, so check the rules on the destination government's official site before adding a country." },
      { title: "Matching a lane to your campaign", body: "An AI Assistant suits one narrow campaign, such as local roles in Lagos or remote roles with a fixed title. AI Plus runs up to 3 active job profiles, which is one each for local, remote, and relocation. A Human Assistant is the better choice when eligibility needs careful reading, and the dedicated WhatsApp group keeps those questions moving. Full Search covers up to 2 profiles and Career Campaign up to 4 with 2 Human Assistants. Screenshots of important form answers come with Human plans only." },
    ],
    faqs: [
      { q: "Can someone apply for jobs for me from Nigeria?", a: "Yes. Scout supports Nigerian candidates through a dedicated Human Assistant or a lower-cost AI Assistant. Your location does not remove the need to meet each employer's work-eligibility rules." },
      { q: "Can Scout apply for remote jobs outside Nigeria?", a: "Scout can target remote roles based on your profile. The profile should distinguish worldwide remote jobs from roles restricted to a particular country or time zone." },
      { q: "Can Scout look for visa-sponsoring jobs?", a: "Sponsorship needs can be included in your profile. Scout cannot guarantee sponsorship and should only apply where the role and your stated eligibility align." },
      { q: "How do I communicate with a Human Assistant?", a: "Human Assistant members receive a private WhatsApp group for search updates and questions, which is especially useful when a multi-country campaign needs judgement." },
      { q: "How is Scout priced for job seekers in Nigeria?", a: "The prices listed here are in USD: AI plans are $39 or $79 a month and Human Assistant plans are $299, $499 or $999 a month, in US dollars. The [pricing page](/pricing) shows the local price for visitors in Nigeria. Prepaying 90 days saves about 10%, and there is no placement fee or percentage of salary. No call is required to start: Activate a plan from your dashboard." },
      { q: "Do I need a separate CV for local and international roles?", a: "Often, yes. A CV for a Lagos employer and a CV for a UK or Canadian employer can differ in length, personal details, and emphasis. Keep a version for each campaign and link it to the matching job profile so the right one is used." },
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
    guide: [
      { title: "What Indian application forms ask", body: "Forms and recruiters in India ask for more numbers than most markets. Expect total experience, relevant experience, current CTC, expected CTC, notice period, and current and preferred locations. Many also want to know whether you are serving notice, your last working day, and whether your notice can be bought out or shortened. Because recruiters compare these figures closely, an answer given loosely on one form can cause a problem later. Approve them once and update them when they change." },
      { title: "Preparing an Indian job profile", body: "Split your compensation into fixed and variable pay, and state whether your figures are annual CTC or take-home, since the two are easily confused. Give expected CTC as a number or a range, and say whether it may be described as negotiable. Name your cities in order of preference and say whether you would relocate. Add work-mode limits, including whether you would take night shifts or roles that follow UK or US hours. Many forms ask for years of experience with a named tool, so list accurate figures for your main skills and nothing has to be estimated." },
      { title: "Overseas and international remote searches", body: "An overseas search needs different answers from an India search: salary currency, work authorization, visa sponsorship, and often a different resume. Many resumes written for Indian recruiters include personal details, such as date of birth or marital status, that employers elsewhere do not expect, so keep a separate version. Give that search its own job profile and check visa rules on the destination government's official site. Scout applies the facts you approve and does not give immigration advice." },
      { title: "Which lane suits your search", body: "An AI Assistant suits a focused India-based search: stable titles, one or two cities, a fixed expected CTC, and a known notice period. AI Plus runs up to 3 active job profiles if Bengaluru, Hyderabad, and remote need separate rules. A Human Assistant suits searches where the answers change, such as a negotiable notice period, mixed India and overseas campaigns, or a senior move where compensation needs discussing role by role. The dedicated WhatsApp group keeps those decisions quick, and screenshots of important form answers are included. AI plans do not include those screenshots." },
    ],
    faqs: [
      { q: "Can someone apply for jobs for me in India?", a: "Yes. Choose Scout's dedicated Human Assistant or a lower-cost AI Assistant, define the search rules, and review completed work in your dashboard." },
      { q: "Can Scout answer current CTC and expected CTC questions?", a: "Yes, when you provide approved figures or guidance. Scout should not invent compensation information, and you can update it when your expectations change." },
      { q: "How does Scout handle my notice period?", a: "Your notice period is stored as an application fact. Keep it current and provide instructions for questions about negotiability or an available joining date." },
      { q: "Can I run an India search and an overseas search?", a: "Yes. Use separate job profiles so locations, salary currencies, sponsorship requirements, and resume strategies do not become mixed." },
      { q: "How is Scout priced in India?", a: "The prices listed here are in USD: AI plans are $39 or $79 a month and Human Assistant plans are $299, $499 or $999 a month, in US dollars. The [pricing page](/pricing) shows the local price for visitors in India. Prepaying 90 days saves about 10%, and Scout takes no placement fee or percentage of salary. No call is required to start: Activate a plan from your dashboard." },
      { q: "Can Scout apply while I am serving my notice period?", a: "Yes. Keep your last working day and earliest joining date current in your profile, and applications will use those approved dates. Tell your assistant as soon as either one changes, since an outdated date can cost you a role." },
    ],
  },
  {
    slug: "ireland", name: "Ireland", adjective: "Irish", locale: "en-IE", currency: "EUR", documentName: "CV",
    title: "Job Application Service in Ireland",
    description: "Scout's Human and AI assistants apply for Irish jobs for you using your CV, work permission, euro salary range, notice period, and role criteria.",
    eyebrow: "Done-for-you job applications in Ireland", heading: "Let Scout apply for jobs in Ireland for you.",
    hero: "Set the roles, counties, working pattern, salary in euro, and notice period that fit your Irish search. A Human or AI Assistant then handles the repetitive application work and keeps a record of every job.",
    contextTitle: "An Irish search comes down to a few precise answers",
    context: "Irish applications usually involve a CV, often a cover letter, and direct questions about work permission, notice period, and salary in euro. Scout records those answers in one job profile so they stay consistent from form to form.",
    realities: [
      { title: "CV and cover letter", body: "Set whether Scout uses an approved CV or a truthful tailored copy, and flag the roles where a cover letter is expected." },
      { title: "Work permission", body: "Record your citizenship, stamp, or employment permit details as explicit facts. Scout does not decide eligibility on your behalf." },
      { title: "Notice and start date", body: "Note the notice period in your contract and your earliest start date, so forms and recruiters get one consistent answer." },
    ],
    profileFields: ["Target roles and level", "Dublin, Cork, Galway, or other counties", "Remote, hybrid, or on-site", "Salary range in EUR", "Stamp, permit, or EU/EEA status", "Notice period and start date"],
    humanBestFor: "permit-dependent searches, career changes, senior roles, or campaigns covering Ireland and another market",
    aiBestFor: "a defined Irish search with stable roles, counties, salary range, and work-permission answers",
    guide: [
      { title: "How Irish applications differ", body: "Irish employers ask for a CV, usually kept to about two pages. Leave out a photo and date of birth unless an employer asks for them. Many roles still expect a cover letter, and recruitment agencies are a common route in sectors such as technology, finance, and pharma. The main quirk is the employer mix: US multinationals in Dublin and Cork often use one global form, so you may be asked about a resume, a visa, or work authorization in American phrasing. Answer in Irish terms, using the facts in your profile." },
      { title: "Stamp 1G, permits, and EU/EEA eligibility", body: "Work permission is the question to get exactly right. EEA and Swiss nationals do not need an employment permit to work in Ireland, and British citizens can work here without one under the Common Travel Area. Other candidates need an employment permit or an immigration permission that allows them to work without one. Stamp 1G, under the Third Level Graduate Programme, lets eligible non-EEA graduates of Irish awards work full time without a permit for a limited period. Record your stamp, its expiry date, and whether you will need a General or Critical Skills Employment Permit. Scout does not give immigration advice, and these rules can change, so check the official Irish immigration and employment permit pages." },
      { title: "What to put in an Irish job profile", body: "Name your locations. Dublin, Cork, Galway, and Limerick involve different commutes and hybrid patterns, and remote in Ireland is not the same as remote in Europe. Give your salary expectation in euro and mark it as gross annual pay, with or without bonus. Irish law sets a minimum notice period, but a longer period in your contract applies, so enter what your contract says along with your earliest start date. If you also want Northern Ireland roles, use a separate profile, because salary there is in pounds and UK right-to-work rules apply." },
      { title: "Which lane fits an Irish search", body: "An AI Assistant suits a search that stays the same from week to week, such as an EU citizen targeting one role family in Dublin. AI Essential covers 1 active job profile, and AI Plus covers up to 3 if Cork or remote roles need different rules. A Human Assistant is the better fit when each application needs a decision, for example when your work permission narrows which roles are worth applying for. You reach your assistant in a dedicated WhatsApp group and receive screenshots of important form answers, which AI plans do not include. Full Search covers up to 2 profiles, which suits a campaign across Ireland and the UK." },
    ],
    faqs: [
      { q: "Can someone apply for jobs for me in Ireland?", a: "Yes. Scout's Human Assistant assigns a person to your application work, and the AI Assistant is a lower-cost option for a clear, repeatable search. You set the rules, and each application is recorded in your dashboard." },
      { q: "Does Scout use a CV for Irish applications?", a: "Yes. Irish searches work from your CV, even when a multinational's form uses the word resume. Keep your approved version up to date in your profile." },
      { q: "Can Scout answer Stamp 1G and employment permit questions?", a: "Scout uses only the stamp, permit, and eligibility facts you approve. It does not decide whether you qualify or give immigration advice, and questions your profile cannot answer should come back to you." },
      { q: "How is Scout priced in Ireland?", a: "All plans are priced in US dollars, not euro. AI plans are $39 or $79 a month and Human Assistant plans are $299, $499 or $999 a month, in US dollars. Prepaying 90 days saves about 10%, and there is no placement fee or percentage of your salary. No call is required to start: Activate a plan from your dashboard. The [pricing page](/pricing) lists current allowances." },
      { q: "Can I search in Ireland and Northern Ireland at the same time?", a: "Yes, with separate job profiles. Northern Ireland is part of the UK, so salary currency and right-to-work questions differ from an Irish search. AI Plus runs up to 3 active job profiles and Full Search runs up to 2." },
      { q: "How does Scout handle notice period questions in Ireland?", a: "Your notice period is stored as an application fact, along with your earliest start date. Use the period in your contract and update it if your situation changes." },
    ],
  },
];

export const COUNTRY_ALTERNATES = COUNTRY_PAGES.map(({ locale, slug }) => ({
  locale,
  href: `/job-application-service/${slug}`,
}));
