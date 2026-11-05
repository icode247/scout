/**
 * Clinton decisions for the November 1, 2026 marketing copy.
 * Flags that are still open stay off. Do not print the decision as page copy.
 *
 * TODO(CLINTON-DECISION): brand name. Title tags use "Scout" because that is
 * SITE.name. The domain and team name are ApplyScout. Do not rename the site
 * until Clinton chooses.
 *
 * TODO(CLINTON-DECISION): named author, role, bio, and reviewer. The posts keep
 * the same "Scout Editorial Team" byline as the rest of the blog. Do not print
 * a hold note under the byline.
 */

/** Decision 1. Five-plan Offer / hasOfferCatalog JSON-LD. Visible plan prices stay either way. */
export const OFFER_SCHEMA_ENABLED = false;

/** Decision 4. Scale.jobs price comparison on the cost article. */
export const SCALE_JOBS_COMPARISON_ENABLED = false;

/** Decision 5. Home logo strip, named testimonials, and interview-invitation quote. */
export const UNVERIFIED_SOCIAL_PROOF_ENABLED = false;

/** Decision 6. "No call is required" vs "Start with a strategy call." Neither line is rendered until Clinton chooses. */
export const NO_CALL_REQUIRED_CLAIM_ENABLED = false;

/** Decision 7. Competitor prices. Re-check every figure on publish day before turning this on. */
export const COMPETITOR_PRICES_ENABLED = false;

/** Verified by Clinton on Nov 1, 2026. Human plan feature lists from the drafts. */
export const HUMAN_PLAN_FEATURES_ENABLED = true;

/** TODO(CLINTON-DECISION): approve the conflict-of-interest disclosure wording. */
export const DISCLOSURE_ENABLED = false;

/** Verified by Clinton on Nov 1, 2026. "No percentage of your salary" / "no cut of your salary". */
export const SALARY_PERCENTAGE_CLAIM_ENABLED = true;
