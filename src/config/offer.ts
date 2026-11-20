/**
 * The one time-limited offer the site advertises.
 *
 * Everything that mentions the offer (the pricing page bar, the countdown, the
 * discounted first-month prices, and the code sent to checkout) reads from
 * here, and `activeOffer` returns null once `endsAt` has passed, so the site
 * can never advertise a deadline that is not real. To run a new offer, change
 * the values below; to run none, set OFFER to null.
 *
 * The code must exist in Dodo with the same terms (`npm run dodo:scout30`
 * creates SCOUT30: 30% off the first billing cycle of the five monthly plans).
 */
import { REGIONS, type Plan, type RegionCode } from "./plans";

export interface Offer {
  /** Discount code as it exists in Dodo. */
  code: string;
  /** Percent off the first billing cycle. */
  percent: number;
  name: string;
  /** The instant the offer stops being advertised and applied (ISO, UTC). */
  endsAt: string;
  /** Time zone the public end date is quoted in. */
  timeZone: string;
}

export const OFFER: Offer | null = {
  code: "SCOUT30",
  percent: 30,
  name: "Black Friday offer",
  // 11:59 pm Pacific on Monday, November 30, 2026.
  endsAt: "2026-12-01T07:59:59Z",
  timeZone: "America/Los_Angeles",
};

/** The offer while it is still running, otherwise null. */
export function activeOffer(now: Date = new Date(), offer: Offer | null = OFFER): Offer | null {
  if (!offer) return null;
  const end = new Date(offer.endsAt).getTime();
  return Number.isFinite(end) && now.getTime() < end ? offer : null;
}

/** The offer covers monthly plans only; 90-day plans already carry their own discount. */
export function offerAppliesTo(plan: Plan): boolean {
  return plan.term === "standard" && plan.billing === "recurring";
}

/** "Monday, November 30" in the offer's own time zone. */
export function offerEndsLabel(offer: Offer): string {
  return new Date(offer.endsAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: offer.timeZone });
}

function money(symbol: string, locale: string, minor: number): string {
  const whole = minor % 100 === 0;
  return symbol + (minor / 100).toLocaleString(locale, { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

/**
 * What the first payment costs with the offer, and what it saves, in the
 * currency the visitor is shown. Null when the offer does not cover the plan.
 */
export function offerPrice(plan: Plan, region: RegionCode | null, offer: Offer): { firstPayment: string; saved: string } | null {
  if (!offerAppliesTo(plan)) return null;
  const full = region ? plan.regional[region] : plan.priceCents;
  const discount = Math.round((full * offer.percent) / 100);
  const symbol = region ? REGIONS[region].symbol : "$";
  const locale = region ? REGIONS[region].locale : "en-US";
  return { firstPayment: money(symbol, locale, full - discount), saved: money(symbol, locale, discount) };
}
