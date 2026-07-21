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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    supabase?: import("@supabase/supabase-js").SupabaseClient<any, any, any>;
    user?: import("@supabase/supabase-js").User;
    scoutProfile?: import("./lib/scout-data").ScoutProfile | null;
    demoMode: boolean;
  }
}
