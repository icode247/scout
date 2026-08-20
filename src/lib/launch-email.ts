import { escapeHtml, sendScoutEmail, siteUrl } from "./email";
import { serverEnv } from "./server-env";

export type LaunchEmailNumber = 1 | 2 | 3 | 4;
export type LaunchLane = "human" | "ai";

export interface LaunchEmailInput {
  to: string;
  firstName?: string | null;
  emailNumber: LaunchEmailNumber;
  preferredLane?: LaunchLane | null;
  unsubscribeToken: string;
  enrollmentId: string;
}

const subjects: Record<LaunchEmailNumber, string> = {
  1: "A better way to get applications out",
  2: "What Scout handles for you",
  3: "Human Assistant or AI Assistant?",
  4: "Ready to give yourself time back?",
};

function address() {
  return serverEnv("SCOUT_MAILING_ADDRESS")?.trim() || "";
}

function content(emailNumber: LaunchEmailNumber, humanFirst: boolean) {
  const pricing = `${siteUrl()}/pricing`;
  const dashboard = `${siteUrl()}/dashboard`;
  const human = "Human Assistant: a real person reviews the role, handles application questions, and keeps the work moving with you.";
  const ai = "AI Assistant: automated application throughput, tailored around the job profile and preferences you control.";

  switch (emailNumber) {
    case 1:
      return {
        preview: "Scout helps you spend less time repeating applications.",
        paragraphs: [
          "Job searching already takes enough energy. Re-entering the same details, adapting materials, and tracking every application should not take the rest of it.",
          "Scout gives you a clear workspace and an assistant that helps move qualified applications forward while you stay in control.",
        ],
        cta: { label: "See how Scout works", url: `${siteUrl()}/how-it-works` },
      };
    case 2:
      return {
        preview: "Tailored applications, visible tracking, and fewer repetitive tasks.",
        paragraphs: [
          "Scout starts with your real experience, target roles, locations, and preferences. That context travels with the work instead of making you start over on every application.",
          "You can see what is saved, being prepared, submitted, or needs your input. The goal is not blind volume. It is consistent, relevant work with a record you can inspect.",
        ],
        cta: { label: "Open your Scout dashboard", url: dashboard },
      };
    case 3:
      return {
        preview: "Choose the kind of help that fits your search.",
        paragraphs: [
          "Scout has two honest service lanes. The best fit depends on whether you value personal judgment or lower-cost automated throughput first.",
          ...(humanFirst ? [human, ai] : [ai, human]),
        ],
        cta: { label: "Compare both options", url: pricing },
      };
    case 4:
      return {
        preview: "Your job search can move without consuming every spare hour.",
        paragraphs: [
          "If applications keep slipping behind work, family, or the rest of life, Scout is ready when you are.",
          "Choose an AI plan for automated throughput or a Human Assistant campaign for hands-on service. Either way, you keep visibility into the work.",
        ],
        cta: { label: "Choose your Scout assistant", url: pricing },
      };
  }
}

export function launchEmailContent(input: LaunchEmailInput) {
  const mailingAddress = address();
  if (!mailingAddress) throw new Error("SCOUT_MAILING_ADDRESS is required before launch emails can be sent.");

  const firstName = input.firstName?.trim() || "there";
  const unsubscribe = `${siteUrl()}/email/unsubscribe?token=${encodeURIComponent(input.unsubscribeToken)}`;
  const oneClickUnsubscribe = `${siteUrl()}/api/email/unsubscribe?token=${encodeURIComponent(input.unsubscribeToken)}`;
  const body = content(input.emailNumber, input.preferredLane === "human");
  const greeting = `Hi ${firstName},`;
  const footerReason = "You're getting this because you signed up for one of our job search tools.";
  const signature = `Kate\nScout`;
  const text = `${greeting}\n\n${body.paragraphs.join("\n\n")}\n\n${body.cta.label}: ${body.cta.url}\n\n${signature}\n\n${footerReason}\nUnsubscribe: ${unsubscribe}\n${mailingAddress}`;
  const paragraphs = body.paragraphs.map((paragraph) => `<p style="margin:0 0 18px">${escapeHtml(paragraph)}</p>`).join("");
  const logo = `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td><img src="${siteUrl()}/scout-mark-512.png" width="32" height="32" alt="" style="display:block;border:0"></td><td style="padding-left:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:24px;font-weight:800;letter-spacing:-1px;color:#14210f">scout</td></tr></table>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f8ee;color:#14210f"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(body.preview)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8ee"><tr><td align="center" style="padding:28px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px"><tr><td style="padding:28px 32px 12px">${logo}</td></tr><tr><td style="padding:18px 32px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:16px;line-height:1.65"><p style="margin:0 0 18px">${escapeHtml(greeting)}</p>${paragraphs}<p style="margin:28px 0"><a href="${body.cta.url}" style="display:inline-block;border-radius:999px;background:#9dde47;padding:13px 22px;color:#10210d;font-weight:800;text-decoration:none">${escapeHtml(body.cta.label)}</a></p><p style="margin:22px 0 0">Kate<br>Scout</p></td></tr></table><div style="max-width:560px;padding:20px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#69735f;font-size:12px;line-height:1.6;text-align:center">${escapeHtml(footerReason)} <a href="${unsubscribe}" style="color:#3f7d17">Unsubscribe</a><br>${escapeHtml(mailingAddress)}</div></td></tr></table></body></html>`;
  return { subject: subjects[input.emailNumber], text, html, unsubscribe, oneClickUnsubscribe };
}

export async function sendLaunchEmail(input: LaunchEmailInput) {
  const message = launchEmailContent(input);
  return sendScoutEmail({
    to: input.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    idempotencyKey: `launch-sequence/${input.enrollmentId}/${input.emailNumber}`,
    headers: {
      "List-Unsubscribe": `<${message.oneClickUnsubscribe}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}
