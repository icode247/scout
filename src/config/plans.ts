export type Lane = "human" | "ai";
export type Billing = "one_time" | "recurring";
/**
 * `standard` is the default term: AI bills monthly, Human bundles never expire.
 * `quarterly` is the prepaid 90-day term at roughly 10% off — AI bills every
 * 3 months with 3x the allowance, Human keeps the same allowance but must use
 * it within 90 days, which is what the discount pays for.
 */
export type Term = "standard" | "quarterly";

export const TERMS: { value: Term; label: string; hint: string }[] = [
  { value: "standard", label: "Standard", hint: "Monthly billing · bundles never expire" },
  { value: "quarterly", label: "90 days", hint: "Prepay 90 days and save ~10%" },
];

/**
 * Regions with fixed localized checkout prices (purchasing power parity).
 * Dodo charges exactly these amounts when the buyer's billing country matches;
 * everyone else pays the USD base price. `npm run dodo:localize` syncs the
 * amounts below onto the Dodo products, so change them here, then re-run it.
 */
export type RegionCode = "IN" | "NG";

export const REGIONS: Record<RegionCode, { country: string; currency: "INR" | "NGN"; symbol: string; locale: string }> = {
  IN: { country: "India", currency: "INR", symbol: "₹", locale: "en-IN" },
  NG: { country: "Nigeria", currency: "NGN", symbol: "₦", locale: "en-NG" },
};

export function regionCode(value: string | null | undefined): RegionCode | null {
  return value === "IN" || value === "NG" ? value : null;
}

/** Formats a smallest-unit amount as a whole-unit local price, e.g. 99900 → "₹999". */
export function formatRegionalAmount(region: RegionCode, amountMinor: number): string {
  const { symbol, locale } = REGIONS[region];
  return symbol + (amountMinor / 100).toLocaleString(locale, { maximumFractionDigits: 0 });
}

export function regionalPriceLabel(plan: Plan, region: RegionCode): string {
  return formatRegionalAmount(region, plan.regional[region]);
}

export interface Plan {
  code: string;
  /** Groups the standard and quarterly versions of the same product. */
  family: string;
  lane: Lane;
  term: Term;
  name: string;
  billing: Billing;
  priceCents: number;
  priceLabel: string;
  cadenceLabel: string;
  /** Months per billing cycle for recurring plans; 0 for one-time purchases. */
  billingMonths: number;
  /** Days the allowance stays valid. null means it never expires. */
  validityDays: number | null;
  applications: string;
  applicationsQuota: number;
  profileLimit: number;
  blurb: string;
  features: string[];
  featured?: boolean;
  /** Env var holding the Dodo product id, e.g. DODO_PRODUCT_HUMAN_FULL. */
  productEnvKey: string;
  /**
   * Fixed localized price per region, in the currency's smallest unit (paise,
   * kobo) — the same integer Dodo's localized-prices API takes. AI plans sit
   * near 70% off list, Human bundles near 35% because they carry real
   * assistant labor per application.
   */
  regional: Record<RegionCode, number>;
}

const HUMAN_FEATURES = {
  focused: ["1 Human Assistant", "1 active job profile", "Dedicated WhatsApp group", "Dashboard tracking", "Resume used for every job", "Screenshots of important form answers"],
  full: ["1 dedicated Human Assistant", "Up to 2 active job profiles", "Dedicated WhatsApp group", "Tailored resume for each job", "Detailed answer screenshots", "Jobs added from dashboard or Chrome"],
  campaign: ["2 Human Assistants", "Up to 4 active job profiles", "Priority WhatsApp support", "Tailored resumes and cover notes", "Detailed answer screenshots", "Weekly campaign review"],
};

const AI_FEATURES = {
  essential: ["1 active job profile", "Tailored resume per job", "Job and status tracking", "Resume-used record", "Add jobs from Chrome", "No form-answer screenshots"],
  plus: ["Up to 3 active job profiles", "Tailored resumes and cover notes", "Priority AI queue", "Job and status tracking", "Resume-used record", "No form-answer screenshots"],
};

export const PLANS: Plan[] = [
  // ---- Human Assistant: one-time application bundles ----
  {
    code: "human_focused", family: "human_focused", lane: "human", term: "standard",
    name: "Focused Search", billing: "one_time", billingMonths: 0, validityDays: null,
    priceCents: 29900, priceLabel: "$299", cadenceLabel: "one time",
    applications: "250 applications", applicationsQuota: 250, profileLimit: 1,
    blurb: "A dedicated person runs one clearly defined job search.",
    features: HUMAN_FEATURES.focused,
    productEnvKey: "DODO_PRODUCT_HUMAN_FOCUSED",
    regional: { IN: 1799900, NG: 26500000 },
  },
  {
    code: "human_focused_90", family: "human_focused", lane: "human", term: "quarterly",
    name: "Focused Search", billing: "one_time", billingMonths: 0, validityDays: 90,
    priceCents: 26900, priceLabel: "$269", cadenceLabel: "one time",
    applications: "250 applications · use within 90 days", applicationsQuota: 250, profileLimit: 1,
    blurb: "The same search, priced lower for a focused 90-day push.",
    features: HUMAN_FEATURES.focused,
    productEnvKey: "DODO_PRODUCT_HUMAN_FOCUSED_90",
    regional: { IN: 1599900, NG: 23900000 },
  },
  {
    code: "human_full", family: "human_full", lane: "human", term: "standard",
    name: "Full Search", billing: "one_time", billingMonths: 0, validityDays: null,
    priceCents: 49900, priceLabel: "$499", cadenceLabel: "one time",
    applications: "500 applications", applicationsQuota: 500, profileLimit: 2, featured: true,
    blurb: "The complete Human Assistant service for an active search.",
    features: HUMAN_FEATURES.full,
    productEnvKey: "DODO_PRODUCT_HUMAN_FULL",
    regional: { IN: 2999900, NG: 44500000 },
  },
  {
    code: "human_full_90", family: "human_full", lane: "human", term: "quarterly",
    name: "Full Search", billing: "one_time", billingMonths: 0, validityDays: 90,
    priceCents: 44900, priceLabel: "$449", cadenceLabel: "one time",
    applications: "500 applications · use within 90 days", applicationsQuota: 500, profileLimit: 2, featured: true,
    blurb: "The complete service, priced lower for a concentrated 90-day search.",
    features: HUMAN_FEATURES.full,
    productEnvKey: "DODO_PRODUCT_HUMAN_FULL_90",
    regional: { IN: 2699900, NG: 39900000 },
  },
  {
    code: "human_campaign", family: "human_campaign", lane: "human", term: "standard",
    name: "Career Campaign", billing: "one_time", billingMonths: 0, validityDays: null,
    priceCents: 99900, priceLabel: "$999", cadenceLabel: "one time",
    applications: "1,000 applications", applicationsQuota: 1000, profileLimit: 4,
    blurb: "More capacity and coordination for a broad or multi-role search.",
    features: HUMAN_FEATURES.campaign,
    productEnvKey: "DODO_PRODUCT_HUMAN_CAMPAIGN",
    regional: { IN: 5999900, NG: 88900000 },
  },
  {
    code: "human_campaign_90", family: "human_campaign", lane: "human", term: "quarterly",
    name: "Career Campaign", billing: "one_time", billingMonths: 0, validityDays: 90,
    priceCents: 89900, priceLabel: "$899", cadenceLabel: "one time",
    applications: "1,000 applications · use within 90 days", applicationsQuota: 1000, profileLimit: 4,
    blurb: "Full campaign capacity, priced lower for a 90-day window.",
    features: HUMAN_FEATURES.campaign,
    productEnvKey: "DODO_PRODUCT_HUMAN_CAMPAIGN_90",
    regional: { IN: 5399900, NG: 79900000 },
  },

  // ---- AI Assistant: subscriptions ----
  {
    code: "ai_essential", family: "ai_essential", lane: "ai", term: "standard",
    name: "AI Essential", billing: "recurring", billingMonths: 1, validityDays: null,
    priceCents: 3900, priceLabel: "$39", cadenceLabel: "/ month",
    applications: "75 applications / month", applicationsQuota: 75, profileLimit: 1,
    blurb: "A lower-cost assistant for one focused search.",
    features: AI_FEATURES.essential,
    productEnvKey: "DODO_PRODUCT_AI_ESSENTIAL",
    regional: { IN: 99900, NG: 1600000 },
  },
  {
    code: "ai_essential_90", family: "ai_essential", lane: "ai", term: "quarterly",
    name: "AI Essential", billing: "recurring", billingMonths: 3, validityDays: null,
    priceCents: 10500, priceLabel: "$105", cadenceLabel: "/ 90 days",
    applications: "225 applications / 90 days", applicationsQuota: 225, profileLimit: 1,
    blurb: "The same assistant, prepaid for 90 days at a lower rate.",
    features: AI_FEATURES.essential,
    productEnvKey: "DODO_PRODUCT_AI_ESSENTIAL_90",
    regional: { IN: 269900, NG: 4300000 },
  },
  {
    code: "ai_plus", family: "ai_plus", lane: "ai", term: "standard",
    name: "AI Plus", billing: "recurring", billingMonths: 1, validityDays: null,
    priceCents: 7900, priceLabel: "$79", cadenceLabel: "/ month",
    applications: "200 applications / month", applicationsQuota: 200, profileLimit: 3, featured: true,
    blurb: "More profiles and volume for an active multi-role search.",
    features: AI_FEATURES.plus,
    productEnvKey: "DODO_PRODUCT_AI_PLUS",
    regional: { IN: 219900, NG: 3200000 },
  },
  {
    code: "ai_plus_90", family: "ai_plus", lane: "ai", term: "quarterly",
    name: "AI Plus", billing: "recurring", billingMonths: 3, validityDays: null,
    priceCents: 21300, priceLabel: "$213", cadenceLabel: "/ 90 days",
    applications: "600 applications / 90 days", applicationsQuota: 600, profileLimit: 3, featured: true,
    blurb: "Multi-role volume, prepaid for 90 days at a lower rate.",
    features: AI_FEATURES.plus,
    productEnvKey: "DODO_PRODUCT_AI_PLUS_90",
    regional: { IN: 589900, NG: 8650000 },
  },
];

export function planByCode(code: string): Plan | null {
  return PLANS.find((plan) => plan.code === code) ?? null;
}

export function plansForLane(lane: Lane, term: Term = "standard"): Plan[] {
  return PLANS.filter((plan) => plan.lane === lane && plan.term === term);
}

export function recommendedPlan(lane: Lane, term: Term = "standard"): Plan {
  const plans = plansForLane(lane, term);
  return plans.find((plan) => plan.featured) ?? plans[0];
}

/** The standard-term sibling a quarterly plan is discounted against. */
export function standardSibling(plan: Plan): Plan | null {
  if (plan.term === "standard") return null;
  return PLANS.find((other) => other.family === plan.family && other.term === "standard") ?? null;
}

/**
 * What a quarterly plan saves against paying the standard way for the same
 * period: three monthly charges for AI, or the one-time bundle price for Human.
 */
export function savings(plan: Plan): { cents: number; percent: number; label: string } | null {
  const sibling = standardSibling(plan);
  if (!sibling) return null;
  const comparable = sibling.billing === "recurring" ? sibling.priceCents * 3 : sibling.priceCents;
  const cents = comparable - plan.priceCents;
  if (cents <= 0) return null;
  return {
    cents,
    percent: Math.round((cents / comparable) * 100),
    label: `Save $${Math.round(cents / 100)}`,
  };
}
