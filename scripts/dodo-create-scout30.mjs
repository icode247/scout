#!/usr/bin/env node

const key = process.env.DODO_API_KEY?.trim();
const essential = process.env.DODO_PRODUCT_AI_ESSENTIAL?.trim();
const plus = process.env.DODO_PRODUCT_AI_PLUS?.trim();
if (!key || !essential || !plus) {
  console.error("DODO_API_KEY, DODO_PRODUCT_AI_ESSENTIAL, and DODO_PRODUCT_AI_PLUS are required.");
  process.exit(1);
}

const live = process.env.DODO_ENVIRONMENT === "live_mode";
const base = live ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };
const code = "SCOUT30";
const expectedProducts = [essential, plus].sort();

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
  const valid = existing.type === "percentage"
    && Number(existing.amount) === 3000
    && Number(existing.subscription_cycles) === 1
    && JSON.stringify(actualProducts) === JSON.stringify(expectedProducts);
  if (!valid) {
    console.error(`${code} already exists but does not match 30% × one cycle × monthly AI products. Refusing to silently change a live promotion.`);
    process.exit(1);
  }
  console.log(`${code} already exists and is configured correctly (${existing.times_used || 0} uses).`);
  process.exit(0);
}

const created = await json(await fetch(`${base}/discounts`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    code,
    name: "Scout launch — 30% off first AI month",
    type: "percentage",
    amount: 3000,
    subscription_cycles: 1,
    preserve_on_plan_change: false,
    restricted_to: expectedProducts,
    metadata: { campaign: "launch_email_4", offer: "first_ai_month_30_percent" },
  }),
}));

console.log(`Created ${created.code || code}: 30% off one billing cycle, restricted to monthly AI Essential and AI Plus.`);
