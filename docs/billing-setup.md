# Billing setup (Dodo Payments)

Scout's paywall is already built and enforced. This is the one-time wiring
needed before members can actually pay.

## 1. Pick the brand

A Dodo account can hold several brands, and every product belongs to one. The
brand decides the logo on the checkout page, the support email shown there, and
the descriptor on the buyer's card statement — so a product filed under the
wrong brand bills people under someone else's name.

Put the brand in `.env` before running the setup script:

```
DODO_BRAND_NAME="Scout AI"
```

Quote it — the value has a space in it, and while Node's env-file parser copes
either way, any shell that `source`s `.env` would read `AI` as a command.

The name is matched case-insensitively; `DODO_BRAND_ID=brnd_...` overrides it.
If neither resolves, the script stops and prints the account's brands rather
than quietly filing the products under the account default.

## 2. Create the products

Prices, quotas and product names all live in `src/config/plans.ts`. The script
reads that file, so never type a price in twice.

```bash
npm run dodo:setup
```

Run it through npm — that is what loads `.env`; a bare `node` invocation sees no
environment file and will report a missing `DODO_API_KEY`.

It prints ten env lines, one per plan and term. It is safe to re-run: products
already on the brand are reused by name rather than duplicated, and a product an
existing env var points at is moved onto the brand if it is on another one.

```
DODO_PRODUCT_HUMAN_FOCUSED=pdt_...        DODO_PRODUCT_HUMAN_FOCUSED_90=pdt_...
DODO_PRODUCT_HUMAN_FULL=pdt_...           DODO_PRODUCT_HUMAN_FULL_90=pdt_...
DODO_PRODUCT_HUMAN_CAMPAIGN=pdt_...       DODO_PRODUCT_HUMAN_CAMPAIGN_90=pdt_...
DODO_PRODUCT_AI_ESSENTIAL=pdt_...         DODO_PRODUCT_AI_ESSENTIAL_90=pdt_...
DODO_PRODUCT_AI_PLUS=pdt_...              DODO_PRODUCT_AI_PLUS_90=pdt_...
```

## 3. Set the environment variables

In Vercel → Settings → Environment Variables, add the ten product ids plus:

| Variable | Value |
|---|---|
| `DODO_API_KEY` | Your Dodo API key |
| `DODO_WEBHOOK_SECRET` | The signing secret from step 4 |
| `DODO_ENVIRONMENT` | `test_mode` until you have run a real test purchase |

`DODO_BRAND_NAME` / `DODO_BRAND_ID` are only read by the setup script, so they
do not need to be set in Vercel.

`DODO_ENVIRONMENT=live_mode` charges real cards. Leave it on `test_mode` until
step 5 passes.

## 4. Register the webhook

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

## 5. Run one end-to-end test purchase

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

## 6. Flip to live

Set `DODO_ENVIRONMENT=live_mode`, re-run `npm run dodo:setup` against the live
key to create live products, and replace the ten product ids.

Brands are per-environment: create the Scout brand in live mode too, or the
script will stop and list the live account's brands.

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
