/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_PLAUSIBLE_DOMAIN?: string;
  readonly PUBLIC_CHROME_EXTENSION_URL?: string;
  readonly PUBLIC_CHROME_EXTENSION_ID?: string;
  readonly RESUME_EXTRACTION_PROVIDER?: string;
  readonly ANTHROPIC_API_KEY?: string;
  readonly ANTHROPIC_MODEL?: string;
  readonly OPENAI_API_KEY?: string;
  readonly OPENAI_MODEL?: string;
  readonly ADMIN_EMAILS?: string;
  readonly FULFILLMENT_API_KEY?: string;
  readonly CALCOM_EMBED_URL?: string;
  readonly SCOUT_DEMO_MODE?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly FIRSTAPPLY_API_URL?: string;
  readonly FIRSTAPPLY_API_TOKEN?: string;
  readonly BOARD_API_URL?: string;
  readonly BOARD_API_TOKEN?: string;
  readonly JOB_BOARD_API_URL?: string;
  readonly JOB_BOARD_API_TOKEN?: string;
  readonly CRON_SECRET?: string;
  readonly RESEND_REPLY_TO?: string;
  readonly SCOUT_MAILING_ADDRESS?: string;
  readonly PUBLIC_CALENDLY_URL?: string;
  readonly DODO_API_KEY?: string;
  readonly DODO_WEBHOOK_SECRET?: string;
  readonly DODO_ENVIRONMENT?: string;
  readonly DODO_PRODUCT_HUMAN_FOCUSED?: string;
  readonly DODO_PRODUCT_HUMAN_FULL?: string;
  readonly DODO_PRODUCT_HUMAN_CAMPAIGN?: string;
  readonly DODO_PRODUCT_AI_ESSENTIAL?: string;
  readonly DODO_PRODUCT_AI_PLUS?: string;
  readonly DODO_PRODUCT_HUMAN_FOCUSED_90?: string;
  readonly DODO_PRODUCT_HUMAN_FULL_90?: string;
  readonly DODO_PRODUCT_HUMAN_CAMPAIGN_90?: string;
  readonly DODO_PRODUCT_AI_ESSENTIAL_90?: string;
  readonly DODO_PRODUCT_AI_PLUS_90?: string;
  readonly RESEND_API_KEY?: string;
  readonly RESEND_FROM_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    supabase?: import("@supabase/supabase-js").SupabaseClient<any, any, any>;
    user?: import("@supabase/supabase-js").User;
    scoutProfile?: import("./lib/scout-data").ScoutProfile | null;
    entitlement: import("./lib/entitlements").Entitlement;
    /**
     * Unverified email decoded from the auth cookie, for rendering the marketing
     * header only. Never use it for an authorization decision.
     */
    sessionEmail?: string | null;
    demoMode: boolean;
  }
}
