import { createSupabaseServiceClient } from "./supabase";
import { escapeHtml, sendScoutEmail } from "./email";

/**
 * Sends Scout's own sign-in email. Supabase's default magic link is a PKCE link:
 * it only works in the browser that asked for it, so a client who requests it on
 * a laptop and taps it on a phone (or in their mail app's built-in browser) lands
 * on "That login link is invalid or expired". A token-hash link verifies on any
 * device. Returns false when email is not configured so the caller can fall back.
 */
export async function sendSignInLink(email: string, next: string, origin: string): Promise<boolean> {
  const admin = createSupabaseServiceClient();
  let generated = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (generated.error) {
    // A first-time visitor has no account yet; create it, as signInWithOtp would.
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (created.error && !/already/i.test(created.error.message)) throw created.error;
    generated = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (generated.error) throw generated.error;
  }
  const tokenHash = generated.data.properties?.hashed_token;
  if (!tokenHash) throw new Error("Sign-in link could not be generated");

  const link = new URL("/auth/callback", origin);
  link.searchParams.set("token_hash", tokenHash);
  link.searchParams.set("type", "magiclink");
  link.searchParams.set("next", next);
  const href = link.toString();

  const sent = await sendScoutEmail({
    to: email,
    subject: "Your Scout sign-in link",
    text: `Sign in to Scout:\n\n${href}\n\nThe link works on any device and expires in 1 hour. If you did not ask for it, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#14210f;max-width:480px">
      <p style="margin:0 0 16px">Tap the button to sign in to Scout.</p>
      <p style="margin:0 0 24px"><a href="${escapeHtml(href)}" style="display:inline-block;background:#14210f;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">Sign in to Scout</a></p>
      <p style="margin:0 0 8px;font-size:14px;color:#3d4a35">The link works on any device and expires in 1 hour.</p>
      <p style="margin:0;font-size:14px;color:#69735f">If you did not ask for it, you can ignore this email.</p>
    </div>`,
  });
  return sent !== null;
}
