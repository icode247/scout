#!/usr/bin/env node
/**
 * Creates the Scout products in Dodo Payments and prints the env lines to paste
 * into Vercel. Safe to re-run: it lists the brand's existing products first and
 * skips any whose name already exists, so it never creates duplicates.
 *
 * Products belong to a Dodo *brand*, which decides the logo on the checkout
 * page, the support email, and the descriptor on the buyer's card statement.
 * One Dodo account can hold several brands, so leaving it unset silently files
 * Scout's products under whichever brand happens to be the account default.
 *
 *   DODO_API_KEY=... [DODO_BRAND_NAME="Scout AI"] npm run dodo:setup
 */
// Imported directly: Node 22 strips the TypeScript annotations, so the catalog
// stays a single source of truth with no build step and no parsing.
import { PLANS } from "../src/config/plans.ts";

const key = process.env.DODO_API_KEY;
if (!key) {
  // Run via `npm run dodo:setup`, which loads .env / .env.local for you —
  // a bare `node scripts/dodo-setup.mjs` gets no environment file at all.
  console.error("DODO_API_KEY is not set.\n\nRun this through npm so the env files load:\n  npm run dodo:setup\n\nOr pass it inline:\n  DODO_API_KEY=... npm run dodo:setup");
  process.exit(1);
}

const live = process.env.DODO_ENVIRONMENT === "live_mode";
const base = live ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };

console.error(`Creating products against ${live ? "LIVE" : "TEST"} mode (${base})`);

/**
 * Resolves the brand to file the products under. An explicit DODO_BRAND_ID wins;
 * otherwise we match DODO_BRAND_NAME (default "Scout AI") against the account's
 * brands. Rather than fall back to the account default — which is how these
 * products ended up under a sibling product's brand — an unresolvable name is a
 * hard failure that prints the real choices.
 */
async function resolveBrandId() {
  const explicit = process.env.DODO_BRAND_ID?.trim();
  const wanted = (process.env.DODO_BRAND_NAME || "Scout AI").trim();

  const response = await fetch(`${base}/brands`, { headers });
  if (!response.ok) {
    console.error(`\nCould not list brands — ${response.status}. Check DODO_API_KEY and DODO_ENVIRONMENT.`);
    process.exit(1);
  }
  const body = await response.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : Array.isArray(body?.data) ? body.data : [];
  const brands = items.map((item) => ({ id: String(item.brand_id || item.id), name: String(item.name || "") }));

  const match = explicit
    ? brands.find((brand) => brand.id === explicit)
    : brands.find((brand) => brand.name.toLowerCase() === wanted.toLowerCase());

  if (!match) {
    const label = explicit ? `DODO_BRAND_ID=${explicit}` : `brand named "${wanted}"`;
    console.error(`\nNo ${label} in this Dodo account. Available brands:\n`);
    brands.forEach((brand) => console.error(`  ${brand.id}  ${brand.name}`));
    console.error(`\nSet DODO_BRAND_ID (or DODO_BRAND_NAME) to one of the above and re-run.`);
    process.exit(1);
  }
  return match;
}

const brand = await resolveBrandId();
console.error(`Brand: ${brand.name} (${brand.id})\n`);

/**
 * Both terms of a product share a display name ("Full Search"), so the Dodo
 * product name has to disambiguate them — otherwise the reuse-by-name lookup
 * below would hand the quarterly plan the standard plan's product id.
 */
function productName(plan) {
  return plan.term === "quarterly" ? `${plan.name} (90 days)` : plan.name;
}

/**
 * Scoped to the brand: an account can hold a "Pro" product under two different
 * brands, and an unscoped name lookup would hand Scout the wrong one.
 */
async function existingProducts() {
  const response = await fetch(`${base}/products?page_size=100&brand_id=${encodeURIComponent(brand.id)}`, { headers });
  if (!response.ok) return new Map();
  const body = await response.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : Array.isArray(body?.data) ? body.data : [];
  return new Map(items.filter((item) => item?.name).map((item) => [String(item.name), String(item.product_id || item.id)]));
}

/**
 * Moves a product this environment already points at onto the target brand.
 * Without this, a re-run after fixing the brand would leave the old products
 * stranded on the wrong one and create a duplicate set alongside them.
 */
async function adoptConfiguredProduct(plan) {
  const id = process.env[plan.productEnvKey]?.trim();
  if (!id) return null;

  const response = await fetch(`${base}/products/${encodeURIComponent(id)}`, { headers });
  if (!response.ok) return null;
  const product = await response.json().catch(() => null);
  if (!product) return null;

  const current = String(product.brand_id || "");
  if (current === brand.id) {
    console.error(`· ${productName(plan)} — already on ${brand.name}, reusing`);
    return id;
  }

  const patch = await fetch(`${base}/products/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ brand_id: brand.id }),
  });
  if (!patch.ok) {
    console.error(`! ${productName(plan)} — on another brand and could not be moved (${patch.status})`);
    return null;
  }
  console.error(`↻ ${productName(plan)} — moved onto ${brand.name}`);
  return id;
}

const plans = PLANS;
const existing = await existingProducts();
const lines = [];
let failures = 0;

for (const plan of plans) {
  const adopted = await adoptConfiguredProduct(plan);
  if (adopted) {
    lines.push(`${plan.productEnvKey}=${adopted}`);
    continue;
  }

  const already = existing.get(productName(plan));
  if (already) {
    console.error(`· ${productName(plan)} — already exists, reusing`);
    lines.push(`${plan.productEnvKey}=${already}`);
    continue;
  }

  const price = plan.billing === "recurring"
    ? {
        type: "recurring_price", price: plan.priceCents, currency: "USD",
        // billingMonths is 1 for the monthly term and 3 for the prepaid 90-day term.
        payment_frequency_count: plan.billingMonths, payment_frequency_interval: "Month",
        subscription_period_count: plan.billingMonths, subscription_period_interval: "Month",
        discount: 0, purchasing_power_parity: false, tax_inclusive: false,
      }
    : {
        type: "one_time_price", price: plan.priceCents, currency: "USD",
        discount: 0, purchasing_power_parity: false, tax_inclusive: false,
      };

  const response = await fetch(`${base}/products`, {
    method: "POST",
    headers,
    body: JSON.stringify({ brand_id: brand.id, name: productName(plan), description: plan.blurb, tax_category: "saas", price }),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    failures += 1;
    console.error(`✗ ${productName(plan)} — ${response.status} ${JSON.stringify(body)}`);
    continue;
  }
  console.error(`✓ ${productName(plan)}`);
  lines.push(`${plan.productEnvKey}=${body.product_id || body.id}`);
}

console.error("\nPaste these into your environment (Vercel → Settings → Environment Variables):\n");
console.log(lines.join("\n"));
if (failures) {
  console.error(`\n${failures} product(s) failed. Fix the errors above and re-run — existing products are reused, not duplicated.`);
  process.exit(1);
}
