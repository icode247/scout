import type { APIRoute } from "astro";
import { assertSameOrigin } from "../../../lib/api";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  assertSameOrigin(context);
  if (context.locals.supabase) await context.locals.supabase.auth.signOut();
  context.cookies.delete("scout_demo_email", { path: "/" });
  return context.redirect("/login", 303);
};
