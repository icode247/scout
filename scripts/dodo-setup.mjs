#!/usr/bin/env node
/**
 * Creates the five Scout products in Dodo Payments and prints the env lines to
 * paste into Vercel. Safe to re-run: it lists existing products first and skips
 * any whose name already exists, so it never creates duplicates.
 *
 *   DODO_API_KEY=... [DODO_ENVIRONMENT=live_mode] npm run dodo:setup
 */
// Imported directly: Node 22 strips the TypeScript annotations, so the catalog
// stays a single source of truth with no build step and no parsing.
import { PLANS } from "../src/config/plans.ts";

const key = process.env.DODO_API_KEY;
if (!key) {
  console.error("Set DODO_API_KEY before running this script.");
  process.exit(1);
}

const live = process.env.DODO_ENVIRONMENT === "live_mode";
const base = live ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };

console.error(`Creating products against ${live ? "LIVE" : "TEST"} mode (${base})\n`);

/**
 * Both terms of a product share a display name ("Full Search"), so the Dodo
 * product name has to disambiguate them — otherwise the reuse-by-name lookup
 * below would hand the quarterly plan the standard plan's product id.
 */
function productName(plan) {
  return plan.term === "quarterly" ? `${plan.name} (90 days)` : plan.name;
}

async function existingProducts() {
  const response = await fetch(`${base}/products?page_size=100`, { headers });
  if (!response.ok) return new Map();
  const body = await response.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : Array.isArray(body?.data) ? body.data : [];
  return new Map(items.filter((item) => item?.name).map((item) => [String(item.name), String(item.product_id || item.id)]));
}

const plans = PLANS;
const existing = await existingProducts();
const lines = [];
let failures = 0;

for (const plan of plans) {
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
    body: JSON.stringify({ name: productName(plan), description: plan.blurb, tax_category: "saas", price }),
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
