import { describe, expect, it } from "vitest";
import { OFFER, activeOffer, offerAppliesTo, offerEndsLabel, offerPrice, type Offer } from "./offer";
import { planByCode } from "./plans";

const offer: Offer = { code: "SCOUT30", percent: 30, name: "Black Friday offer", endsAt: "2026-12-01T07:59:59Z", timeZone: "America/Los_Angeles" };

describe("time-limited offer", () => {
  it("is advertised until its end and never after", () => {
    expect(activeOffer(new Date("2026-11-20T12:00:00Z"), offer)).toBe(offer);
    expect(activeOffer(new Date("2026-12-01T07:59:58Z"), offer)).toBe(offer);
    expect(activeOffer(new Date("2026-12-01T07:59:59Z"), offer)).toBeNull();
    expect(activeOffer(new Date("2027-01-01T00:00:00Z"), offer)).toBeNull();
  });

  it("is off when no offer is configured or its date is unreadable", () => {
    expect(activeOffer(new Date(), null)).toBeNull();
    expect(activeOffer(new Date(), { ...offer, endsAt: "soon" })).toBeNull();
  });

  it("covers monthly plans and leaves 90-day plans alone", () => {
    expect(offerAppliesTo(planByCode("ai_essential")!)).toBe(true);
    expect(offerAppliesTo(planByCode("human_full")!)).toBe(true);
    expect(offerAppliesTo(planByCode("ai_plus_90")!)).toBe(false);
    expect(offerPrice(planByCode("ai_plus_90")!, null, offer)).toBeNull();
  });

  it("prices the first payment exactly as the discount charges it", () => {
    expect(offerPrice(planByCode("ai_essential")!, null, offer)).toEqual({ firstPayment: "$27.30", saved: "$11.70" });
    expect(offerPrice(planByCode("ai_plus")!, null, offer)).toEqual({ firstPayment: "$55.30", saved: "$23.70" });
    expect(offerPrice(planByCode("human_full")!, null, offer)).toEqual({ firstPayment: "$349.30", saved: "$149.70" });
  });

  it("prices regional plans in the local currency", () => {
    expect(offerPrice(planByCode("ai_essential")!, "IN", offer)).toEqual({ firstPayment: "₹699.30", saved: "₹299.70" });
    expect(offerPrice(planByCode("ai_essential")!, "NG", offer)).toEqual({ firstPayment: "₦11,200", saved: "₦4,800" });
  });

  it("quotes the end date in the offer's time zone", () => {
    expect(offerEndsLabel(offer)).toBe("Monday, November 30");
  });

  it("ships a well-formed offer", () => {
    if (!OFFER) return;
    expect(Number.isFinite(new Date(OFFER.endsAt).getTime())).toBe(true);
    expect(OFFER.percent).toBeGreaterThan(0);
    expect(OFFER.percent).toBeLessThan(100);
  });
});
