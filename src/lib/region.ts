import { regionCode, type RegionCode } from "../config/plans";

/**
 * The visitor's pricing region, from Vercel's geo-IP header. Absent in local
 * dev (no header) and for countries without regional pricing — both mean USD.
 * Display-only: the charged amount is decided by Dodo from the billing
 * country at checkout, so a VPN can change the label but not the charge.
 */
export function visitorRegion(request: Request): RegionCode | null {
  return regionCode(request.headers.get("x-vercel-ip-country"));
}
