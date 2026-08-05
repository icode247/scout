# Scout: monetization, authorization, and a working jobs board

**Date:** 2026-08-05
**Status:** Approved design, pending implementation plan

## Problem

Scout is live with 10k+ users but is not a complete product. Seven gaps, verified against the
codebase and against the live job board API:

1. **The booking call flow does not work.** `src/pages/book-call.astro:132` POSTs to
   `/api/book-call`. That endpoint does not exist. The form 404s on submit, and no lead is
   ever recorded. `PUBLIC_CALENDLY_URL` is unset, so the embed falls back to a hardcoded URL.
2. **There is no payment system.** No Dodo integration, no subscriptions table, no
   entitlements. `src/pages/pricing.astro` is static marketing copy with prices as duplicated
   string literals; every CTA links to `/book-call` or `/login`.
3. **The header ignores auth.** `src/components/Header.astro:22-23` renders "Sign in" and
   "Book a call" unconditionally, including for signed-in members.
4. **The jobs page is empty in production.** Root cause is upstream: the board API returns
   HTTP 500 for the exact query shape Scout sends. See "Job board constraints" below.
5. **Company logos never render.** `src/pages/api/app/job-search.ts:17` already reads
   `company.logo_url`; the board returns `null` for it on every sampled record.
6. **There is no branded loading state.** Pages that await server data render nothing, then
   snap in. The jobs list uses a generic grey shimmer.
7. **There is no authorization.** `src/middleware.ts:6` gates on authentication only. Any
   signed-in user can apply with Scout, and `/agent` (`src/pages/agent.astro:7`) only checks
   `assistant_type === "ai"` before letting anyone activate the AI agent. Human members are
   assigned a real assistant during onboarding (`src/pages/api/app/onboarding.ts:22,74`) with
   no payment check at all.

## Decisions taken

| Question | Decision |
|---|---|
| Job board strategy | Ingest into Supabase via cron; Scout searches its own indexed table |
| Dodo account | Exists; products not yet created. A setup script creates them |
| Scheduler | Calendly (the page is already written against its embed + postMessage API) |
| Free tier | Browse everything, apply nothing. Applying triggers the pricing modal |
| Human bundle expiry | Quota only, no time limit. Repurchase prompt when exhausted |
| Migration execution | Claude applies the Supabase migration (additive only); user runs Dodo setup |

## Job board constraints (measured, not assumed)

Probed live against `https://fastapply-board-4ea516473ba2.herokuapp.com/api/jobs`:

| Request | Result |
|---|---|
| `?limit=100` | 200, 1.6s |
| `?q=engineer` | **500 — "canceling statement due to statement timeout"** (21s) |
| `?q=java` | 200, 9.2s (total 8003 — narrow terms survive, broad ones do not) |
| `?location=Remote` | **500 — statement timeout** (16s) |
| `?work_mode=remote` | **500 — statement timeout** (16s) |
| `?employment_type=full-time` | **500 — statement timeout** (16s) |
| `?ats=greenhouse` | 200, 6.3s (total 297,105) |
| `?remote=true` | 200, 14.1s (total 353,791) |
| `?title=` / `?search=` / `?posted=` / `?posted_after=` | 200 but **silently ignored** |
| `?sort=` / `?order=` / `?sort_by=` (all variants) | 200 but **silently ignored** |
| `?offset=100000` | 200, 14.3s |
| `?offset=200000` and beyond | **500 — statement timeout** |

Three consequences drive the design:

- **Every production job fetch fails today.** `job-search.ts:17` sends `q` + `location` +
  `work_mode` + `employment_type` on every call. Any one of those is enough to 500.
- **There is no sort parameter.** Result order is arbitrary and stable; "newest first" cannot
  be requested. The default page mixes 2026-08 and 2026-03 postings.
- **Deep pagination is capped around offset 100k**, out of 4.49M total rows.

The only reliable narrowing axes are `ats` (7 supported platforms) and `remote`. Sweeping
offset 0–100k across each axis reaches roughly 700k–800k distinct jobs — a working corpus, not
the full 4.49M.

**This ceiling is honest and must be stated in the product.** The complete fix is for the board
service to index its search columns; that is a different repository and out of scope here.
Scout's job is to stop being broken by it.

## Architecture

### 1. Entitlements — the foundation

Everything else depends on knowing whether a user has paid.

New migration `supabase/migrations/202608050001_billing_and_board.sql` (additive only):

- `subscriptions` — one row per purchase. `user_id`, `plan_code`, `lane` (`human`|`ai`),
  `status`, `dodo_subscription_id`, `dodo_payment_id`, `dodo_customer_id`,
  `current_period_end`, `applications_quota`, `applications_used`.
- `webhook_events` — `dodo_event_id` unique. Webhook idempotency.
- `booking_leads` — the booking call flow.
- `board_jobs` — the ingested job corpus.
- `board_ingest_cursor` — single-row-per-axis sweep position (`axis`, `offset`, `updated_at`).

`src/lib/entitlements.ts` is the single source of truth:

```ts
type Entitlement = {
  paid: boolean
  lane: "human" | "ai" | null
  planCode: string | null
  status: "active" | "past_due" | "canceled" | "expired" | null
  applicationsUsed: number
  applicationsQuota: number
  applicationsRemaining: number
  canApply: boolean
  canActivateAgent: boolean
  hasHumanAssistant: boolean
  reason: "no_plan" | "quota_exhausted" | "past_due" | null
}

loadEntitlement(user, supabase): Promise<Entitlement>
assertCanApply(entitlement): void        // throws a 402 Response
assertCanActivateAgent(entitlement): void
```

`src/middleware.ts` loads it into `Astro.locals.entitlement` for member routes, in the same
`Promise.all` as the existing profile query.

### 2. Enforcement is server-side

A modal that devtools can bypass is not authorization. The gate lives in the API:

| Location | Gate | Failure |
|---|---|---|
| `POST /api/app/ai-jobs` | `assertCanApply` | 402 |
| `PATCH /api/app/jobs` when `status → delegated` | `assertCanApply` | 402 |
| `POST /api/app/ai-agent` when `action = activate` | `assertCanActivateAgent` | 402 |
| `GET /agent` page render | `entitlement.canActivateAgent` | locked state |

402 bodies carry `{ error, code: "payment_required", lane, reason }`. `applications_used`
increments only on a successful application. The pricing modal is the *presentation* of that
402, never the enforcement.

### 3. Dodo Payments

`src/config/plans.ts` holds all five plans as one shared source consumed by `/pricing`, the
pricing modal, and the setup script — replacing today's duplicated literals in `pricing.astro`.

| Code | Lane | Price | Type | Quota |
|---|---|---|---|---|
| `human_focused` | human | $299 | one-time | 250 applications |
| `human_full` | human | $499 | one-time | 500 applications |
| `human_campaign` | human | $999 | one-time | 1,000 applications |
| `ai_essential` | ai | $39/mo | subscription | 75 applications/month |
| `ai_plus` | ai | $79/mo | subscription | 200 applications/month |

Verified against Dodo's API reference:

- Base URLs: `https://test.dodopayments.com` and `https://live.dodopayments.com`
- `POST /checkouts` with `product_cart[{product_id, quantity}]`, `customer`, `return_url`,
  `metadata`. Subscription vs one-time is inferred from the product, not the request.
  Response: `{ session_id, checkout_url }`.
- Webhooks follow the **Standard Webhooks** spec: `webhook-id`, `webhook-timestamp`,
  `webhook-signature` headers; HMAC-SHA256 over `id.timestamp.rawBody`.
- Events consumed: `payment.succeeded`, `payment.failed`, `subscription.active`,
  `subscription.renewed`, `subscription.cancelled`.

Components:

- `src/lib/dodo.ts` — checkout creation, portal session, signature verification
- `POST /api/billing/checkout` — authed, plan code in, `checkout_url` out
- `POST /api/billing/webhook` — verified, idempotent via `webhook_events`, activates the
  subscription **and assigns the human assistant**
- `GET /api/billing/portal` — manage/cancel
- `/checkout/success` — branded loader, polls until the webhook lands, then redirects
- `scripts/dodo-setup.mjs` — creates the five products, prints IDs to paste into env

New env: `DODO_API_KEY`, `DODO_WEBHOOK_SECRET`, `DODO_ENVIRONMENT`, and one
`DODO_PRODUCT_<CODE>` per plan.

**Signature verification must read the raw request body**, before any JSON parsing, or the HMAC
will not match.

### 4. Pricing modal replaces the assistant badge

`src/components/PricingModal.astro`, included once in `App.astro`, driven by
`src/config/plans.ts`. It is lane-aware and contextual: opened from a job it names what is being
unlocked ("Scout is ready to apply to Senior PM at Acme"), rather than showing a generic wall.

Three sites swap the assistant badge for a **Get Assistant** button when unpaid:

- `src/layouts/App.astro:41` — sidebar assistant card
- `src/pages/jobs.astro:55-63` — the handoff panel
- `src/pages/dashboard.astro` — the header CTA

A shared `window.scoutRequirePlan(payload)` helper in `App.astro` opens the modal from any 402.

### 5. Jobs: ingest, then search locally

`board_jobs` carries a GIN index on `to_tsvector('english', title || ' ' || company)` plus btree
indexes on `posted_at`, `ats`, `is_remote`, and `location`, with `external_id` unique.

`GET /api/cron/ingest-jobs` (CRON_SECRET-guarded, added to `vercel.json` crons on a `*/10 * * * *`
schedule) runs a **multi-axis shallow sweep**:

- **Axes:** the seven supported ATS values (`greenhouse`, `lever`, `ashby`, `workable`,
  `recruitee`, `workday`, `smartrecruiters`) plus `remote=true`, rotating one axis per tick.
- **Page size** 100, **10 pages per tick**, giving ~1,000 upserts per run within Vercel's
  function timeout at the observed 1.6–14s per request.
- **Offset ceiling 100,000** — measured working; 200,000 times out. On reaching it the cursor
  wraps to 0 for that axis, refreshing the corpus.
- **Retention:** rows whose `posted_at` is older than 60 days and that were not seen in the
  most recent sweep of their axis are pruned.

Each tick upserts on `external_id` and advances `board_ingest_cursor` only after a successful
page.

`GET /api/app/job-search` is rewritten to query `board_jobs` through Supabase full-text search
with the user's roles, locations, and filters applied in SQL. Fast, indexed, and unaffected by
board outages. If the local table is empty it degrades to a single narrow live call rather than
showing a blank page.

**Logos** are derived at ingest from `company.domain`, which the board *does* populate, and
stored as `logo_url`. The existing initials fallback and `onerror` handler at `jobs.astro:82`
already cover misses. `vercel.json`'s CSP already allows `img-src https:`.

### 6. Branded Scout loader

`src/components/ScoutLoader.astro` — the Scout mark with an animated draw and a label. Three
variants: `page` (full-screen overlay), `inline`, `skeleton`. Honors
`prefers-reduced-motion`. Applied to checkout polling, the jobs list, agent activation, and the
onboarding extraction step.

Inline scripts must not reference `import.meta` — that is what broke the PostHog snippet
previously. Use `define:vars`.

### 7. Reconcile

- `onboarding.ts` stops assigning a human assistant. It records lane *intent*; the webhook
  assigns on payment.
- `/settings` gains a Billing section: current plan, quota consumed, manage/cancel link.
- `/admin` shows plan and payment status per member.
- `Header.astro` reads auth state. Because `middleware.ts:46` returns early for marketing
  pages, session state for *display* is resolved from decoded cookie claims rather than a
  `getUser()` round-trip on every marketing pageview. This is a nav-rendering decision, not an
  authorization one; verified `getUser()` remains on every protected route.
- `vercel.json` CSP gains `frame-src https://calendly.com` — currently absent, so the embed
  would fall through to `default-src 'self'` and be blocked once CSP is enforced.
- `.env.example` and a setup checklist are updated.

## Error handling

- Board unreachable during ingest → log, leave the cursor unadvanced, retry next tick. Users
  keep seeing the existing corpus.
- Dodo webhook arrives twice → `webhook_events.dodo_event_id` unique constraint makes the
  second a no-op.
- Webhook is delayed past checkout redirect → `/checkout/success` polls with the branded
  loader instead of showing an unpaid dashboard.
- Payment succeeds but assistant assignment fails → webhook returns non-2xx so Dodo retries;
  assignment is idempotent.
- Quota exhausted mid-session → 402 with `reason: "quota_exhausted"`, and the modal shows a
  repurchase offer rather than the first-time pricing table.

## Testing

- `entitlements.ts` — unit tests over the plan/status/quota matrix, including expired
  subscriptions and exhausted bundles.
- Webhook handler — signature verification (valid, tampered, replayed), idempotency.
- 402 enforcement — one test per gated endpoint asserting an unpaid user is refused.
- Ingest — cursor advance, wraparound, upsert dedupe, and graceful handling of a 500 from the
  board.
- Search — role and location matching against a seeded `board_jobs` table.

## Out of scope

- Fixing the board service's database indexes (different repository).
- Refunds, proration, and plan upgrades/downgrades mid-cycle — Dodo's customer portal handles
  cancellation; changing plans means a new checkout.
- Email notification on booking lead capture. Leads land in `booking_leads` and PostHog.

## Phasing

1. Billing foundation — schema, entitlements, Dodo, modal, server enforcement
2. Jobs — ingestion cron, local search, logos
3. Booking endpoint, auth-aware header, branded loader
4. Reconcile pass and verification
