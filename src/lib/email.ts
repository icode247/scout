import type { Plan } from "../config/plans";
import { SITE } from "../config/site";
import { serverEnv } from "./server-env";

export class EmailError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "EmailError";
    this.status = status;
  }
}

export function emailConfigured() {
  return Boolean(serverEnv("RESEND_API_KEY"));
}

export function siteUrl() {
  return (serverEnv("PUBLIC_SITE_URL") || SITE.url).replace(/\/$/, "");
}

export function fromAddress() {
  // updates.<site> is the domain verified in Resend; the apex is not.
  return serverEnv("RESEND_FROM_EMAIL") || `Kate from ${SITE.name} <kate@updates.${new URL(SITE.url).hostname}>`;
}

export function replyToAddress() {
  return serverEnv("RESEND_REPLY_TO") || `kate@${new URL(SITE.url).hostname}`;
}

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface SubscriptionEmailInput {
  to: string;
  plan: Plan;
  /** Set for the human lane; the email introduces the assigned assistant. */
  assistant?: { name: string; firstName: string } | null;
  /** Lets Resend drop a duplicate send if the same delivery is retried. */
  idempotencyKey?: string;
}

export interface ScoutEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey?: string;
  headers?: Record<string, string>;
}

export async function sendScoutEmail(input: ScoutEmailInput) {
  const apiKey = serverEnv("RESEND_API_KEY");
  if (!apiKey) {
    console.warn("RESEND_API_KEY is not set; skipping the email.");
    return null;
  }

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        ...(input.idempotencyKey ? { "idempotency-key": input.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: fromAddress(),
        reply_to: replyToAddress(),
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
        ...(input.headers ? { headers: input.headers } : {}),
      }),
    });
  } catch {
    throw new EmailError("Scout could not reach the email provider.", 502);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new EmailError(String((payload as any)?.message || `The email provider returned ${response.status}.`), response.status);
  }
  return { id: String((payload as any)?.id || "") };
}

export function subscriptionConfirmationContent(input: SubscriptionEmailInput) {
  const { plan, assistant } = input;
  const dashboard = `${siteUrl()}/dashboard`;
  const support = `${siteUrl()}/support`;

  const subject = assistant
    ? `Your ${plan.name} plan is active — ${assistant.firstName} is your assistant`
    : `Your ${plan.name} plan is active`;

  const lines = [
    `Thanks for choosing ${SITE.name}. Your payment went through and your ${plan.name} plan is now active.`,
    `Plan: ${plan.name} — ${plan.applications}`,
    ...(assistant
      ? [
          `Your Human Assistant: ${assistant.name}`,
          `${assistant.firstName} will set up your dedicated WhatsApp group and start working from your job profile.`,
        ]
      : [`Scout AI is ready. Finish your job profile on the dashboard and start sending jobs from any job site.`]),
    ...(plan.validityDays ? [`Your application allowance is valid for ${plan.validityDays} days from today.`] : []),
    `Open your dashboard: ${dashboard}`,
    `Questions? Visit ${support}`,
  ];

  const text = `Hi,\n\n${lines.join("\n\n")}\n\n— The ${SITE.name} team`;

  const htmlParagraphs = [
    `<p style="margin:0 0 16px">Thanks for choosing ${escapeHtml(SITE.name)}. Your payment went through and your <strong>${escapeHtml(plan.name)}</strong> plan is now active.</p>`,
    `<p style="margin:0 0 16px;padding:12px 16px;background:#f4f8ee;border-radius:12px"><strong>${escapeHtml(plan.name)}</strong> · ${escapeHtml(plan.applications)}${assistant ? `<br>Your Human Assistant: <strong>${escapeHtml(assistant.name)}</strong>` : ""}</p>`,
    assistant
      ? `<p style="margin:0 0 16px">${escapeHtml(assistant.firstName)} will set up your dedicated WhatsApp group and start working from your job profile.</p>`
      : `<p style="margin:0 0 16px">Scout AI is ready. Finish your job profile on the dashboard and start sending jobs from any job site.</p>`,
    ...(plan.validityDays
      ? [`<p style="margin:0 0 16px">Your application allowance is valid for ${plan.validityDays} days from today.</p>`]
      : []),
    `<p style="margin:24px 0"><a href="${dashboard}" style="background:#7fc92b;color:#12240a;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:999px;display:inline-block">Open your dashboard</a></p>`,
    `<p style="margin:0;color:#5b6355;font-size:13px">Questions? Visit <a href="${support}" style="color:#3f7d17">${escapeHtml(SITE.name)} support</a>.</p>`,
  ];

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1c2417;font-size:15px;line-height:1.6">${htmlParagraphs.join("")}</div>`;

  return { subject, text, html };
}

/**
 * Sends the post-payment confirmation. Returns null (with a warning) when
 * RESEND_API_KEY is unset so billing keeps working before email is configured.
 */
export async function sendSubscriptionConfirmationEmail(input: SubscriptionEmailInput) {
  if (!emailConfigured()) {
    console.warn("RESEND_API_KEY is not set; skipping the subscription confirmation email.");
    return null;
  }

  const { subject, text, html } = subscriptionConfirmationContent(input);
  return sendScoutEmail({ to: input.to, subject, text, html, idempotencyKey: input.idempotencyKey });
}
