/**
 * Answer options shared by every form that writes an applicant profile — the
 * /profiles editor and the /intake questionnaire. FastApply matches these
 * strings against employer questions, so both forms must offer identical values.
 */
export interface Choice { value: string; label: string }

const plain = (...values: string[]): Choice[] => values.map((value) => ({ value, label: value }));

export const NOTICE_PERIODS = plain("Immediate", "2 weeks", "1 month", "2 months", "3 months", "More than 3 months");
export const WORK_AUTHORIZATIONS = plain(
  "Citizen", "Permanent Resident", "Work Visa / Work Permit", "Student Visa", "Dependent Visa",
  "Post-Study Work Visa", "Refugee/Asylee", "Temporary Protected Status (TPS)", "No work authorization yet",
);
export const YES_NO = plain("Yes", "No");
export const WORK_ARRANGEMENTS = plain("Remote", "Hybrid", "On-site", "Flexible");
export const GENDERS = plain("Male", "Female", "Non-binary", "Prefer not to say");
export const ETHNICITIES = plain("Hispanic or Latino", "Not Hispanic or Latino", "Prefer not to say");
export const RACES = plain(
  "White", "Black or African American", "Asian", "Native American or Alaska Native",
  "Native Hawaiian or Pacific Islander", "Two or More Races", "Prefer not to say",
);
export const VETERAN_STATUSES: Choice[] = [
  { value: "Yes", label: "Yes, I am a protected veteran" },
  { value: "No", label: "No, I am not a protected veteran" },
  { value: "Prefer not to say", label: "Prefer not to say" },
];
export const DISABILITY_STATUSES: Choice[] = [
  { value: "Yes", label: "Yes, I have a disability" },
  { value: "No", label: "No, I don't have a disability" },
  { value: "Prefer not to say", label: "Prefer not to say" },
];

export const CURRENCIES = [
  "USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CNY", "INR", "CHF", "SGD", "HKD", "NZD", "SEK", "NOK", "DKK", "ZAR", "BRL", "MXN", "AED", "SAR",
  "NGN", "KES", "PLN", "CZK", "ILS", "KRW", "TWD", "THB", "MYR", "PHP", "IDR", "VND", "PKR", "BDT", "EGP", "ARS", "CLP", "COP", "PEN",
];
export const TIMEZONES = [
  "America/New_York (EST)", "America/Chicago (CST)", "America/Denver (MST)", "America/Los_Angeles (PST)", "America/Anchorage (AKST)",
  "Pacific/Honolulu (HST)", "Europe/London (GMT)", "Europe/Paris (CET)", "Europe/Helsinki (EET)", "Asia/Dubai (GST)", "Asia/Kolkata (IST)",
  "Asia/Singapore (SGT)", "Asia/Tokyo (JST)", "Australia/Sydney (AEST)", "Pacific/Auckland (NZST)", "Pacific/Midway (SST)",
  "America/Sao_Paulo (BRT)", "America/Argentina/Buenos_Aires (ART)", "Africa/Lagos (WAT)", "Africa/Johannesburg (SAST)",
  "Africa/Nairobi (EAT)", "Europe/Moscow (MSK)", "Asia/Riyadh (AST)", "Asia/Tehran (IRST)", "Asia/Karachi (PKT)", "Asia/Kathmandu (NPT)",
  "Asia/Dhaka (BST)", "Asia/Yangon (MMT)", "Asia/Bangkok (ICT)", "Asia/Jakarta (WIB)", "Asia/Manila (PHT)", "Asia/Hong_Kong (HKT)",
  "Asia/Seoul (KST)", "Australia/Adelaide (ACST)",
];
