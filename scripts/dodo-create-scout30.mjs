#!/usr/bin/env node

const key = process.env.DODO_API_KEY?.trim();
const productEnvKeys = [
  "DODO_PRODUCT_AI_ESSENTIAL",
  "DODO_PRODUCT_AI_PLUS",
  "DODO_PRODUCT_HUMAN_FOCUSED",
  "DODO_PRODUCT_HUMAN_FULL",
  "DODO_PRODUCT_HUMAN_CAMPAIGN",
];
const productIds = productEnvKeys.map((name) => process.env[name]?.trim());
if (!key || productIds.some((id) => !id)) {
  console.error(`DODO_API_KEY and standard-plan product ids are required: ${productEnvKeys.join(", ")}`);
  process.exit(1);
}

const live = process.env.DODO_ENVIRONMENT === "live_mode";
const base = live ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };
const code = "SCOUT30";
const expectedProducts = productIds.map(String).sort();

async function json(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`);
  return body;
}

console.error(`Checking ${code} in Dodo ${live ? "LIVE" : "TEST"} mode…`);
const listed = await json(await fetch(`${base}/discounts?code=${code}&page_size=100`, { headers }));
const existing = (Array.isArray(listed?.items) ? listed.items : []).find((item) => String(item.code).toUpperCase() === code);

if (existing) {
  const actualProducts = (existing.restricted_to || []).map(String).sort();
  const termsValid = existing.type === "percentage"
    && Number(existing.amount) === 3000
    && Number(existing.subscription_cycles) === 1;
  if (!termsValid) {
    console.error(`${code} already exists but does not match 30% × one subscription cycle. Refusing to silently change its financial terms.`);
    process.exit(1);
  }
  if (JSON.stringify(actualProducts) !== JSON.stringify(expectedProducts)) {
    await json(await fetch(`${base}/discounts/${encodeURIComponent(existing.discount_id)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        name: "Scout launch — 30% off standard plans",
        restricted_to: expectedProducts,
        metadata: { campaign: "launch_email_4", offer: "standard_plans_30_percent" },
      }),
    }));
    console.log(`${code} updated: 30% off the five standard Scout plans; all 90-day plans excluded.`);
    process.exit(0);
  }
  console.log(`${code} already exists and is configured correctly (${existing.times_used || 0} uses).`);
  process.exit(0);
}

const created = await json(await fetch(`${base}/discounts`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    code,
    name: "Scout launch — 30% off standard plans",
    type: "percentage",
    amount: 3000,
    subscription_cycles: 1,
    preserve_on_plan_change: false,
    restricted_to: expectedProducts,
    metadata: { campaign: "launch_email_4", offer: "standard_plans_30_percent" },
  }),
}));

console.log(`Created ${created.code || code}: 30% off the five standard Scout plans; all 90-day plans excluded.`);
