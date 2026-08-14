#!/usr/bin/env node
/**
 * Syncs the regional (purchasing power parity) prices from src/config/plans.ts
 * onto the Dodo products: sets each product's pricing_mode to by_country and
 * creates or updates one localized-price rule per region. Safe to re-run —
 * existing rules are updated in place, never duplicated.
 *
 * Run after `npm run dodo:setup` has created the products and their ids are in
 * the environment:
 *
 *   npm run dodo:localize
 */
import { PLANS, REGIONS } from "../src/config/plans.ts";

const key = process.env.DODO_API_KEY;
if (!key) {
  console.error("DODO_API_KEY is not set.\n\nRun this through npm so the env files load:\n  npm run dodo:localize");
  process.exit(1);
}

const live = process.env.DODO_ENVIRONMENT === "live_mode";
const base = live ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };

console.error(`Syncing localized prices against ${live ? "LIVE" : "TEST"} mode (${base})\n`);

async function request(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, payload };
}

let failures = 0;
let skipped = 0;

for (const plan of PLANS) {
  const productId = process.env[plan.productEnvKey]?.trim();
  const label = plan.term === "quarterly" ? `${plan.name} (90 days)` : plan.name;
  if (!productId) {
    console.error(`· ${label} — ${plan.productEnvKey} is not set, skipping`);
    skipped += 1;
    continue;
  }

  const mode = await request("PATCH", `/products/${encodeURIComponent(productId)}`, { pricing_mode: "by_country" });
  if (!mode.ok) {
    console.error(`✗ ${label} — could not set pricing_mode (${mode.status} ${JSON.stringify(mode.payload)})`);
    failures += 1;
    continue;
  }

  const listed = await request("GET", `/products/${encodeURIComponent(productId)}/localized-prices`);
  const items = Array.isArray(listed.payload?.items) ? listed.payload.items
    : Array.isArray(listed.payload?.data) ? listed.payload.data
    : Array.isArray(listed.payload) ? listed.payload : [];
  const byCountry = new Map(
    items
      .filter((item) => item && !item.archived && item.country_code)
      .map((item) => [String(item.country_code), item]),
  );

  for (const [region, config] of Object.entries(REGIONS)) {
    const amount = plan.regional[region];
    const existing = byCountry.get(region);

    if (existing && Number(existing.amount) === amount && String(existing.currency) === config.currency) {
      console.error(`· ${label} ${region} — already ${config.symbol}${amount / 100}, unchanged`);
      continue;
    }

    const result = existing
      ? await request(
          "PATCH",
          `/products/${encodeURIComponent(productId)}/localized-prices/${encodeURIComponent(String(existing.id || existing.localized_price_id))}`,
          { amount },
        )
      : await request(`POST`, `/products/${encodeURIComponent(productId)}/localized-prices`, {
          currency: config.currency,
          country_code: region,
          amount,
        });

    if (!result.ok) {
      console.error(`✗ ${label} ${region} — ${result.status} ${JSON.stringify(result.payload)}`);
      failures += 1;
      continue;
    }
    console.error(`${existing ? "↻" : "✓"} ${label} ${region} — ${config.symbol}${(amount / 100).toLocaleString(config.locale)}`);
  }
}

if (skipped) console.error(`\n${skipped} plan(s) skipped for missing product ids — run npm run dodo:setup first.`);
if (failures) {
  console.error(`\n${failures} operation(s) failed. Fix the errors above and re-run — the sync is idempotent.`);
  process.exit(1);
}
console.error("\nDone. Checkout now charges the localized amounts for buyers billing from India and Nigeria.");
