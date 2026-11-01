import { SITE } from "./site";

/**
 * Five-plan Offer catalog from the approved /job-application-service draft.
 * Rendered only when OFFER_SCHEMA_ENABLED is true.
 * Prices match us-pricing-2026-11-01: 39, 79, 299, 499, 999 monthly and
 * 105, 213, 807, 1347, 2697 for 90 days.
 */
const aiUrl = new URL("/ai-job-application-assistant", SITE.url).href;
const humanUrl = new URL("/human-job-application-service", SITE.url).href;

function offer(name: string, description: string, price: string, billingDuration: "P1M" | "P3M", url: string) {
  return {
    "@type": "Offer",
    name,
    description,
    price,
    priceCurrency: "USD",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price,
      priceCurrency: "USD",
      billingDuration,
    },
    url,
  };
}

export const fivePlanOffers = [
  offer("AI Essential (AI Assistant), monthly", "AI Essential: 75 applications per month.", "39", "P1M", aiUrl),
  offer("AI Plus (AI Assistant), monthly", "AI Plus: 200 applications per month.", "79", "P1M", aiUrl),
  offer("Focused Search (Human Assistant), monthly", "Focused Search: 250 applications per month.", "299", "P1M", humanUrl),
  offer("Full Search (Human Assistant), monthly", "Full Search: 500 applications per month.", "499", "P1M", humanUrl),
  offer("Career Campaign (Human Assistant), monthly", "Career Campaign: 1,000 applications per month.", "999", "P1M", humanUrl),
  offer("AI Essential (AI Assistant), 90 days prepaid", "AI Essential: prepay 90 days for $105.", "105", "P3M", aiUrl),
  offer("AI Plus (AI Assistant), 90 days prepaid", "AI Plus: prepay 90 days for $213.", "213", "P3M", aiUrl),
  offer("Focused Search (Human Assistant), 90 days prepaid", "Focused Search: prepay 90 days for $807.", "807", "P3M", humanUrl),
  offer("Full Search (Human Assistant), 90 days prepaid", "Full Search: prepay 90 days for $1,347.", "1347", "P3M", humanUrl),
  offer("Career Campaign (Human Assistant), 90 days prepaid", "Career Campaign: prepay 90 days for $2,697.", "2697", "P3M", humanUrl),
];

/** Service JSON-LD that replaces the old two-offer block after Clinton approves Offer schema. */
export function approvedServiceLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Scout job application service",
    serviceType: "Done-for-you job application service",
    provider: { "@id": new URL("/#organization", SITE.url).href },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Job application assistant plans (US dollars)",
      itemListElement: fivePlanOffers,
    },
  };
}
