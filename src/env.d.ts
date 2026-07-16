/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_PLAUSIBLE_DOMAIN?: string;
  readonly SCOUT_DEMO_MODE?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
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
