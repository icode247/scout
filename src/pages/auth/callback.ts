import type { APIRoute } from "astro";
import { safeNext } from "../../lib/api";
import { createSupabaseServerClient } from "../../lib/supabase";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const next = safeNext(context.url.searchParams.get("next"));
  const code = context.url.searchParams.get("code");
  const tokenHash = context.url.searchParams.get("token_hash");
  const type = context.url.searchParams.get("type") as "email" | "magiclink" | null;
  const supabase = createSupabaseServerClient(context);

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return context.redirect(next, 303);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return context.redirect(next, 303);
  }
  return context.redirect("/login?error=callback", 303);
};
