/**
 * Data for programmatic /auto-apply/[ats] pages.
 * Strongest verified SEO cluster (fragmented, low-difficulty SERP).
 * Differentiator to hammer everywhere: Scout auto-SUBMITS, it doesn't just autofill.
 */
export type AtsPage = {
  slug: string;
  name: string;
  keyword: string; // primary target keyword
  kind: "ATS" | "job board";
  intro: string;
  bullets: string[];
  faqs: { q: string; a: string }[];
};

export const ATS_PAGES: AtsPage[] = [
  {
    slug: "workday",
    name: "Workday",
    keyword: "auto apply Workday jobs",
    kind: "ATS",
    intro:
      "Scout completes long Workday applications for you, including account setup and multi-page forms, using a resume and cover letter tailored to each role.",
    bullets: [
      "Completes Workday's multi-step application flow end to end, not just autofill.",
      "Re-uses your profile so you never re-type your history per company.",
      "Tailors your resume and cover letter to each Workday posting.",
      "Paces submissions with human-like rate limits to protect your accounts.",
    ],
    faqs: [
      { q: "Can you auto-apply to Workday jobs?", a: "Yes. Scout completes and submits Workday applications for you, including the multi-page forms and profile creation, using a resume and cover letter tailored to each role. Unlike autofill extensions that only pre-fill fields, Scout finishes and submits the application." },
      { q: "Does Scout work across different companies' Workday sites?", a: "Yes. Workday is used by thousands of employers with separate portals; Scout handles the common Workday flow so you can apply across many companies without re-entering your information each time." },
    ],
  },
  {
    slug: "greenhouse",
    name: "Greenhouse",
    keyword: "auto apply Greenhouse jobs",
    kind: "ATS",
    intro:
      "Greenhouse powers applications at thousands of fast-growing companies. Scout applies to Greenhouse roles automatically with documents tailored to each job.",
    bullets: [
      "Submits Greenhouse applications with your tailored resume and cover letter.",
      "Handles custom application questions using your profile.",
      "Applies across every company that runs on Greenhouse.",
      "You approve each application by swiping, nothing goes out without you.",
    ],
    faqs: [
      { q: "Can Scout auto-apply to Greenhouse jobs?", a: "Yes, Scout submits Greenhouse applications for you with a resume and cover letter tailored to the specific role, including common screening questions, while keeping you in control via swipe approval." },
    ],
  },
  {
    slug: "lever",
    name: "Lever",
    keyword: "auto apply Lever jobs",
    kind: "ATS",
    intro:
      "Lever is a common ATS at startups and scale-ups. Scout completes and submits Lever applications with tailored documents so you can apply to more of them, faster.",
    bullets: [
      "Auto-submits Lever applications, not just field autofill.",
      "Tailors resume and cover letter to each Lever posting.",
      "Applies across all companies using Lever from one profile.",
      "Human-like pacing keeps your accounts safe.",
    ],
    faqs: [
      { q: "Does Scout support Lever job applications?", a: "Yes. Scout applies to roles hosted on Lever automatically, submitting a tailored resume and cover letter for each one." },
    ],
  },
  {
    slug: "linkedin",
    name: "LinkedIn",
    keyword: "auto apply LinkedIn jobs",
    kind: "job board",
    intro:
      "LinkedIn has the volume, but applying one-by-one (even with Easy Apply) is slow. Scout finds your LinkedIn matches and applies with tailored documents, safely.",
    bullets: [
      "Applies to matching LinkedIn roles with a resume and cover letter tailored per job.",
      "Human-like rate limits specifically to protect your LinkedIn account.",
      "You approve each application by swiping, no spammy mass blasting.",
      "Combines with First Apply to reach new postings early.",
    ],
    faqs: [
      { q: "Is it safe to auto-apply on LinkedIn?", a: "Scout is designed to apply safely on LinkedIn: it paces applications with human-like rate limits, keeps you approving each one, and never mass-blasts identical applications, the behavior that gets accounts flagged." },
      { q: "Does Scout work with LinkedIn Easy Apply?", a: "Scout applies to matching LinkedIn roles for you with tailored documents, going beyond manual Easy Apply by ranking matches and handling the submission." },
    ],
  },
  {
    slug: "indeed",
    name: "Indeed",
    keyword: "auto apply Indeed jobs",
    kind: "job board",
    intro:
      "Indeed lists millions of jobs. Scout filters them to your real matches and applies automatically with tailored documents, so you spend zero time scrolling.",
    bullets: [
      "Surfaces only Indeed roles that match your resume and preferences.",
      "Submits applications with a tailored resume and cover letter.",
      "Pairs with First Apply to hit new Indeed postings early.",
      "Swipe to approve, you stay in control.",
    ],
    faqs: [
      { q: "Can Scout automatically apply to Indeed jobs?", a: "Yes. Scout finds matching Indeed jobs and submits applications for you with tailored documents, so you don't have to scroll and apply manually." },
    ],
  },
  {
    slug: "glassdoor",
    name: "Glassdoor",
    keyword: "auto apply Glassdoor jobs",
    kind: "job board",
    intro:
      "Research companies on Glassdoor, then let Scout apply to the matching roles automatically with documents tailored to each one.",
    bullets: [
      "Applies to matching Glassdoor roles with tailored resume and cover letter.",
      "One profile covers Glassdoor alongside every other board and ATS.",
      "Human-like pacing and swipe approval keep it safe and in your control.",
    ],
    faqs: [
      { q: "Does Scout auto-apply to Glassdoor jobs?", a: "Yes, Scout applies to your matching Glassdoor roles automatically, submitting a tailored resume and cover letter for each." },
    ],
  },
  {
    slug: "ziprecruiter",
    name: "ZipRecruiter",
    keyword: "auto apply ZipRecruiter jobs",
    kind: "job board",
    intro:
      "ZipRecruiter pushes your application to many employers. Scout makes sure each one is tailored, and submits them for you automatically.",
    bullets: [
      "Auto-applies to matching ZipRecruiter roles with tailored documents.",
      "Filters to genuine matches so you're not applying blindly.",
      "Works from the same profile as every other board and ATS.",
    ],
    faqs: [
      { q: "Can Scout apply to ZipRecruiter jobs automatically?", a: "Yes. Scout finds matching ZipRecruiter roles and submits tailored applications for you." },
    ],
  },
];
