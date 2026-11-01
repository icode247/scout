/**
 * Clinton decisions for the November 1, 2026 marketing copy.
 * Every flag stays off until the matching item in the draft PR is approved.
 * Do not flip one to publish an unverified claim.
 *
 * TODO(CLINTON-DECISION): brand name. New title tags use "Scout" because that is
 * SITE.name and the approved title tags end in "| Scout". The domain and team
 * name are ApplyScout. Do not rename the site until Clinton chooses.
 */

/** Decision 1. Five-plan Offer / hasOfferCatalog JSON-LD. */
export const OFFER_SCHEMA_ENABLED = false;

/** Decision 4. Scale.jobs price comparison on the cost article. */
export const SCALE_JOBS_COMPARISON_ENABLED = false;

/** Decision 5. Home logo strip, named testimonials, and interview-invitation quote. */
export const UNVERIFIED_SOCIAL_PROOF_ENABLED = false;

/** Decision 7. Competitor prices. Re-check every figure on publish day before turning this on. */
export const COMPETITOR_PRICES_ENABLED = false;

/** Verified by Clinton on Nov 1, 2026. Human plan feature lists from the drafts. */
export const HUMAN_PLAN_FEATURES_ENABLED = true;

/** TODO(CLINTON-DECISION): approve the conflict-of-interest disclosure wording. */
export const DISCLOSURE_ENABLED = false;

/** Verified by Clinton on Nov 1, 2026. "No percentage of your salary" / "no cut of your salary". */
export const SALARY_PERCENTAGE_CLAIM_ENABLED = true;
