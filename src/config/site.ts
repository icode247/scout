/**
 * Central site configuration, single source of truth.
 * Change domain, store links, and pricing here; the whole site updates.
 */

export const SITE = {
  name: "Scout",
  // Brand always pairs the generic word "Scout" with a descriptor (ASO/trademark crowding).
  tagline: "Human + AI Job Application Service",
  // TODO(founder): confirm final domain. Placeholder until purchased.
  url: "https://getscout.app",
  description:
    "Scout is a done-for-you job application service. Choose a dedicated Human Assistant or a lower-cost AI Assistant to find roles, tailor resumes, apply on your behalf, and track every submission.",
  locale: "en_US",
  themeColor: "#7fc92b",
  twitter: "@getscout",
  // Sister brand we cross-link for authority.
  sister: { name: "FastApply", url: "https://fastapply.co" },
} as const;

export const STORE = {
  // TODO(founder): drop in the live store URLs once IDs are confirmed.
  appStore: "https://apps.apple.com/app/scout-ai-job-apply/id000000000",
  playStore: "https://play.google.com/store/apps/details?id=com.fastapply.app",
  // Single smart link that routes by device (used by QR + /download).
  smartLink: "https://getscout.app/download",
} as const;

export type NavItem = { label: string; href: string };

export const NAV: NavItem[] = [
  { label: "How it works", href: "/how-it-works" },
  { label: "AI assistant", href: "/ai-job-application-assistant" },
  { label: "Human assistant", href: "/human-job-application-service" },
  { label: "Safety", href: "/safety" },
  { label: "Pricing", href: "/pricing" },
  { label: "Compare", href: "/compare" },
];

export const FOOTER: { heading: string; links: NavItem[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Job application service", href: "/job-application-service" },
      { label: "How it works", href: "/how-it-works" },
      { label: "AI assistant", href: "/ai-job-application-assistant" },
      { label: "Human assistant", href: "/human-job-application-service" },
      { label: "Pricing", href: "/pricing" },
      { label: "Download", href: "/download" },
    ],
  },
  {
    heading: "Auto-apply",
    links: [
      { label: "Workday", href: "/auto-apply/workday" },
      { label: "Greenhouse", href: "/auto-apply/greenhouse" },
      { label: "Lever", href: "/auto-apply/lever" },
      { label: "LinkedIn", href: "/auto-apply/linkedin" },
      { label: "Indeed", href: "/auto-apply/indeed" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Is auto-apply safe?", href: "/safety" },
      { label: "Compare tools", href: "/compare" },
      { label: "FastApply (extension)", href: "https://fastapply.co" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Support", href: "/support" },
      { label: "Delete account", href: "/delete-account" },
    ],
  },
];

/**
 * Pricing tiers. Numbers are illustrative, confirm before launch.
 * COGS context: ~$4.45 / active profile / mo (FastApply backend, ~75 apps).
 */
export type Tier = {
  id: string;
  name: string;
  priceMonthly: number; // USD
  priceAnnual: number; // USD per month, billed annually
  blurb: string;
  cta: string;
  featured?: boolean;
  features: string[];
};

export const TIERS: Tier[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 0,
    priceAnnual: 0,
    blurb: "Set up your profile and preview matched jobs.",
    cta: "Start free",
    features: [
      "10 AI-assisted applications / month",
      "Resume-to-job matching",
      "Daily job queue preview",
      "1 resume profile",
    ],
  },
  {
    id: "ai",
    name: "AI Assistant",
    priceMonthly: 29,
    priceAnnual: 24,
    blurb: "Daily done-for-you applications at the lower-cost AI tier.",
    cta: "Start AI",
    featured: true,
    features: [
      "Up to 75 applications / month",
      "Tailored resume + cover letter per job",
      "Daily application queue",
      "All job boards & ATS (Workday, Greenhouse, Lever...)",
      "Application tracking",
    ],
  },
  {
    id: "human",
    name: "Human Assistant",
    priceMonthly: 99,
    priceAnnual: 89,
    blurb: "Human assistant QA for higher-stakes searches.",
    cta: "Book a strategy call",
    features: [
      "Everything in AI Assistant",
      "Dedicated human applies for you",
      "Private WhatsApp assistant group",
      "Screenshots of application answers",
      "Multiple job and resume profiles",
    ],
  },
];

export const STATS = {
  // TODO(founder): replace with real, verifiable numbers before launch.
  applicationsSent: "250,000+",
  rating: "4.8",
  ratingCount: "1,200+",
} as const;
