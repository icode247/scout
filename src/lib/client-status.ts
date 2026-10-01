/**
 * How an application status reads to the client. The raw values are operations
 * vocabulary ("evidence_ready", "needs_input"); clients get plain language.
 */
export interface ClientStatus { label: string; tone: "progress" | "action" | "done" | "good" | "closed" }

const STATUSES: Record<string, ClientStatus> = {
  preparing: { label: "Your assistant is on it", tone: "progress" },
  needs_input: { label: "Waiting for you", tone: "action" },
  submitted: { label: "Applied", tone: "done" },
  evidence_ready: { label: "Applied · proof saved", tone: "done" },
  interview: { label: "Interview", tone: "good" },
  rejected: { label: "Not selected", tone: "closed" },
  withdrawn: { label: "Not applied", tone: "closed" },
};

export function clientStatus(status: string): ClientStatus {
  return STATUSES[status] ?? { label: status.replaceAll("_", " "), tone: "progress" };
}

export const STATUS_TONE_CLASS: Record<ClientStatus["tone"], string> = {
  progress: "bg-surface text-ink-soft",
  action: "bg-human-50 text-human-700",
  done: "bg-signal-50 text-signal-700",
  good: "bg-brand-200 text-brand-900",
  closed: "bg-surface text-ink-muted",
};

/** Notes the system writes on its own; they are not messages from the assistant. */
const SYSTEM_NOTES = new Set(["Added from your Scout dashboard.", "Added from the Scout browser extension.", "Queued by Scout AI.", "Ingested from Scout AI automation history."]);
export function assistantNote(notes: string | null | undefined): string | null {
  const clean = notes?.trim();
  return clean && !SYSTEM_NOTES.has(clean) ? clean : null;
}
