export type Lane = "human" | "ai";
export type Billing = "one_time" | "recurring";

export interface Plan {
  code: string;
  lane: Lane;
  name: string;
  billing: Billing;
  priceCents: number;
  priceLabel: string;
  cadenceLabel: string;
  applications: string;
  applicationsQuota: number;
  profileLimit: number;
  blurb: string;
  features: string[];
  featured?: boolean;
  /** Env var holding the Dodo product id, e.g. DODO_PRODUCT_HUMAN_FULL. */
  productEnvKey: string;
}

export const PLANS: Plan[] = [
  {
    code: "human_focused", lane: "human", name: "Focused Search", billing: "one_time",
    priceCents: 29900, priceLabel: "$299", cadenceLabel: "one time",
    applications: "250 applications", applicationsQuota: 250, profileLimit: 1,
    blurb: "A dedicated person runs one clearly defined job search.",
    features: ["1 Human Assistant", "1 active job profile", "Dedicated WhatsApp group", "Dashboard tracking", "Resume used for every job", "Screenshots of important form answers"],
    productEnvKey: "DODO_PRODUCT_HUMAN_FOCUSED",
  },
  {
    code: "human_full", lane: "human", name: "Full Search", billing: "one_time",
    priceCents: 49900, priceLabel: "$499", cadenceLabel: "one time",
    applications: "500 applications", applicationsQuota: 500, profileLimit: 2, featured: true,
    blurb: "The complete Human Assistant service for an active search.",
    features: ["1 dedicated Human Assistant", "Up to 2 active job profiles", "Dedicated WhatsApp group", "Tailored resume for each job", "Detailed answer screenshots", "Jobs added from dashboard or Chrome"],
    productEnvKey: "DODO_PRODUCT_HUMAN_FULL",
  },
  {
    code: "human_campaign", lane: "human", name: "Career Campaign", billing: "one_time",
    priceCents: 99900, priceLabel: "$999", cadenceLabel: "one time",
    applications: "1,000 applications", applicationsQuota: 1000, profileLimit: 4,
    blurb: "More capacity and coordination for a broad or multi-role search.",
    features: ["2 Human Assistants", "Up to 4 active job profiles", "Priority WhatsApp support", "Tailored resumes and cover notes", "Detailed answer screenshots", "Weekly campaign review"],
    productEnvKey: "DODO_PRODUCT_HUMAN_CAMPAIGN",
  },
  {
    code: "ai_essential", lane: "ai", name: "AI Essential", billing: "recurring",
    priceCents: 3900, priceLabel: "$39", cadenceLabel: "/ month",
    applications: "75 applications / month", applicationsQuota: 75, profileLimit: 1,
    blurb: "A lower-cost assistant for one focused search.",
    features: ["1 active job profile", "Tailored resume per job", "Job and status tracking", "Resume-used record", "Add jobs from Chrome", "No form-answer screenshots"],
    productEnvKey: "DODO_PRODUCT_AI_ESSENTIAL",
  },
  {
    code: "ai_plus", lane: "ai", name: "AI Plus", billing: "recurring",
    priceCents: 7900, priceLabel: "$79", cadenceLabel: "/ month",
    applications: "200 applications / month", applicationsQuota: 200, profileLimit: 3, featured: true,
    blurb: "More profiles and volume for an active multi-role search.",
    features: ["Up to 3 active job profiles", "Tailored resumes and cover notes", "Priority AI queue", "Job and status tracking", "Resume-used record", "No form-answer screenshots"],
    productEnvKey: "DODO_PRODUCT_AI_PLUS",
  },
];

export function planByCode(code: string): Plan | null {
  return PLANS.find((plan) => plan.code === code) ?? null;
}

export function plansForLane(lane: Lane): Plan[] {
  return PLANS.filter((plan) => plan.lane === lane);
}

export function recommendedPlan(lane: Lane): Plan {
  const plans = plansForLane(lane);
  return plans.find((plan) => plan.featured) ?? plans[0];
}
