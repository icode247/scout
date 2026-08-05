# Billing setup (Dodo Payments)

Scout's paywall is already built and enforced. This is the one-time wiring
needed before members can actually pay.

## 1. Create the products

Prices, quotas and product names all live in `src/config/plans.ts`. The script
reads that file, so never type a price in twice.

```bash
DODO_API_KEY=<your test key> npm run dodo:setup
```

It prints five env lines. It is safe to re-run — existing products are reused by
name rather than duplicated.

```
DODO_PRODUCT_HUMAN_FOCUSED=pdt_...
DODO_PRODUCT_HUMAN_FULL=pdt_...
DODO_PRODUCT_HUMAN_CAMPAIGN=pdt_...
DODO_PRODUCT_AI_ESSENTIAL=pdt_...
DODO_PRODUCT_AI_PLUS=pdt_...
```

## 2. Set the environment variables

In Vercel → Settings → Environment Variables, add the five product ids plus:

| Variable | Value |
|---|---|
| `DODO_API_KEY` | Your Dodo API key |
| `DODO_WEBHOOK_SECRET` | The signing secret from step 3 |
| `DODO_ENVIRONMENT` | `test_mode` until you have run a real test purchase |

`DODO_ENVIRONMENT=live_mode` charges real cards. Leave it on `test_mode` until
step 4 passes.

## 3. Register the webhook

In the Dodo dashboard, add a webhook endpoint pointing at:

```
https://<your-domain>/api/billing/webhook
```

Subscribe it to: `payment.succeeded`, `payment.failed`, `subscription.active`,
`subscription.renewed`, `subscription.cancelled`.

Copy the signing secret into `DODO_WEBHOOK_SECRET`.

**The webhook matters more than the checkout.** It is the only place a
subscription is activated and the only place a Human Assistant is assigned. If
it is not reachable, members will pay and get nothing — `/checkout/success`
will sit on its loader and then tell them activation is still in progress.

## 4. Run one end-to-end test purchase

1. Sign in on the deployed site and open `/pricing`.
2. Choose an AI plan (cheapest, and exercises the subscription path).
3. Complete checkout with a Dodo test card.
4. You should land on `/checkout/success`, see the branded loader, and be
   redirected to the dashboard within a few seconds.
5. Verify in Supabase:

```sql
select plan_code, lane, status, applications_quota, applications_used
from subscriptions where user_id = '<your uuid>';
```

6. Repeat with a Human plan and confirm `profiles.assistant_name` is populated —
   that assignment only happens on payment.

## 5. Flip to live

Set `DODO_ENVIRONMENT=live_mode`, re-run `npm run dodo:setup` against the live
key to create live products, and replace the five product ids.

## How the paywall behaves

Free members can sign up, onboard, build job profiles, search, and save jobs.
Applying is what costs money, so it is refused server-side with HTTP 402:

| Endpoint | Refused when |
|---|---|
| `POST /api/app/ai-jobs` | no active plan, or quota exhausted |
| `PATCH /api/app/jobs` with `status: "delegated"` | same |
| `POST /api/app/jobs` creating a delegated job | same |
| `POST /api/app/ai-agent` with `action: "activate"` | no active AI plan |

The pricing modal is only the presentation of that 402. Removing it in devtools
changes nothing.

Human bundles are one-time purchases with an application allowance and no expiry
date. When the allowance runs out the member sees a top-up prompt rather than a
first-time pricing table.
