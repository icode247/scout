import { describe, expect, it } from "vitest";
import { attentionReasons, summarizeWorkload, timeAgo } from "./ops-overview";

const NOW = Date.parse("2026-10-01T15:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW - hours * 3600000).toISOString();

describe("summarizeWorkload", () => {
  it("separates requested, waiting-on-client, and applied work", () => {
    const summary = summarizeWorkload([
      { status: "preparing", submitted_at: null },
      { status: "preparing", submitted_at: null },
      { status: "needs_input", submitted_at: null },
      { status: "evidence_ready", submitted_at: hoursAgo(2) },
      { status: "interview", submitted_at: hoursAgo(30) },
      { status: "evidence_ready", submitted_at: hoursAgo(24 * 9) },
      { status: "withdrawn", submitted_at: null },
    ], NOW);
    expect(summary).toEqual({ requested: 2, waitingOnClient: 1, appliedToday: 1, appliedWeek: 2, appliedTotal: 3, lastAppliedAt: hoursAgo(2) });
  });
});

describe("attentionReasons", () => {
  const healthy = { hasWhatsapp: true, hasBrief: true, applicationsLeft: 100, startedAt: hoursAgo(24 * 10) };

  it("is empty for a client who is set up and being worked", () => {
    expect(attentionReasons(summarizeWorkload([{ status: "evidence_ready", submitted_at: hoursAgo(3) }], NOW), healthy, NOW)).toEqual([]);
  });

  it("flags missing setup, open requests, and a stalled search", () => {
    const workload = summarizeWorkload([{ status: "preparing", submitted_at: null }, { status: "evidence_ready", submitted_at: hoursAgo(72) }], NOW);
    expect(attentionReasons(workload, { ...healthy, hasWhatsapp: false, hasBrief: false }, NOW)).toEqual([
      "WhatsApp group not set up", "No brief uploaded", "1 requested job to apply to", "Nothing applied in 2+ days",
    ]);
  });

  it("gives a new client two days before calling them stalled", () => {
    expect(attentionReasons(summarizeWorkload([], NOW), { ...healthy, startedAt: hoursAgo(20) }, NOW)).toEqual([]);
    expect(attentionReasons(summarizeWorkload([], NOW), { ...healthy, startedAt: hoursAgo(60) }, NOW)).toEqual(["No applications yet"]);
  });

  it("asks to tell the client when the plan is used up instead of calling them stalled", () => {
    const workload = summarizeWorkload([{ status: "evidence_ready", submitted_at: hoursAgo(100) }], NOW);
    expect(attentionReasons(workload, { ...healthy, applicationsLeft: 0 }, NOW)).toEqual(["Plan used up — tell the client"]);
  });
});

describe("timeAgo", () => {
  it("reads naturally", () => {
    expect(timeAgo(null, NOW)).toBe("Never");
    expect(timeAgo(hoursAgo(0.5), NOW)).toBe("30 min ago");
    expect(timeAgo(hoursAgo(5), NOW)).toBe("5 h ago");
    expect(timeAgo(hoursAgo(48), NOW)).toBe("2 days ago");
  });
});
