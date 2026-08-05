# Scout Monetization, Authorization, and Job Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Scout from a marketing site with an unguarded dashboard into a paid product: real Dodo checkout, server-enforced entitlements, a jobs page that actually returns jobs, a working booking flow, and an auth-aware shell.

**Architecture:** A single `entitlements` module is the source of truth for what a user may do; four API endpoints enforce it with HTTP 402 and the pricing modal is merely how that 402 is presented. The jobs page stops calling the failing upstream board API per-request and instead searches a locally-ingested, indexed `board_jobs` table populated by a cron sweep.

**Tech Stack:** Astro 5 (SSR, `output: "server"`, Vercel adapter), Supabase (Postgres + RLS + SSR auth), Dodo Payments, Tailwind 3, Vitest (added by Task 1).

## Global Constraints

- **Astro inline scripts must never reference `import.meta`.** It breaks silently at runtime — this is what broke the PostHog snippet previously. Pass server values with `define:vars`.
- **Migrations are additive only.** This is a production database with 10k+ users. No `DROP`, no destructive `ALTER`, no column removal.
- **All new tables get RLS enabled** and follow the existing `"Users manage own <table>"` policy pattern from `supabase/migrations/202607150001_initial_scout.sql`.
- **Server-side enforcement is mandatory.** A UI check is never the gate. Every paid action is refused in the API.
- **Dodo webhook signature verification must read the raw request body** before any JSON parsing, or the HMAC will not match.
- **Board API parameters that must never be sent:** `q`, `location`, `work_mode`, `employment_type`. Each independently returns HTTP 500 (Postgres statement timeout). Only `limit`, `offset`, `ats`, `remote`, and `include` are safe.
- **Board offset ceiling is 100,000.** 200,000 times out.
- **Prices and quotas live only in `src/config/plans.ts`.** No duplicated literals.
- Code style: this codebase writes dense single-line Astro frontmatter and compact modules. Match it; do not reformat neighbouring code.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/config/plans.ts` | The five plans: code, lane, price, quota, Dodo product env key |
| `src/lib/entitlements.ts` | Load + evaluate what a user may do; 402 assertions |
| `src/lib/dodo.ts` | Dodo API client + Standard Webhooks signature verification |
| `src/lib/board-ingest.ts` | Board page fetching, job normalization, logo derivation |
| `src/pages/api/billing/checkout.ts` | Create a Dodo checkout session |
| `src/pages/api/billing/webhook.ts` | Consume Dodo events, activate subscriptions |
| `src/pages/api/billing/portal.ts` | Customer portal redirect |
| `src/pages/api/billing/status.ts` | Poll target for `/checkout/success` |
| `src/pages/api/book-call.ts` | The missing booking endpoint (POST + PATCH) |
| `src/pages/api/cron/ingest-jobs.ts` | Multi-axis board sweep |
| `src/pages/checkout/success.astro` | Post-payment branded loader + poll |
| `src/components/PricingModal.astro` | Lane-aware contextual paywall |
| `src/components/ScoutLoader.astro` | Branded loader: page / inline / skeleton |
| `scripts/dodo-setup.mjs` | Create the five Dodo products, print IDs |
| `supabase/migrations/202608050001_billing_and_board.sql` | All new tables |
| `src/lib/*.test.ts` | Vitest units for entitlements, dodo, plans, board-ingest |

**Modified:** `src/middleware.ts`, `src/components/Header.astro`, `src/layouts/App.astro`, `src/pages/jobs.astro`, `src/pages/agent.astro`, `src/pages/dashboard.astro`, `src/pages/pricing.astro`, `src/pages/settings.astro`, `src/pages/admin.astro`, `src/pages/api/app/ai-jobs.ts`, `src/pages/api/app/jobs.ts`, `src/pages/api/app/ai-agent.ts`, `src/pages/api/app/job-search.ts`, `src/pages/api/app/onboarding.ts`, `src/env.d.ts`, `vercel.json`, `.env.example`, `package.json`.

---

# Phase 1 — Billing foundation

### Task 1: Test runner and plan catalog

**Files:**
- Modify: `package.json`
- Create: `src/config/plans.ts`, `src/config/plans.test.ts`, `vitest.config.ts`

**Interfaces:**
- Produces: `PLANS: Plan[]`, `planByCode(code: string): Plan | null`, `plansForLane(lane: Lane): Plan[]`, types `Plan`, `Lane = "human" | "ai"`.

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest@^2.1.0
```

- [ ] **Step 2: Add the test script and vitest config**

In `package.json` `scripts`, add: `"test": "vitest run"`, `"test:watch": "vitest"`.

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 3: Write the failing test**

Create `src/config/plans.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PLANS, planByCode, plansForLane } from "./plans";

describe("plan catalog", () => {
  it("has five plans with unique codes", () => {
    expect(PLANS).toHaveLength(5);
    expect(new Set(PLANS.map((p) => p.code)).size).toBe(5);
  });

  it("prices human bundles as one-time and AI plans as recurring", () => {
    expect(plansForLane("human").every((p) => p.billing === "one_time")).toBe(true);
    expect(plansForLane("ai").every((p) => p.billing === "recurring")).toBe(true);
  });

  it("matches the published pricing", () => {
    expect(planByCode("human_full")?.priceCents).toBe(49900);
    expect(planByCode("human_full")?.applicationsQuota).toBe(500);
    expect(planByCode("ai_essential")?.priceCents).toBe(3900);
    expect(planByCode("ai_essential")?.applicationsQuota).toBe(75);
  });

  it("returns null for an unknown code", () => {
    expect(planByCode("nope")).toBeNull();
  });
});
```

- [ ] **Step 4: Run it and confirm it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./plans`.

- [ ] **Step 5: Implement the catalog**

Create `src/config/plans.ts`:

```ts
export type Lane = "human" | "ai";
export type Billing = "one_time" | "recurring";

export interface Plan {
  code: string;
  lane: Lane;
  name: string;
  billing: Billing;
  priceCents: number;
  priceLabel: string;
  cadenceLabel: string;
  applicationsQuota: number;
  profileLimit: number;
  blurb: string;
  features: string[];
  featured?: boolean;
  /** Env var holding the Dodo product id, e.g. DODO_PRODUCT_HUMAN_FULL. */
  productEnvKey: string;
}

export const PLANS: Plan[] = [
  {
    code: "human_focused", lane: "human", name: "Focused Search", billing: "one_time",
    priceCents: 29900, priceLabel: "$299", cadenceLabel: "one time",
    applicationsQuota: 250, profileLimit: 1,
    blurb: "A dedicated person runs one clearly defined job search.",
    features: ["1 Human Assistant", "1 active job profile", "Dedicated WhatsApp group", "Dashboard tracking", "Resume used for every job", "Screenshots of important form answers"],
    productEnvKey: "DODO_PRODUCT_HUMAN_FOCUSED",
  },
  {
    code: "human_full", lane: "human", name: "Full Search", billing: "one_time",
    priceCents: 49900, priceLabel: "$499", cadenceLabel: "one time",
    applicationsQuota: 500, profileLimit: 2, featured: true,
    blurb: "The complete Human Assistant service for an active search.",
    features: ["1 dedicated Human Assistant", "Up to 2 active job profiles", "Dedicated WhatsApp group", "Tailored resume for each job", "Detailed answer screenshots", "Jobs added from dashboard or Chrome"],
    productEnvKey: "DODO_PRODUCT_HUMAN_FULL",
  },
  {
    code: "human_campaign", lane: "human", name: "Career Campaign", billing: "one_time",
    priceCents: 99900, priceLabel: "$999", cadenceLabel: "one time",
    applicationsQuota: 1000, profileLimit: 4,
    blurb: "More capacity and coordination for a broad or multi-role search.",
    features: ["2 Human Assistants", "Up to 4 active job profiles", "Priority WhatsApp support", "Tailored resumes and cover notes", "Detailed answer screenshots", "Weekly campaign review"],
    productEnvKey: "DODO_PRODUCT_HUMAN_CAMPAIGN",
  },
  {
    code: "ai_essential", lane: "ai", name: "AI Essential", billing: "recurring",
    priceCents: 3900, priceLabel: "$39", cadenceLabel: "/ month",
    applicationsQuota: 75, profileLimit: 1,
    blurb: "A lower-cost assistant for one focused search.",
    features: ["1 active job profile", "Tailored resume per job", "Job and status tracking", "Resume-used record", "Add jobs from Chrome", "No form-answer screenshots"],
    productEnvKey: "DODO_PRODUCT_AI_ESSENTIAL",
  },
  {
    code: "ai_plus", lane: "ai", name: "AI Plus", billing: "recurring",
    priceCents: 7900, priceLabel: "$79", cadenceLabel: "/ month",
    applicationsQuota: 200, profileLimit: 3, featured: true,
    blurb: "More profiles and volume for an active multi-role search.",
    features: ["Up to 3 active job profiles", "Tailored resumes and cover notes", "Priority AI queue", "Job and status tracking", "Resume-used record", "No form-answer screenshots"],
    productEnvKey: "DODO_PRODUCT_AI_PLUS",
  },
];

export function planByCode(code: string): Plan | null {
  return PLANS.find((plan) => plan.code === code) ?? null;
}

export function plansForLane(lane: Lane): Plan[] {
  return PLANS.filter((plan) => plan.lane === lane);
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/config/plans.ts src/config/plans.test.ts
git commit -m "feat(billing): add plan catalog and vitest runner"
```

---

### Task 2: Database migration

**Files:**
- Create: `supabase/migrations/202608050001_billing_and_board.sql`

**Interfaces:**
- Produces tables `subscriptions`, `webhook_events`, `booking_leads`, `board_jobs`, `board_ingest_cursor`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/202608050001_billing_and_board.sql`:

```sql
-- Billing, booking leads, and the locally-ingested job corpus. Additive only.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null,
  lane text not null check (lane in ('human','ai')),
  status text not null default 'active' check (status in ('active','past_due','canceled','expired')),
  dodo_customer_id text,
  dodo_subscription_id text,
  dodo_payment_id text,
  current_period_end timestamptz,
  applications_quota integer not null default 0,
  applications_used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);
create index if not exists subscriptions_active_idx on public.subscriptions(user_id, status);
create unique index if not exists subscriptions_dodo_subscription_idx
  on public.subscriptions(dodo_subscription_id) where dodo_subscription_id is not null;
create unique index if not exists subscriptions_dodo_payment_idx
  on public.subscriptions(dodo_payment_id) where dodo_payment_id is not null;

-- Webhook idempotency. Written by the service role only.
create table if not exists public.webhook_events (
  dodo_event_id text primary key,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);

create table if not exists public.booking_leads (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  primary_role text,
  target_location text,
  challenge text,
  source_path text,
  status text not null default 'new' check (status in ('new','scheduled','completed','no_show')),
  calendly_event_uri text,
  calendly_invitee_uri text,
  scheduled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists booking_leads_created_idx on public.booking_leads(created_at desc);
create index if not exists booking_leads_email_idx on public.booking_leads(lower(email));

-- Corpus ingested from the upstream board, because that API cannot serve
-- filtered queries without timing out. See the design spec.
create table if not exists public.board_jobs (
  id bigserial primary key,
  external_id text not null unique,
  board_id bigint,
  title text not null,
  company text not null,
  company_domain text,
  logo_url text,
  location text not null default '',
  workplace_type text,
  employment_type text,
  experience_level text,
  is_remote boolean not null default false,
  remote_worldwide boolean not null default false,
  visa_sponsorship boolean,
  salary jsonb,
  ats text,
  external_url text not null,
  description text not null default '',
  posted_at timestamptz,
  ingested_at timestamptz not null default now()
);
create index if not exists board_jobs_search_idx on public.board_jobs
  using gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(company,'')));
create index if not exists board_jobs_posted_idx on public.board_jobs(posted_at desc nulls last);
create index if not exists board_jobs_ats_idx on public.board_jobs(ats);
create index if not exists board_jobs_remote_idx on public.board_jobs(is_remote);
create index if not exists board_jobs_location_idx on public.board_jobs
  using gin (to_tsvector('simple', coalesce(location,'')));

create table if not exists public.board_ingest_cursor (
  axis text primary key,
  next_offset integer not null default 0,
  last_run_at timestamptz,
  last_error text,
  rows_ingested bigint not null default 0
);

alter table public.subscriptions enable row level security;
alter table public.webhook_events enable row level security;
alter table public.booking_leads enable row level security;
alter table public.board_jobs enable row level security;
alter table public.board_ingest_cursor enable row level security;

grant select on public.subscriptions to authenticated;
grant select on public.board_jobs to authenticated;

drop policy if exists "Users read own subscriptions" on public.subscriptions;
create policy "Users read own subscriptions" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

-- The corpus is public reference data for any signed-in member.
drop policy if exists "Members read board jobs" on public.board_jobs;
create policy "Members read board jobs" on public.board_jobs
  for select to authenticated using (true);

-- webhook_events, booking_leads, board_ingest_cursor carry no policy for
-- `authenticated`: they are written and read only by the service role, which
-- bypasses RLS. Enabling RLS with no policy denies all client access.
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: the migration applies with no error. If the CLI is not linked, run `npx supabase link` first.

- [ ] **Step 3: Verify the tables exist**

Run:
```bash
npx supabase db push --dry-run
```
Expected: reports no pending changes.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/202608050001_billing_and_board.sql
git commit -m "feat(db): add billing, booking lead, and board corpus tables"
```

---

### Task 3: Entitlements module

**Files:**
- Create: `src/lib/entitlements.ts`, `src/lib/entitlements.test.ts`

**Interfaces:**
- Consumes: `planByCode`, `Lane` from `src/config/plans.ts` (Task 1).
- Produces:
  - `type Entitlement` with fields `paid, lane, planCode, status, applicationsUsed, applicationsQuota, applicationsRemaining, canApply, canActivateAgent, hasHumanAssistant, reason`
  - `evaluateEntitlement(row: SubscriptionRow | null): Entitlement`
  - `loadEntitlement(userId: string, supabase: SupabaseClient | undefined, demoMode: boolean): Promise<Entitlement>`
  - `EMPTY_ENTITLEMENT: Entitlement`
  - `paymentRequired(entitlement: Entitlement, lane?: Lane): Response` — 402
  - `assertCanApply(entitlement: Entitlement): void`
  - `assertCanActivateAgent(entitlement: Entitlement): void`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/entitlements.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EMPTY_ENTITLEMENT, evaluateEntitlement } from "./entitlements";

const base = {
  plan_code: "ai_essential", lane: "ai" as const, status: "active" as const,
  applications_quota: 75, applications_used: 0, current_period_end: null,
};

describe("evaluateEntitlement", () => {
  it("treats a missing subscription as unpaid", () => {
    const e = evaluateEntitlement(null);
    expect(e).toEqual(EMPTY_ENTITLEMENT);
    expect(e.paid).toBe(false);
    expect(e.canApply).toBe(false);
    expect(e.reason).toBe("no_plan");
  });

  it("allows applying on an active plan with quota left", () => {
    const e = evaluateEntitlement(base);
    expect(e.paid).toBe(true);
    expect(e.canApply).toBe(true);
    expect(e.canActivateAgent).toBe(true);
    expect(e.applicationsRemaining).toBe(75);
    expect(e.reason).toBeNull();
  });

  it("refuses applying when the quota is exhausted", () => {
    const e = evaluateEntitlement({ ...base, applications_used: 75 });
    expect(e.paid).toBe(true);
    expect(e.canApply).toBe(false);
    expect(e.applicationsRemaining).toBe(0);
    expect(e.reason).toBe("quota_exhausted");
  });

  it("never reports negative remaining applications", () => {
    const e = evaluateEntitlement({ ...base, applications_used: 900 });
    expect(e.applicationsRemaining).toBe(0);
  });

  it("refuses a past_due subscription", () => {
    const e = evaluateEntitlement({ ...base, status: "past_due" });
    expect(e.canApply).toBe(false);
    expect(e.reason).toBe("past_due");
  });

  it("refuses a canceled subscription", () => {
    const e = evaluateEntitlement({ ...base, status: "canceled" });
    expect(e.paid).toBe(false);
    expect(e.canApply).toBe(false);
  });

  it("expires a recurring plan whose period has ended", () => {
    const e = evaluateEntitlement({ ...base, current_period_end: "2020-01-01T00:00:00Z" });
    expect(e.paid).toBe(false);
    expect(e.canApply).toBe(false);
  });

  it("keeps a one-time human bundle valid with no period end", () => {
    const e = evaluateEntitlement({
      ...base, plan_code: "human_full", lane: "human",
      applications_quota: 500, applications_used: 12, current_period_end: null,
    });
    expect(e.paid).toBe(true);
    expect(e.canApply).toBe(true);
    expect(e.hasHumanAssistant).toBe(true);
    expect(e.applicationsRemaining).toBe(488);
  });

  it("does not grant a human assistant on an AI plan", () => {
    expect(evaluateEntitlement(base).hasHumanAssistant).toBe(false);
  });

  it("only grants agent activation on the AI lane", () => {
    const human = evaluateEntitlement({ ...base, plan_code: "human_full", lane: "human" });
    expect(human.canActivateAgent).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- entitlements`
Expected: FAIL — cannot resolve `./entitlements`.

- [ ] **Step 3: Implement the module**

Create `src/lib/entitlements.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lane } from "../config/plans";

export type EntitlementStatus = "active" | "past_due" | "canceled" | "expired";
export type EntitlementReason = "no_plan" | "quota_exhausted" | "past_due" | null;

export interface SubscriptionRow {
  plan_code: string;
  lane: Lane;
  status: EntitlementStatus;
  applications_quota: number;
  applications_used: number;
  current_period_end: string | null;
}

export interface Entitlement {
  paid: boolean;
  lane: Lane | null;
  planCode: string | null;
  status: EntitlementStatus | null;
  applicationsUsed: number;
  applicationsQuota: number;
  applicationsRemaining: number;
  canApply: boolean;
  canActivateAgent: boolean;
  hasHumanAssistant: boolean;
  reason: EntitlementReason;
}

export const EMPTY_ENTITLEMENT: Entitlement = {
  paid: false, lane: null, planCode: null, status: null,
  applicationsUsed: 0, applicationsQuota: 0, applicationsRemaining: 0,
  canApply: false, canActivateAgent: false, hasHumanAssistant: false,
  reason: "no_plan",
};

export function evaluateEntitlement(row: SubscriptionRow | null | undefined): Entitlement {
  if (!row) return EMPTY_ENTITLEMENT;

  const periodEnded = row.current_period_end
    ? new Date(row.current_period_end).getTime() < Date.now()
    : false;
  const active = row.status === "active" && !periodEnded;
  const used = Math.max(0, Number(row.applications_used) || 0);
  const quota = Math.max(0, Number(row.applications_quota) || 0);
  const remaining = Math.max(0, quota - used);

  if (!active) {
    return {
      ...EMPTY_ENTITLEMENT,
      lane: row.lane, planCode: row.plan_code,
      status: periodEnded ? "expired" : row.status,
      applicationsUsed: used, applicationsQuota: quota, applicationsRemaining: remaining,
      reason: row.status === "past_due" ? "past_due" : "no_plan",
    };
  }

  const canApply = remaining > 0;
  return {
    paid: true,
    lane: row.lane,
    planCode: row.plan_code,
    status: "active",
    applicationsUsed: used,
    applicationsQuota: quota,
    applicationsRemaining: remaining,
    canApply,
    canActivateAgent: canApply && row.lane === "ai",
    hasHumanAssistant: row.lane === "human",
    reason: canApply ? null : "quota_exhausted",
  };
}

export async function loadEntitlement(
  userId: string,
  supabase: SupabaseClient | undefined,
  demoMode = false,
): Promise<Entitlement> {
  // Demo mode has no billing backend; grant a full AI plan so the demo is usable.
  if (demoMode || !supabase) {
    return evaluateEntitlement({
      plan_code: "ai_plus", lane: "ai", status: "active",
      applications_quota: 200, applications_used: 0, current_period_end: null,
    });
  }
  const { data } = await supabase
    .from("subscriptions")
    .select("plan_code,lane,status,applications_quota,applications_used,current_period_end")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return evaluateEntitlement(data as SubscriptionRow | null);
}

export function paymentRequired(entitlement: Entitlement, lane?: Lane) {
  return new Response(JSON.stringify({
    error: entitlement.reason === "quota_exhausted"
      ? "You have used every application in your plan."
      : entitlement.reason === "past_due"
        ? "Your payment did not go through. Update your billing details to continue."
        : "Choose a plan to let Scout apply for you.",
    code: "payment_required",
    reason: entitlement.reason,
    lane: lane ?? entitlement.lane ?? null,
  }), { status: 402, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export function assertCanApply(entitlement: Entitlement) {
  if (!entitlement.canApply) throw paymentRequired(entitlement);
}

export function assertCanActivateAgent(entitlement: Entitlement) {
  if (!entitlement.canActivateAgent) throw paymentRequired(entitlement, "ai");
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- entitlements`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/entitlements.ts src/lib/entitlements.test.ts
git commit -m "feat(billing): add entitlement evaluation and 402 assertions"
```

---

### Task 4: Wire entitlements into middleware and locals

**Files:**
- Modify: `src/middleware.ts:70-99`, `src/env.d.ts`

**Interfaces:**
- Consumes: `loadEntitlement` (Task 3).
- Produces: `Astro.locals.entitlement: Entitlement` on every member route and `/api/app` request.

- [ ] **Step 1: Declare the local**

In `src/env.d.ts`, inside the `App.Locals` interface, add:

```ts
entitlement: import("./lib/entitlements").Entitlement;
```

Also add the new server env vars to the `ImportMetaEnv` interface:

```ts
readonly DODO_API_KEY?: string;
readonly DODO_WEBHOOK_SECRET?: string;
readonly DODO_ENVIRONMENT?: string;
readonly DODO_PRODUCT_HUMAN_FOCUSED?: string;
readonly DODO_PRODUCT_HUMAN_FULL?: string;
readonly DODO_PRODUCT_HUMAN_CAMPAIGN?: string;
readonly DODO_PRODUCT_AI_ESSENTIAL?: string;
readonly DODO_PRODUCT_AI_PLUS?: string;
readonly PUBLIC_CALENDLY_URL?: string;
```

- [ ] **Step 2: Load it in middleware**

In `src/middleware.ts`, add the import:

```ts
import { EMPTY_ENTITLEMENT, loadEntitlement } from "./lib/entitlements";
```

Replace the profile-loading block at lines 72-77 with:

```ts
    let profile: any = null;
    context.locals.entitlement = EMPTY_ENTITLEMENT;
    if (user) {
      const [profileResult, entitlement] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        loadEntitlement(user.id, supabase, false),
      ]);
      profile = profileResult.data;
      context.locals.scoutProfile = profile;
      context.locals.entitlement = entitlement;
    }
```

In the extension-token branch (lines 60-64), after `context.locals.scoutProfile = profile;` add:

```ts
      context.locals.entitlement = await loadEntitlement(user.id, supabase, false);
```

In the demo-mode branch (after line 116), add:

```ts
    context.locals.entitlement = await loadEntitlement(demoUserId, undefined, true);
```

- [ ] **Step 3: Typecheck**

Run: `npx astro check`
Expected: no new errors referencing `entitlement`.

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts src/env.d.ts
git commit -m "feat(billing): resolve entitlements in middleware"
```

---

### Task 5: Dodo client and webhook signature verification

**Files:**
- Create: `src/lib/dodo.ts`, `src/lib/dodo.test.ts`

**Interfaces:**
- Consumes: `Plan`, `planByCode` (Task 1).
- Produces:
  - `dodoConfigured(): boolean`
  - `dodoBaseUrl(): string`
  - `productIdForPlan(plan: Plan): string`
  - `createCheckoutSession(input: {plan, userId, email, name?, returnUrl, metadata}): Promise<{sessionId: string; checkoutUrl: string}>`
  - `createPortalSession(customerId: string): Promise<{link: string}>`
  - `verifyWebhookSignature(input: {id, timestamp, signature, rawBody, secret}): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/lib/dodo.test.ts`. The signature scheme is Standard Webhooks: base64 HMAC-SHA256 over `id.timestamp.rawBody`, with the header carrying space-separated `v1,<sig>` entries.

```ts
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "./dodo";

const secret = "whsec_dGVzdHNlY3JldA==";
const id = "evt_123";
const timestamp = String(Math.floor(Date.now() / 1000));
const rawBody = JSON.stringify({ type: "payment.succeeded" });

function sign(body: string, ts = timestamp, key = secret) {
  const bytes = Buffer.from(key.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", bytes).update(`${id}.${ts}.${body}`).digest("base64");
}

describe("verifyWebhookSignature", () => {
  it("accepts a correctly signed payload", () => {
    const signature = `v1,${sign(rawBody)}`;
    expect(verifyWebhookSignature({ id, timestamp, signature, rawBody, secret })).toBe(true);
  });

  it("accepts when several versioned signatures are present", () => {
    const signature = `v1,bogus v1,${sign(rawBody)}`;
    expect(verifyWebhookSignature({ id, timestamp, signature, rawBody, secret })).toBe(true);
  });

  it("rejects a tampered body", () => {
    const signature = `v1,${sign(rawBody)}`;
    const tampered = JSON.stringify({ type: "payment.failed" });
    expect(verifyWebhookSignature({ id, timestamp, signature, rawBody: tampered, secret })).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const signature = `v1,${sign(rawBody, timestamp, "whsec_b3RoZXI=")}`;
    expect(verifyWebhookSignature({ id, timestamp, signature, rawBody, secret })).toBe(false);
  });

  it("rejects a stale timestamp outside the tolerance window", () => {
    const old = String(Math.floor(Date.now() / 1000) - 60 * 60);
    const signature = `v1,${sign(rawBody, old)}`;
    expect(verifyWebhookSignature({ id, timestamp: old, signature, rawBody, secret })).toBe(false);
  });

  it("rejects an empty signature header", () => {
    expect(verifyWebhookSignature({ id, timestamp, signature: "", rawBody, secret })).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- dodo`
Expected: FAIL — cannot resolve `./dodo`.

- [ ] **Step 3: Implement the client**

Create `src/lib/dodo.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Plan } from "../config/plans";

const TOLERANCE_SECONDS = 5 * 60;

export class DodoError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.name = "DodoError"; this.status = status; }
}

function apiKey() {
  const key = import.meta.env.DODO_API_KEY?.trim();
  if (!key) throw new DodoError("Payments are not configured yet.", 503);
  return key;
}

export function dodoConfigured() {
  return Boolean(import.meta.env.DODO_API_KEY?.trim());
}

export function dodoBaseUrl() {
  return import.meta.env.DODO_ENVIRONMENT?.trim() === "live_mode"
    ? "https://live.dodopayments.com"
    : "https://test.dodopayments.com";
}

export function productIdForPlan(plan: Plan) {
  const id = (import.meta.env as Record<string, string | undefined>)[plan.productEnvKey]?.trim();
  if (!id) throw new DodoError(`${plan.name} is not available yet.`, 503);
  return id;
}

async function dodoFetch(path: string, init: RequestInit) {
  const response = await fetch(`${dodoBaseUrl()}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${apiKey()}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new DodoError(String((payload as any)?.message || `Dodo returned ${response.status}.`), response.status);
  }
  return payload as any;
}

export async function createCheckoutSession(input: {
  plan: Plan; userId: string; email: string; name?: string;
  returnUrl: string; cancelUrl: string; metadata?: Record<string, string>;
}) {
  const payload = await dodoFetch("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      product_cart: [{ product_id: productIdForPlan(input.plan), quantity: 1 }],
      customer: { email: input.email, ...(input.name ? { name: input.name } : {}) },
      return_url: input.returnUrl,
      cancel_url: input.cancelUrl,
      metadata: { user_id: input.userId, plan_code: input.plan.code, lane: input.plan.lane, ...(input.metadata || {}) },
    }),
  });
  const checkoutUrl = payload?.checkout_url;
  if (!checkoutUrl) throw new DodoError("Dodo did not return a checkout URL.");
  return { sessionId: String(payload.session_id), checkoutUrl: String(checkoutUrl) };
}

export async function createPortalSession(customerId: string) {
  const payload = await dodoFetch(`/customers/${encodeURIComponent(customerId)}/customer-portal/session`, { method: "POST" });
  const link = payload?.link;
  if (!link) throw new DodoError("Dodo did not return a portal link.");
  return { link: String(link) };
}

/**
 * Standard Webhooks verification: base64 HMAC-SHA256 over `id.timestamp.body`.
 * The header may carry several space-separated `v1,<signature>` entries.
 */
export function verifyWebhookSignature(input: {
  id: string; timestamp: string; signature: string; rawBody: string; secret: string;
}) {
  if (!input.id || !input.timestamp || !input.signature || !input.secret) return false;

  const sent = Number(input.timestamp);
  if (!Number.isFinite(sent)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - sent) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(input.secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${input.id}.${input.timestamp}.${input.rawBody}`)
    .digest();

  return input.signature.split(" ").some((part) => {
    const value = part.includes(",") ? part.split(",")[1] : part;
    if (!value) return false;
    let candidate: Buffer;
    try { candidate = Buffer.from(value, "base64"); } catch { return false; }
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- dodo`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dodo.ts src/lib/dodo.test.ts
git commit -m "feat(billing): add Dodo client and Standard Webhooks verification"
```

---

### Task 6: Billing endpoints

**Files:**
- Create: `src/pages/api/billing/checkout.ts`, `src/pages/api/billing/webhook.ts`, `src/pages/api/billing/portal.ts`, `src/pages/api/billing/status.ts`
- Modify: `src/lib/supabase.ts` (add a service-role client accessor if absent)

**Interfaces:**
- Consumes: `planByCode` (Task 1), `createCheckoutSession`/`createPortalSession`/`verifyWebhookSignature` (Task 5), `assertSameOrigin`/`requireUser`/`json` from `src/lib/api.ts`.
- Produces: `POST /api/billing/checkout` → `{url}`; `POST /api/billing/webhook`; `GET /api/billing/portal` → 303; `GET /api/billing/status` → `{paid, planCode, lane}`.

- [ ] **Step 1: Add a service-role Supabase accessor**

In `src/lib/supabase.ts`, confirm whether a service-role client already exists (it is used by account deletion). If not, add:

```ts
export function createSupabaseServiceClient(): SupabaseClient {
  const config = getSupabaseConfig();
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!config.url || !serviceKey) throw new Error("Supabase service role is not configured.");
  return createClient(config.url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
```

- [ ] **Step 2: Implement checkout**

Create `src/pages/api/billing/checkout.ts`:

```ts
import type { APIRoute } from "astro";
import { assertSameOrigin, errorMessage, json, requireUser } from "../../../lib/api";
import { planByCode } from "../../../config/plans";
import { DodoError, createCheckoutSession } from "../../../lib/dodo";
export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const body = await context.request.json().catch(() => ({}));
    const plan = planByCode(String((body as any).planCode || ""));
    if (!plan) return json({ error: "Choose a plan to continue." }, { status: 400 });

    const origin = context.url.origin;
    const session = await createCheckoutSession({
      plan,
      userId: user.id,
      email: user.email || "",
      name: (user.user_metadata as any)?.full_name,
      returnUrl: `${origin}/checkout/success?plan=${encodeURIComponent(plan.code)}`,
      cancelUrl: `${origin}/pricing?checkout=cancelled`,
    });
    return json({ url: session.checkoutUrl, sessionId: session.sessionId });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: error instanceof DodoError ? error.status : 400 });
  }
};
```

- [ ] **Step 3: Implement the webhook**

Create `src/pages/api/billing/webhook.ts`. It must read the raw body first, verify, dedupe, then upsert.

```ts
import type { APIRoute } from "astro";
import { planByCode } from "../../../config/plans";
import { verifyWebhookSignature } from "../../../lib/dodo";
import { assignedHumanAssistant } from "../../../lib/human-assistants";
import { createSupabaseServiceClient } from "../../../lib/supabase";
export const prerender = false;

const ACTIVATING = new Set(["payment.succeeded", "subscription.active", "subscription.renewed"]);
const DEACTIVATING = new Set(["subscription.cancelled", "subscription.expired", "subscription.failed"]);

export const POST: APIRoute = async (context) => {
  const rawBody = await context.request.text();
  const secret = import.meta.env.DODO_WEBHOOK_SECRET?.trim() || "";
  const id = context.request.headers.get("webhook-id") || "";
  const timestamp = context.request.headers.get("webhook-timestamp") || "";
  const signature = context.request.headers.get("webhook-signature") || "";

  if (!verifyWebhookSignature({ id, timestamp, signature, rawBody, secret })) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401, headers: { "content-type": "application/json" } });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return new Response("bad payload", { status: 400 }); }

  const supabase = createSupabaseServiceClient();

  // Idempotency: the primary key rejects a replayed delivery.
  const seen = await supabase.from("webhook_events")
    .insert({ dodo_event_id: id, event_type: String(event.type || ""), payload: event });
  if (seen.error) {
    if (seen.error.code === "23505") return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ error: seen.error.message }), { status: 500, headers: { "content-type": "application/json" } });
  }

  const type = String(event.type || "");
  const data = event.data || {};
  const metadata = data.metadata || {};
  const userId = String(metadata.user_id || "");
  const plan = planByCode(String(metadata.plan_code || ""));

  if (!userId || !plan) return new Response(JSON.stringify({ ok: true, ignored: true }), { status: 200, headers: { "content-type": "application/json" } });

  if (ACTIVATING.has(type)) {
    const row = {
      user_id: userId,
      plan_code: plan.code,
      lane: plan.lane,
      status: "active" as const,
      dodo_customer_id: data.customer?.customer_id ? String(data.customer.customer_id) : null,
      dodo_subscription_id: data.subscription_id ? String(data.subscription_id) : null,
      dodo_payment_id: data.payment_id ? String(data.payment_id) : null,
      current_period_end: plan.billing === "recurring" ? (data.next_billing_date || null) : null,
      applications_quota: plan.applicationsQuota,
      applications_used: 0,
      updated_at: new Date().toISOString(),
    };

    // A renewal refreshes the period and quota on the existing row; a new
    // purchase inserts one. Both are keyed on the Dodo identifier.
    const existing = row.dodo_subscription_id
      ? await supabase.from("subscriptions").select("id,applications_used").eq("dodo_subscription_id", row.dodo_subscription_id).maybeSingle()
      : { data: null, error: null } as const;

    const written = existing.data
      ? await supabase.from("subscriptions").update(row).eq("id", (existing.data as any).id)
      : await supabase.from("subscriptions").insert(row);
    if (written.error) return new Response(JSON.stringify({ error: written.error.message }), { status: 500, headers: { "content-type": "application/json" } });

    // Assign the human assistant only now that payment has cleared.
    if (plan.lane === "human") {
      const assistant = assignedHumanAssistant(userId);
      const profile = await supabase.from("profiles")
        .update({ assistant_type: "human", assistant_name: assistant.name, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (profile.error) return new Response(JSON.stringify({ error: profile.error.message }), { status: 500, headers: { "content-type": "application/json" } });
    } else {
      await supabase.from("profiles").update({ assistant_type: "ai", assistant_name: "Scout AI", updated_at: new Date().toISOString() }).eq("user_id", userId);
    }
  } else if (DEACTIVATING.has(type)) {
    await supabase.from("subscriptions").update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("user_id", userId).eq("plan_code", plan.code).eq("status", "active");
  } else if (type === "payment.failed") {
    await supabase.from("subscriptions").update({ status: "past_due", updated_at: new Date().toISOString() })
      .eq("user_id", userId).eq("status", "active");
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
};
```

- [ ] **Step 4: Implement portal and status**

Create `src/pages/api/billing/portal.ts`:

```ts
import type { APIRoute } from "astro";
import { errorMessage, json, requireUser } from "../../../lib/api";
import { createPortalSession } from "../../../lib/dodo";
export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const user = requireUser(context);
    const { data } = await context.locals.supabase!
      .from("subscriptions").select("dodo_customer_id")
      .eq("user_id", user.id).not("dodo_customer_id", "is", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!data?.dodo_customer_id) return json({ error: "No billing account found." }, { status: 404 });
    const { link } = await createPortalSession(String(data.dodo_customer_id));
    return context.redirect(link, 303);
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};
```

Create `src/pages/api/billing/status.ts`:

```ts
import type { APIRoute } from "astro";
import { json, requireUser } from "../../../lib/api";
export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    requireUser(context);
    const entitlement = context.locals.entitlement;
    return json({
      paid: entitlement.paid, lane: entitlement.lane, planCode: entitlement.planCode,
      applicationsRemaining: entitlement.applicationsRemaining,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Unavailable" }, { status: 400 });
  }
};
```

- [ ] **Step 5: Exempt the webhook from auth and origin checks**

In `src/middleware.ts`, `protectedApiPrefixes` includes `/api/app` and others but not `/api/billing`. Add `"/api/billing/checkout"`, `"/api/billing/portal"`, and `"/api/billing/status"` to `protectedApiPrefixes` — but **not** `/api/billing/webhook`, which is authenticated by signature and called by Dodo, not the browser.

- [ ] **Step 6: Typecheck and build**

Run: `npx astro check && npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/pages/api/billing src/lib/supabase.ts src/middleware.ts
git commit -m "feat(billing): add checkout, webhook, portal, and status endpoints"
```

---

### Task 7: Server-side enforcement

**Files:**
- Modify: `src/pages/api/app/ai-jobs.ts`, `src/pages/api/app/jobs.ts`, `src/pages/api/app/ai-agent.ts`, `src/pages/agent.astro:7`

**Interfaces:**
- Consumes: `assertCanApply`, `assertCanActivateAgent` (Task 3).

- [ ] **Step 1: Gate the AI apply path**

In `src/pages/api/app/ai-jobs.ts`, import `assertCanApply` from `../../../lib/entitlements` and call it immediately after `requireUser` in the `POST` handler. The existing `catch (error) { if (error instanceof Response) return error; ... }` already forwards the thrown 402.

- [ ] **Step 2: Increment usage after a successful application**

In the same handler, after the application is successfully queued, increment the counter:

```ts
await context.locals.supabase!.rpc("increment_application_usage", { p_user_id: user.id });
```

Add that function to the migration from Task 2 by creating a follow-up migration `supabase/migrations/202608050002_application_usage.sql`:

```sql
create or replace function public.increment_application_usage(p_user_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.subscriptions
     set applications_used = applications_used + 1, updated_at = now()
   where user_id = p_user_id and status = 'active';
$$;
grant execute on function public.increment_application_usage(uuid) to authenticated;
```

Apply it: `npx supabase db push`

- [ ] **Step 3: Gate the human delegate path**

In `src/pages/api/app/jobs.ts`, in the `PATCH` handler, call `assertCanApply(context.locals.entitlement)` **only when** the incoming body sets `status` to `"delegated"`. Saving, editing, and un-saving a job stay free.

- [ ] **Step 4: Gate agent activation**

In `src/pages/api/app/ai-agent.ts`, in the `POST` handler, call `assertCanActivateAgent(context.locals.entitlement)` when `action === "activate"`. Pausing and saving a draft stay free.

- [ ] **Step 5: Gate the agent page**

In `src/pages/agent.astro`, line 7 currently reads:

```ts
if (Astro.locals.scoutProfile?.assistant_type !== "ai") return Astro.redirect("/dashboard");
```

Add below it:

```ts
const entitlement = Astro.locals.entitlement;
```

and render the locked state when `!entitlement.canActivateAgent` — replace the form section with a paywall panel whose button calls `window.scoutRequirePlan({lane:"ai", reason: entitlement.reason})` (added in Task 8).

- [ ] **Step 6: Verify the gates by hand**

Run `npm run dev`, sign in as a user with no subscription row, and confirm:
```bash
curl -si localhost:4321/api/app/ai-jobs -X POST -H 'content-type: application/json' -H "origin: http://localhost:4321" --cookie "<session cookies>" -d '{}' | head -1
```
Expected: `HTTP/1.1 402 Payment Required`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/api/app src/pages/agent.astro supabase/migrations/202608050002_application_usage.sql
git commit -m "feat(billing): enforce entitlements on apply, delegate, and agent activation"
```

---

### Task 8: Pricing modal and the Get Assistant buttons

**Files:**
- Create: `src/components/PricingModal.astro`
- Modify: `src/layouts/App.astro:41,49-65`, `src/pages/jobs.astro:53-63,89`, `src/pages/dashboard.astro:20`, `src/pages/pricing.astro`

**Interfaces:**
- Consumes: `PLANS`, `plansForLane` (Task 1); `Astro.locals.entitlement` (Task 4); `POST /api/billing/checkout` (Task 6).
- Produces: global `window.scoutRequirePlan(payload?: {lane?, reason?, context?})` and `window.scoutHandle402(response, payload)`.

- [ ] **Step 1: Build the modal**

Create `src/components/PricingModal.astro` as a `<dialog>` driven by `plansForLane`. It must:
- accept a `lane` and switch the visible plan set,
- show a contextual headline when opened with a `context` string (e.g. the job title),
- show the repurchase copy when `reason === "quota_exhausted"`,
- POST the chosen `planCode` to `/api/billing/checkout` and `location.assign(url)`,
- show `ScoutLoader` inline while the checkout session is created.

Pass server data with `define:vars` — never `import.meta` in the inline script.

- [ ] **Step 2: Mount it and add the global helpers**

In `src/layouts/App.astro`, import and render `<PricingModal lane={...} />` once, before the closing `</body>`. Add an inline script defining:

```js
window.scoutRequirePlan = function (payload) { /* opens the dialog, applies lane/context/reason */ };
window.scoutHandle402 = async function (response, payload) {
  if (response.status !== 402) return false;
  const data = await response.json().catch(() => ({}));
  window.scoutRequirePlan({ ...payload, lane: data.lane, reason: data.reason });
  return true;
};
```

- [ ] **Step 3: Replace the sidebar assistant badge**

In `src/layouts/App.astro:41`, the assistant card renders unconditionally. Wrap it: when `Astro.locals.entitlement.paid` is false, render a **Get Assistant** button that calls `window.scoutRequirePlan({lane: assistantType})` instead of the assistant identity.

- [ ] **Step 4: Replace the jobs handoff badge**

In `src/pages/jobs.astro:55-63`, the `.assistant-identity` block shows the assigned assistant. When unpaid, render the Get Assistant button in its place. In the delegate handler at line 89, wrap both fetches so a 402 opens the modal:

```js
if (await window.scoutHandle402(response, { context: selected.title + " at " + selected.company })) {
  event.currentTarget.disabled = false;
  return;
}
```

- [ ] **Step 5: Drive the pricing page from the catalog**

In `src/pages/pricing.astro`, delete the local `humanPlans`/`aiPlans` literals at lines 8-17 and map over `plansForLane("human")` / `plansForLane("ai")`. Human CTAs keep linking to `/book-call`; AI CTAs POST to checkout when signed in, or go to `/login?next=/pricing` when not.

- [ ] **Step 6: Build**

Run: `npx astro check && npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/PricingModal.astro src/layouts/App.astro src/pages/jobs.astro src/pages/dashboard.astro src/pages/pricing.astro
git commit -m "feat(billing): add pricing modal and replace assistant badges with Get Assistant"
```

---

### Task 9: Checkout success page and Dodo setup script

**Files:**
- Create: `src/pages/checkout/success.astro`, `scripts/dodo-setup.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `GET /api/billing/status` (Task 6), `ScoutLoader` (Task 12 — if building in order, use a plain spinner here and swap it in Task 12).

- [ ] **Step 1: Build the success page**

Create `src/pages/checkout/success.astro` using the `Auth` layout. It polls `/api/billing/status` every 1.5s for up to 30s, showing the branded loader, then redirects to `/dashboard` once `paid` is true. If the poll times out it shows "Your payment is confirmed — we are still activating your plan" with a dashboard link, never an error.

- [ ] **Step 2: Write the setup script**

Create `scripts/dodo-setup.mjs`. Reads `DODO_API_KEY` and `DODO_ENVIRONMENT` from the environment, imports `PLANS`, and for each plan `POST`s to `/products` with a one-time or recurring price depending on `plan.billing`, then prints the resulting `product_id` as an env line to paste.

```js
#!/usr/bin/env node
import { PLANS } from "../src/config/plans.ts";

const base = process.env.DODO_ENVIRONMENT === "live_mode"
  ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
const key = process.env.DODO_API_KEY;
if (!key) { console.error("Set DODO_API_KEY first."); process.exit(1); }

for (const plan of PLANS) {
  const price = plan.billing === "recurring"
    ? { type: "recurring_price", price: plan.priceCents, currency: "USD", payment_frequency_count: 1, payment_frequency_interval: "Month", subscription_period_count: 1, subscription_period_interval: "Month", discount: 0, purchasing_power_parity: false }
    : { type: "one_time_price", price: plan.priceCents, currency: "USD", discount: 0, purchasing_power_parity: false };

  const response = await fetch(`${base}/products`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ name: plan.name, description: plan.blurb, tax_category: "saas", price }),
  });
  const body = await response.json();
  if (!response.ok) { console.error(`${plan.code}: ${response.status} ${JSON.stringify(body)}`); continue; }
  console.log(`${plan.productEnvKey}=${body.product_id}`);
}
```

Add to `package.json` scripts: `"dodo:setup": "node --experimental-strip-types scripts/dodo-setup.mjs"`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/checkout/success.astro scripts/dodo-setup.mjs package.json
git commit -m "feat(billing): add checkout success page and Dodo product setup script"
```

---

# Phase 2 — Jobs

### Task 10: Board ingestion library

**Files:**
- Create: `src/lib/board-ingest.ts`, `src/lib/board-ingest.test.ts`
- Modify: `src/lib/job-board.ts`

**Interfaces:**
- Produces:
  - `INGEST_AXES: IngestAxis[]` where `IngestAxis = {key: string; params: Record<string,string>}`
  - `OFFSET_CEILING = 100000`
  - `logoUrlForDomain(domain: string | null | undefined): string | null`
  - `normalizeBoardJob(raw: any): BoardJobRow | null`
  - `nextCursor(offset: number, pageSize: number): number`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/board-ingest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { INGEST_AXES, OFFSET_CEILING, logoUrlForDomain, nextCursor, normalizeBoardJob } from "./board-ingest";

const raw = {
  id: 245038189, external_id: "workday_R0005562",
  title: "Client Services Representative", location: "Kansas City, Missouri",
  workplace_type: "hybrid", employment_type: "Full-time", is_remote: false,
  remote_worldwide: false, url: "https://example.com/job/1", posted_at: "2026-08-04T00:00:00.000Z",
  ats: "workday", salary: { min: null, max: null, currency: null, interval: null },
  company: { id: 512483, name: "American Century Services, LLC", domain: "americancentury.myworkdayjobs.com", logo_url: null },
};

describe("normalizeBoardJob", () => {
  it("maps a board record onto a row", () => {
    const row = normalizeBoardJob(raw)!;
    expect(row.external_id).toBe("workday_R0005562");
    expect(row.company).toBe("American Century Services, LLC");
    expect(row.company_domain).toBe("americancentury.myworkdayjobs.com");
    expect(row.external_url).toBe("https://example.com/job/1");
    expect(row.is_remote).toBe(false);
  });

  it("derives a logo because the board leaves logo_url null", () => {
    expect(normalizeBoardJob(raw)!.logo_url).toContain("americancentury.myworkdayjobs.com");
  });

  it("prefers the board logo when it is actually present", () => {
    const withLogo = { ...raw, company: { ...raw.company, logo_url: "https://cdn.example.com/a.png" } };
    expect(normalizeBoardJob(withLogo)!.logo_url).toBe("https://cdn.example.com/a.png");
  });

  it("drops a record with no apply URL", () => {
    expect(normalizeBoardJob({ ...raw, url: "" })).toBeNull();
  });

  it("falls back to a synthetic external id", () => {
    expect(normalizeBoardJob({ ...raw, external_id: null })!.external_id).toBe("board_245038189");
  });
});

describe("logoUrlForDomain", () => {
  it("returns null for a missing domain", () => {
    expect(logoUrlForDomain(null)).toBeNull();
    expect(logoUrlForDomain("")).toBeNull();
  });
});

describe("nextCursor", () => {
  it("advances by the page size", () => {
    expect(nextCursor(0, 100)).toBe(100);
  });

  it("wraps at the offset ceiling because deeper pages time out", () => {
    expect(nextCursor(OFFSET_CEILING - 100, 100)).toBe(0);
    expect(nextCursor(OFFSET_CEILING, 100)).toBe(0);
  });
});

describe("INGEST_AXES", () => {
  it("never sends a parameter that times the board out", () => {
    const banned = ["q", "location", "work_mode", "employment_type"];
    for (const axis of INGEST_AXES) {
      for (const key of Object.keys(axis.params)) expect(banned).not.toContain(key);
    }
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- board-ingest`
Expected: FAIL — cannot resolve `./board-ingest`.

- [ ] **Step 3: Implement**

Create `src/lib/board-ingest.ts`:

```ts
/**
 * The upstream board API returns HTTP 500 (Postgres statement timeout) for
 * `q`, `location`, `work_mode`, and `employment_type`, offers no sort
 * parameter, and dies past offset 100k of 4.49M rows. So Scout sweeps the
 * axes that do work and searches its own indexed copy instead.
 */
export const OFFSET_CEILING = 100000;
export const PAGE_SIZE = 100;
export const PAGES_PER_RUN = 10;

export interface IngestAxis { key: string; params: Record<string, string>; }

export const INGEST_AXES: IngestAxis[] = [
  { key: "ats:greenhouse", params: { ats: "greenhouse" } },
  { key: "ats:lever", params: { ats: "lever" } },
  { key: "ats:ashby", params: { ats: "ashby" } },
  { key: "ats:workable", params: { ats: "workable" } },
  { key: "ats:recruitee", params: { ats: "recruitee" } },
  { key: "ats:workday", params: { ats: "workday" } },
  { key: "ats:smartrecruiters", params: { ats: "smartrecruiters" } },
  { key: "remote", params: { remote: "true" } },
];

export interface BoardJobRow {
  external_id: string; board_id: number | null; title: string; company: string;
  company_domain: string | null; logo_url: string | null; location: string;
  workplace_type: string | null; employment_type: string | null; experience_level: string | null;
  is_remote: boolean; remote_worldwide: boolean; visa_sponsorship: boolean | null;
  salary: unknown; ats: string | null; external_url: string; description: string;
  posted_at: string | null;
}

export function logoUrlForDomain(domain: string | null | undefined): string | null {
  const value = String(domain || "").trim();
  if (!value) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(value)}&sz=128`;
}

export function normalizeBoardJob(raw: any): BoardJobRow | null {
  if (!raw) return null;
  const externalUrl = String(raw.url || raw.apply_url || raw.applyUrl || "").trim();
  if (!externalUrl) return null;

  const company = raw.company || {};
  const domain = company.domain ? String(company.domain) : null;
  const boardId = Number(raw.id);

  return {
    external_id: String(raw.external_id || (Number.isFinite(boardId) ? `board_${boardId}` : externalUrl)).slice(0, 200),
    board_id: Number.isFinite(boardId) ? boardId : null,
    title: String(raw.title || "Untitled role").slice(0, 300),
    company: String(company.name || raw.company_name || "Company").slice(0, 300),
    company_domain: domain,
    logo_url: company.logo_url ? String(company.logo_url) : logoUrlForDomain(domain),
    location: String(raw.location || "").slice(0, 300),
    workplace_type: raw.workplace_type ? String(raw.workplace_type) : null,
    employment_type: raw.employment_type ? String(raw.employment_type) : null,
    experience_level: raw.experience_level ? String(raw.experience_level) : null,
    is_remote: Boolean(raw.is_remote),
    remote_worldwide: Boolean(raw.remote_worldwide),
    visa_sponsorship: typeof raw.visa_sponsorship === "boolean" ? raw.visa_sponsorship : null,
    salary: raw.salary ?? null,
    ats: raw.ats ? String(raw.ats) : null,
    external_url: externalUrl,
    description: String(raw.description || "").slice(0, 50000),
    posted_at: raw.posted_at ? String(raw.posted_at) : null,
  };
}

export function nextCursor(offset: number, pageSize: number) {
  const next = offset + pageSize;
  return next >= OFFSET_CEILING ? 0 : next;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- board-ingest`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/board-ingest.ts src/lib/board-ingest.test.ts
git commit -m "feat(jobs): add board ingestion normalization and sweep axes"
```

---

### Task 11: Ingestion cron

**Files:**
- Create: `src/pages/api/cron/ingest-jobs.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `INGEST_AXES`, `PAGE_SIZE`, `PAGES_PER_RUN`, `nextCursor`, `normalizeBoardJob` (Task 10); `searchJobBoard` (`src/lib/job-board.ts`); `createSupabaseServiceClient` (Task 6).

- [ ] **Step 1: Implement the cron route**

Create `src/pages/api/cron/ingest-jobs.ts`. Mirror the auth pattern already used by `src/pages/api/cron/reconcile.ts` (`Authorization: Bearer ${CRON_SECRET}`). Each run:

1. picks the axis with the oldest `last_run_at` (or the first axis with no cursor row),
2. fetches `PAGES_PER_RUN` pages of `PAGE_SIZE` from that axis's offset, with `include=description`,
3. normalizes and upserts on `external_id` with `{ onConflict: "external_id" }`,
4. advances `next_offset` via `nextCursor` **only after a successful page**, recording `last_error` and stopping the run on failure,
5. returns `{ axis, pages, upserted, nextOffset }`.

Set `export const maxDuration = 300;` — pages take 1.6–14s each.

- [ ] **Step 2: Register the cron**

In `vercel.json`, add to `crons`:

```json
{ "path": "/api/cron/ingest-jobs", "schedule": "*/10 * * * *" }
```

- [ ] **Step 3: Run it locally and confirm rows land**

```bash
npm run dev
curl -s -H "Authorization: Bearer $CRON_SECRET" localhost:4321/api/cron/ingest-jobs
```
Expected: JSON reporting a non-zero `upserted`. Verify in Supabase: `select count(*) from board_jobs;` returns > 0.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/cron/ingest-jobs.ts vercel.json
git commit -m "feat(jobs): ingest the board corpus on a cron sweep"
```

---

### Task 12: Search the local corpus

**Files:**
- Modify: `src/pages/api/app/job-search.ts:17`, `src/pages/jobs.astro`

**Interfaces:**
- Consumes: `board_jobs` (Task 2), `logoUrlForDomain` (Task 10).
- Produces: the same JSON shape the jobs page already consumes — `{total, jobs, count, offset, nextOffset}` with each job carrying `companyLogo`, `initials`, `summaryHtml`, `external_url`.

- [ ] **Step 1: Rewrite the GET handler's fetch**

Replace the `searchJobBoard(...)` call with a Supabase query against `board_jobs`:
- full-text match the profile's roles using `textSearch` on the generated tsvector, OR-joined,
- filter locations with `ilike` when set, honouring the existing "Remote"/"Remote worldwide" special cases via `is_remote`/`remote_worldwide`,
- apply `employment_type`, `experience_level`, and `ats` filters as `in` clauses,
- apply `company_blacklist` client-side as today,
- order by `posted_at desc nulls last`, `range(offset, offset + limit - 1)`.

Keep the response mapping identical so `jobs.astro` needs no change to its `appendBoardJobs` contract, except that `companyLogo` now comes from `row.logo_url`.

- [ ] **Step 2: Degrade gracefully when the corpus is empty**

If the query returns zero rows *and* `offset === 0`, fall back to a single `searchJobBoard({ limit, offset, include: "description" })` call — no banned parameters — so a fresh deployment still shows something.

- [ ] **Step 3: Verify end to end**

Run `npm run dev`, sign in, open `/jobs`. Expected: the list populates, company logos render, and infinite scroll pages without a 500. Confirm in the network tab that `/api/app/job-search` returns 200 in well under a second.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/app/job-search.ts src/pages/jobs.astro
git commit -m "fix(jobs): search the local corpus instead of the timing-out board API"
```

---

# Phase 3 — Booking, header, loader

### Task 13: The missing booking endpoint

**Files:**
- Create: `src/pages/api/book-call.ts`
- Modify: `vercel.json`, `.env.example`

**Interfaces:**
- Consumes: `booking_leads` (Task 2), `rateLimit`/`tooManyRequests` (`src/lib/rate-limit.ts`), `createSupabaseServiceClient` (Task 6).
- Produces: `POST /api/book-call` → `{leadId}`; `PATCH /api/book-call` → `{ok:true}`.

- [ ] **Step 1: Implement POST and PATCH**

Create `src/pages/api/book-call.ts`. The POST must:
- reject when the `website` honeypot field (already present at `book-call.astro:37`) is non-empty, returning a fake success so bots learn nothing,
- rate-limit on the client IP,
- validate: `first_name`, `last_name`, `email` (shape-checked), `primary_role`, `target_location`, `challenge` — all required, all length-capped to the maxlengths the form already declares,
- insert into `booking_leads` with the service-role client (the visitor is anonymous, and RLS denies anon writes by design),
- capture a `strategy_call_lead_created` PostHog event via `getPostHogServer()`,
- return `{ leadId }`.

The PATCH accepts `{leadId, eventUri, inviteeUri}` and sets `status='scheduled'`, `scheduled_at=now()`.

This endpoint is public: it must **not** be added to `protectedApiPrefixes`.

- [ ] **Step 2: Allow the Calendly frame in CSP**

`vercel.json`'s `Content-Security-Policy-Report-Only` has no `frame-src`, so the embed falls through to `default-src self`. Add `frame-src https://calendly.com` and extend `script-src` with `https://assets.calendly.com`.

- [ ] **Step 3: Document the env var**

Add `PUBLIC_CALENDLY_URL=` to `.env.example` under the booking section.

- [ ] **Step 4: Test the round trip**

```bash
curl -si localhost:4321/api/book-call -X POST -H 'content-type: application/json' \
  -d '{"first_name":"Ada","last_name":"Lovelace","email":"ada@example.com","primary_role":"Engineering","target_location":"Remote","challenge":"No time"}' | head -1
```
Expected: `HTTP/1.1 200 OK` with a `leadId`. Confirm the row exists in `booking_leads`.

Then submit the form at `/book-call` in a browser and confirm step 2 reveals the Calendly embed.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/book-call.ts vercel.json .env.example
git commit -m "feat(booking): add the missing book-call endpoint and lead capture"
```

---

### Task 14: Auth-aware header

**Files:**
- Modify: `src/components/Header.astro`, `src/middleware.ts:44-46`

**Interfaces:**
- Produces: `Astro.locals.sessionEmail: string | null` for marketing pages.

- [ ] **Step 1: Resolve display-only session state in middleware**

`middleware.ts:46` returns early for non-protected routes, so `locals.user` is never populated on marketing pages. Add a lightweight branch **before** that early return: for `GET` requests that accept HTML, decode the Supabase auth cookie's JWT payload (base64url, no verification) and set `context.locals.sessionEmail`.

This is deliberately unverified — it only decides which navigation to render. Every authorization decision continues to use `supabase.auth.getUser()` on protected routes. Add a comment saying exactly that, so a later reader does not mistake it for an auth check.

- [ ] **Step 2: Render both states**

In `src/components/Header.astro`, replace the static block at lines 21-24:

```astro
<div class="hidden items-center gap-2 md:flex">
  {Astro.locals.sessionEmail
    ? <Button href="/dashboard" size="md" class="rounded-full bg-ink px-5 text-white hover:bg-brand-950">Go to dashboard</Button>
    : <>
        <a href="/login" class="px-2 py-2 text-sm font-bold text-ink-soft hover:text-ink">Sign in</a>
        <Button href="/book-call" size="md" class="rounded-full bg-ink px-5 text-white hover:bg-brand-950">Book a call</Button>
      </>}
</div>
```

Mirror the same conditional in the mobile disclosure at line 36.

- [ ] **Step 3: Verify both states**

Signed out, load `/` — expect "Sign in" and "Book a call". Sign in, load `/` again — expect "Go to dashboard" and no "Sign in".

- [ ] **Step 4: Commit**

```bash
git add src/components/Header.astro src/middleware.ts
git commit -m "feat(nav): render the header against session state"
```

---

### Task 15: Branded Scout loader

**Files:**
- Create: `src/components/ScoutLoader.astro`
- Modify: `src/layouts/App.astro`, `src/pages/jobs.astro:112`, `src/pages/onboarding.astro`, `src/pages/checkout/success.astro`

**Interfaces:**
- Produces: `<ScoutLoader variant="page" | "inline" | "skeleton" label?: string />`

- [ ] **Step 1: Build the component**

Create `src/components/ScoutLoader.astro` reusing the Scout mark paths from `src/components/Logo.astro:8-9`. The `page` variant is a fixed full-viewport overlay on `#f7faf5`; `inline` is a small centred mark with a label; `skeleton` renders the shimmer rows the jobs list already uses. All animation must sit behind `@media (prefers-reduced-motion: no-preference)`.

- [ ] **Step 2: Add the app shell overlay**

In `src/layouts/App.astro`, render `<ScoutLoader variant="page" />` with an id, and remove it on `DOMContentLoaded` via an inline script. That script must not reference `import.meta`.

- [ ] **Step 3: Replace the generic shimmer**

In `src/pages/jobs.astro`, the `showSkeletons` helper at line 112 injects unbranded grey rows. Point its markup at the loader's skeleton classes so the loading state carries the brand.

- [ ] **Step 4: Use it on the slow paths**

Add the inline variant to the onboarding extraction step (`onboarding.astro` step 3) and the checkout success poll.

- [ ] **Step 5: Verify**

Throttle the network in devtools to Slow 3G and load `/jobs` and `/dashboard`. Expect the branded loader, not a blank page. Then set "reduce motion" in OS settings and confirm the animation stops while the loader still shows.

- [ ] **Step 6: Commit**

```bash
git add src/components/ScoutLoader.astro src/layouts/App.astro src/pages/jobs.astro src/pages/onboarding.astro src/pages/checkout/success.astro
git commit -m "feat(ui): add the branded Scout loader"
```

---

# Phase 4 — Reconcile

### Task 16: Stop assigning assistants before payment

**Files:**
- Modify: `src/pages/api/app/onboarding.ts:22,33,74`

- [ ] **Step 1: Remove the premature assignment**

Line 22 computes `assignedHumanAssistant(user.id)` and line 74 writes it to `profiles.assistant_name` regardless of payment. Change the profile update to set `assistant_name: null` for the human lane; the webhook (Task 6) assigns it when payment clears. Keep `assistant_type` as the recorded lane intent. Apply the same change to the demo branch at line 33 — except demo mode, which has no billing, keeps its assistant so the demo stays usable.

- [ ] **Step 2: Route human signups to checkout**

The onboarding response at line 86 always redirects to `/dashboard`. For the human lane with no active subscription, redirect to `/pricing?lane=human` instead.

- [ ] **Step 3: Verify**

Complete onboarding as a new human user. Expect: no assistant name on the dashboard, a Get Assistant button, and no WhatsApp card.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/app/onboarding.ts
git commit -m "fix(billing): assign human assistants on payment, not at onboarding"
```

---

### Task 17: Billing in settings and admin

**Files:**
- Modify: `src/pages/settings.astro`, `src/pages/admin.astro`

- [ ] **Step 1: Add the settings billing section**

Render current plan name, status, applications used against quota (a progress bar), and renewal date for recurring plans. Include a "Manage billing" link to `/api/billing/portal` when `dodo_customer_id` exists, and a "Choose a plan" button opening the modal when unpaid.

- [ ] **Step 2: Show payment status in admin**

In `src/pages/admin.astro`, the human assistant setup list currently shows every human-lane profile including unpaid ones, which would have operations create WhatsApp groups for people who never paid. Join against `subscriptions` and show a plan badge, defaulting the list to paid members only.

- [ ] **Step 3: Verify**

Load `/settings` as a paid user and an unpaid user; confirm each state renders. Load `/admin` and confirm unpaid members are no longer queued for group setup.

- [ ] **Step 4: Commit**

```bash
git add src/pages/settings.astro src/pages/admin.astro
git commit -m "feat(billing): surface plan state in settings and admin"
```

---

### Task 18: Documentation and full verification

**Files:**
- Modify: `.env.example`, `README.md`
- Create: `docs/billing-setup.md`

- [ ] **Step 1: Document every new env var**

Add to `.env.example`: `DODO_API_KEY`, `DODO_WEBHOOK_SECRET`, `DODO_ENVIRONMENT`, the five `DODO_PRODUCT_*` keys, and `PUBLIC_CALENDLY_URL`.

- [ ] **Step 2: Write the setup checklist**

Create `docs/billing-setup.md` covering: create the products (`npm run dodo:setup`), paste the printed IDs into Vercel env, register the webhook endpoint at `https://<domain>/api/billing/webhook` in the Dodo dashboard, copy the signing secret into `DODO_WEBHOOK_SECRET`, and run one test-mode purchase end to end.

- [ ] **Step 3: Run the full verification**

```bash
npm test
npx astro check
npm run build
```
Expected: all tests pass, no new type errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add .env.example README.md docs/billing-setup.md
git commit -m "docs: document billing setup and new environment variables"
```

---

## Self-Review

**Spec coverage:** Booking flow → Task 13. Dodo pricing → Tasks 1, 5, 6, 8, 9. Header auth → Task 14. Jobs empty in production → Tasks 10, 11, 12. Job logos → Tasks 10, 12. Branded loader → Task 15. Dashboard authorization → Tasks 3, 4, 7. Assistant badge → Task 8. Reconcile → Tasks 16, 17, 18. Every spec section maps to a task.

**Type consistency:** `Entitlement` fields used in Tasks 4, 6, 7, 8 match Task 3's definition. `Plan.productEnvKey` in Task 5 and Task 9 matches Task 1. `BoardJobRow` in Task 12 matches Task 10. `nextCursor`/`OFFSET_CEILING` names are consistent across Tasks 10 and 11.

**Known deviation from the spec:** the spec listed one migration; the plan adds a second (`202608050002_application_usage.sql`) for the usage-increment function, because it is needed by Task 7 rather than Task 2.
