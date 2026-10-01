/**
 * Pure summaries behind the operations screens, kept out of the pages so the
 * "needs attention" rules are tested and identical for admins and agents.
 */
export interface ApplicationActivity { status: string; submitted_at: string | null }

export interface ClientWorkload {
  /** Jobs the client sent that nobody has applied to yet. */
  requested: number;
  /** Jobs paused until the client answers a question. */
  waitingOnClient: number;
  appliedToday: number;
  appliedWeek: number;
  appliedTotal: number;
  lastAppliedAt: string | null;
}

const DAY = 86400000;
const OPEN = new Set(["preparing"]);
const APPLIED = new Set(["submitted", "evidence_ready", "interview", "rejected"]);

export function summarizeWorkload(applications: ApplicationActivity[], now = Date.now()): ClientWorkload {
  const startOfToday = new Date(now); startOfToday.setUTCHours(0, 0, 0, 0);
  const summary: ClientWorkload = { requested: 0, waitingOnClient: 0, appliedToday: 0, appliedWeek: 0, appliedTotal: 0, lastAppliedAt: null };
  for (const application of applications) {
    if (OPEN.has(application.status)) summary.requested += 1;
    else if (application.status === "needs_input") summary.waitingOnClient += 1;
    else if (APPLIED.has(application.status) && application.submitted_at) {
      const at = new Date(application.submitted_at).getTime();
      summary.appliedTotal += 1;
      if (at >= startOfToday.getTime()) summary.appliedToday += 1;
      if (now - at < 7 * DAY) summary.appliedWeek += 1;
      if (!summary.lastAppliedAt || at > new Date(summary.lastAppliedAt).getTime()) summary.lastAppliedAt = application.submitted_at;
    }
  }
  return summary;
}

export interface ClientState {
  hasWhatsapp: boolean;
  hasBrief: boolean;
  applicationsLeft: number;
  /** When the client paid; a brand-new client is not "stalled" yet. */
  startedAt: string | null;
}

/** Plain-language reasons a client needs someone's attention, most urgent first. */
export function attentionReasons(workload: ClientWorkload, state: ClientState, now = Date.now()): string[] {
  const reasons: string[] = [];
  if (!state.hasWhatsapp) reasons.push("WhatsApp group not set up");
  if (!state.hasBrief) reasons.push("No brief uploaded");
  if (workload.requested > 0) reasons.push(`${workload.requested} requested job${workload.requested === 1 ? "" : "s"} to apply to`);
  if (state.applicationsLeft === 0) reasons.push("Plan used up — tell the client");
  else {
    const since = workload.lastAppliedAt ?? state.startedAt;
    if (since && now - new Date(since).getTime() > 2 * DAY) reasons.push(workload.lastAppliedAt ? "Nothing applied in 2+ days" : "No applications yet");
  }
  return reasons;
}

export function timeAgo(value: string | null, now = Date.now()) {
  if (!value) return "Never";
  const minutes = Math.round((now - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
