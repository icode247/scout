import { createSupabaseServiceClient } from "./supabase";
import { escapeHtml, fromAddress, sendScoutEmail, siteUrl } from "./email";
import { SITE } from "../config/site";

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
  link.searchParams.set("type", "email");
  link.searchParams.set("next", next);
  const href = link.toString();

  const sent = await sendScoutEmail({
    to: email,
    // Account emails come from the product, not a person: a sign-in link "from Kate" reads like phishing.
    from: `${SITE.name} <${senderAddress()}>`,
    subject: "Your Scout sign-in link",
    text: `Sign in to Scout:\n\n${href}\n\nThe link works on any device and expires in 1 hour. Asking for another link replaces this one, so always use the newest email. If you did not ask for it, you can ignore this email.`,
    html: signInEmailHtml(href),
  });
  return sent !== null;
}

/** The verified sending address from the configured sender, e.g. kate@updates.applyscout.app. */
function senderAddress() {
  const configured = fromAddress();
  return configured.match(/<([^>]+)>/)?.[1] ?? configured;
}

/** Same frame as the launch emails: logo, white card on the pale brand background, lime button. */
function signInEmailHtml(href: string) {
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
  const link = escapeHtml(href);
  const logo = `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td><img src="${siteUrl()}/scout-mark-512.png" width="32" height="32" alt="" style="display:block;border:0"></td><td style="padding-left:10px;font-family:${font};font-size:24px;font-weight:800;letter-spacing:-1px;color:#14210f">scout</td></tr></table>`;
  return `<!doctype html><html><body style="margin:0;background:#f4f8ee;color:#14210f"><div style="display:none;max-height:0;overflow:hidden">Your sign-in link for Scout. It works on any device for 1 hour.</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8ee"><tr><td align="center" style="padding:28px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px"><tr><td style="padding:28px 32px 8px">${logo}</td></tr><tr><td style="padding:18px 32px 32px;font-family:${font};font-size:16px;line-height:1.65"><h1 style="margin:0 0 10px;font-size:22px;line-height:1.3">Sign in to Scout</h1><p style="margin:0 0 22px;color:#3d4a35">Tap the button to open your account. You will see your applications, the resume used for each job, and your assistant's updates.</p><p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;border-radius:999px;background:#9dde47;padding:13px 24px;color:#10210d;font-weight:800;text-decoration:none">Sign in to Scout</a></p><p style="margin:0 0 6px;font-size:14px;color:#3d4a35">The link works on any device and expires in 1 hour. Asking for another link replaces this one, so always use the newest email.</p><p style="margin:0;font-size:13px;color:#69735f">Button not working? Copy this link into your browser:<br><a href="${link}" style="color:#3f7d17;word-break:break-all">${link}</a></p></td></tr></table><div style="max-width:520px;padding:18px 24px;font-family:${font};color:#69735f;font-size:12px;line-height:1.6;text-align:center">You received this because someone asked to sign in to Scout with this email. If it was not you, ignore this email and nothing will change.</div></td></tr></table></body></html>`;
}
