/**
 * Month/year dates for education and experience entries.
 *
 * These dates are read by the application service and by the models that answer
 * "when did you work there?" form questions, so free text ("Summer '19",
 * "on and off since uni") is worse than no date at all — it gets guessed at.
 * Every date is therefore stored in one shape:
 *
 *   "March 2021"  a month and a year
 *   "2014"        a year the resume stated without a month
 *   "Present"     an ongoing role or course (end dates only)
 *   ""            unknown
 *
 * Full English month names match what FastApply composes and what its
 * `parseLooseDate` (Date.parse plus a present/current/now check) understands.
 */

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const PRESENT = "Present";

/** Earliest year offered; nobody's work history predates it in practice. */
const MIN_YEAR = 1950;
/** Years ahead of today, so an expected graduation date can be entered. */
const FUTURE_YEARS = 8;

const MONTH_BY_NAME = new Map<string, string>();
for (const month of MONTHS) {
  MONTH_BY_NAME.set(month.toLowerCase(), month);
  MONTH_BY_NAME.set(month.slice(0, 3).toLowerCase(), month);
}
// "Sept" is common enough in resumes to be worth accepting alongside "Sep".
MONTH_BY_NAME.set("sept", "September");

const ONGOING = /^(present|current|currently|now|ongoing|to date|till date|to present|date)$/i;

export interface MonthYear {
  month: string;
  year: string;
  present: boolean;
}

const BLANK: MonthYear = { month: "", year: "", present: false };

function validYear(value: number, maxYear: number) {
  return Number.isInteger(value) && value >= MIN_YEAR && value <= maxYear;
}

/**
 * Read a stored or extracted date into its parts. Accepts the shapes resumes and
 * older Scout rows actually contain — "2021-03", "03/2021", "Mar 2021",
 * "March, 2021", "2014", "Present" — and returns blanks for anything else rather
 * than passing an unreadable date on to the model.
 */
export function parseMonthYear(value: unknown, referenceYear = new Date().getFullYear()): MonthYear {
  const raw = String(value ?? "").trim();
  if (!raw) return { ...BLANK };
  if (ONGOING.test(raw)) return { month: "", year: "", present: true };

  const maxYear = referenceYear + FUTURE_YEARS;
  const cleaned = raw.replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();

  // Year-first: 2021-03, 2021/03, 2021-03-15
  const yearFirst = cleaned.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
  if (yearFirst) {
    const year = Number(yearFirst[1]);
    const month = Number(yearFirst[2]);
    if (validYear(year, maxYear) && month >= 1 && month <= 12) {
      return { month: MONTHS[month - 1], year: String(year), present: false };
    }
  }

  // Month-first: 03/2021, 3-2021, and 03/15/2021 where the middle part is a day.
  const monthFirst = cleaned.match(/^(\d{1,2})[-/](?:\d{1,2}[-/])?(\d{4})$/);
  if (monthFirst) {
    const month = Number(monthFirst[1]);
    const year = Number(monthFirst[2]);
    if (validYear(year, maxYear) && month >= 1 && month <= 12) {
      return { month: MONTHS[month - 1], year: String(year), present: false };
    }
  }

  // Named month with a year somewhere alongside it: "March 2021", "2021 Mar".
  const named = cleaned.split(" ").reduce<string>((found, token) => found || MONTH_BY_NAME.get(token.toLowerCase()) || "", "");
  const years = cleaned.match(/\b(\d{4})\b/g) || [];
  const year = years.map(Number).find((candidate) => validYear(candidate, maxYear));
  if (named && year !== undefined) return { month: named, year: String(year), present: false };
  // A year on its own is legitimate — plenty of resumes date education by year only.
  if (year !== undefined && !named) return { month: "", year: String(year), present: false };

  return { ...BLANK };
}

/**
 * Compose the stored form. A month without a year is dropped: "March" alone
 * cannot be placed on a timeline, so it is treated as unknown.
 */
export function formatMonthYear(parts: Partial<MonthYear>): string {
  if (parts.present) return PRESENT;
  const year = String(parts.year || "").trim();
  if (!year) return "";
  const month = String(parts.month || "").trim();
  return month ? `${month} ${year}` : year;
}

/**
 * Canonicalize any incoming date to the stored form. `allowPresent` is false for
 * start dates, where "Present" is meaningless.
 */
export function normalizeMonthYear(value: unknown, allowPresent = true, referenceYear = new Date().getFullYear()): string {
  const parts = parseMonthYear(value, referenceYear);
  if (parts.present && !allowPresent) return "";
  return formatMonthYear(parts);
}

/** Selectable years, newest first. */
export function yearOptions(referenceYear = new Date().getFullYear()): string[] {
  const years: string[] = [];
  for (let year = referenceYear + FUTURE_YEARS; year >= MIN_YEAR; year--) years.push(String(year));
  return years;
}
