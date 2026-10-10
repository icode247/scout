/**
 * Country, citizenship, phone, date-of-birth and timezone controls for the profile editor.
 * Countries come from the table FastApply itself uses (country-table.ts), so the stored names
 * and phone ids are the ones its forms and answer routes match against.
 */
import { useEffect, useMemo, useState } from "react";
import { COUNTRY_ROWS } from "../../lib/country-table";
import { TIMEZONES } from "../../lib/applicant-options";
import { MAX_CITIZENSHIPS, normalizeCountryName, DATE_OF_BIRTH_MAX_AGE, DATE_OF_BIRTH_MIN_AGE, isoDateOfBirth } from "../../lib/profile-values";
import { MONTHS } from "../../lib/month-year";
import { Combobox, Field, inputClass, smallButton, type ComboOption } from "./ui";

const BY_NAME = [...COUNTRY_ROWS].sort((a, b) => a.name.localeCompare(b.name, "en"));
export const COUNTRY_OPTIONS: ComboOption[] = BY_NAME.map((row) => ({ value: row.name, label: row.name, keywords: [row.id] }));
// Typing "+44" lists the United Kingdom before Guernsey: FastApply's table puts a shared code's main country first.
const TABLE_ORDER = new Map(COUNTRY_ROWS.map((row, index) => [row.id, index]));
const DIAL_OPTIONS: ComboOption[] = BY_NAME.map((row) => ({ value: row.id, label: `${row.name} (${row.dial})`, keywords: [row.dial, row.dial.slice(1), row.id], order: TABLE_ORDER.get(row.id) }));

/** A stored country that is not on the table still shows (and stays) as it was typed. */
const withCurrent = (options: ComboOption[], value: string) =>
  value && !options.some((option) => option.value === value) ? [{ value, label: value }, ...options] : options;

interface CountryFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  missing?: boolean;
  hint?: string;
  exclude?: string[];
  disabled?: boolean;
  className?: string;
}

export function CountryField({ label, value, onChange, required, missing, hint, exclude, disabled, className }: CountryFieldProps) {
  const options = useMemo(() => {
    const skip = new Set((exclude || []).map((name) => name.toLowerCase()));
    return withCurrent(COUNTRY_OPTIONS.filter((option) => option.value === value || !skip.has(option.value.toLowerCase())), value);
  }, [exclude, value]);
  return (
    <Field label={label} required={required} hint={hint} className={className}>
      {({ id, hintId }) => (
        <Combobox id={id} describedBy={hintId} value={value} onChange={onChange} options={options} placeholder="Search countries" missing={missing} disabled={disabled} />
      )}
    </Field>
  );
}

interface CitizenshipsProps {
  value: string[];
  onChange: (value: string[]) => void;
  required?: boolean;
  missing?: boolean;
}

/** One or more citizenships as chips; the first is what a single "Nationality" box gets. */
export function CitizenshipsField({ value, onChange, required, missing }: CitizenshipsProps) {
  const options = useMemo(() => {
    const chosen = new Set(value.map((country) => country.toLowerCase()));
    return COUNTRY_OPTIONS.filter((option) => !chosen.has(option.value.toLowerCase()));
  }, [value]);
  const full = value.length >= MAX_CITIZENSHIPS;
  const add = (raw: string) => {
    const country = normalizeCountryName(raw);
    if (!country || full || value.some((item) => item.toLowerCase() === country.toLowerCase())) return;
    onChange([...value, country]);
  };
  return (
    <Field label="Citizenship" required={required}
      hint={value.length > 1 ? "Dual citizen? Add every country. The first one fills a single “Nationality” box." : "Add every country you are a citizen of."}>
      {({ id, hintId }) => (
        <div>
          {value.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {value.map((country, index) => (
                <li key={country} className="inline-flex items-center gap-1 rounded-full bg-brand-100 py-1 pl-2.5 pr-1 text-xs font-bold text-brand-900">
                  {country}{index === 0 && value.length > 1 && <span className="ml-1 text-[0.6rem] uppercase tracking-wide text-brand-700">primary</span>}
                  <button type="button" aria-label={`Remove ${country}`} onClick={() => onChange(value.filter((item) => item !== country))}
                    className="grid h-5 w-5 place-items-center rounded-full hover:bg-brand-200">×</button>
                </li>
              ))}
            </ul>
          )}
          <Combobox id={id} describedBy={hintId} value="" onChange={add} options={options} resetOnPick disabled={full}
            placeholder={full ? `Up to ${MAX_CITIZENSHIPS} countries` : value.length ? "Add another country" : "Search countries"}
            missing={missing && value.length === 0} ariaLabel={value.length ? "Add another citizenship" : undefined} />
        </div>
      )}
    </Field>
  );
}

interface PhoneProps {
  code: string;
  number: string;
  onCode: (id: string) => void;
  onNumber: (value: string) => void;
  codeMissing?: boolean;
  numberMissing?: boolean;
  required?: boolean;
}

export function PhoneField({ code, number, onCode, onNumber, codeMissing, numberMissing, required }: PhoneProps) {
  return (
    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Field label="Phone country code" required={required} hint="Search by country or code, e.g. +44">
        {({ id, hintId }) => <Combobox id={id} describedBy={hintId} value={code} onChange={onCode} options={DIAL_OPTIONS} placeholder="Search country or +code" missing={codeMissing} />}
      </Field>
      <Field label="Phone number" required={required} hint="Without the country code">
        {({ id, hintId }) => (
          <input id={id} aria-describedby={hintId} value={number} onChange={(e) => onNumber(e.target.value)} type="tel" inputMode="tel"
            autoComplete="tel-national" placeholder="7700 900123" aria-invalid={numberMissing || undefined} className={inputClass(numberMissing)} />
        )}
      </Field>
    </div>
  );
}

const pad = (value: number) => String(value).padStart(2, "0");

/** Day, month and year as three selects: quicker than a calendar picker for a birth date. */
export function DateOfBirthField({ value, onChange, required, missing }: { value: string; onChange: (value: string) => void; required?: boolean; missing?: boolean }) {
  const [year, month, day] = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").map(Number) : [0, 0, 0];
  const [parts, setParts] = useState<{ day: number; month: number; year: number }>({ day, month, year });
  // Keep local parts in step when the stored date changes from outside (a profile loads).
  const shown = value && (parts.day !== day || parts.month !== month || parts.year !== year) && year ? { day, month, year } : parts;
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: DATE_OF_BIRTH_MAX_AGE - DATE_OF_BIRTH_MIN_AGE + 1 }, (_, i) => thisYear - DATE_OF_BIRTH_MIN_AGE - i);
  const daysIn = shown.year && shown.month ? new Date(Date.UTC(shown.year, shown.month, 0)).getUTCDate() : 31;
  const update = (patch: Partial<typeof parts>) => {
    const next = { ...shown, ...patch };
    if (next.day > (next.year && next.month ? new Date(Date.UTC(next.year, next.month, 0)).getUTCDate() : 31)) next.day = 0;
    setParts(next);
    onChange(next.day && next.month && next.year ? `${next.year}-${pad(next.month)}-${pad(next.day)}` : "");
  };
  const invalid = Boolean(value) && !isoDateOfBirth(value);
  return (
    <Field label="Date of birth" required={required} hint={invalid ? `Employers' forms accept an age between ${DATE_OF_BIRTH_MIN_AGE} and ${DATE_OF_BIRTH_MAX_AGE}.` : "Only used when a form asks for it."}>
      {({ id, hintId }) => (
        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-2" role="group" aria-describedby={hintId}>
          <select id={id} aria-label="Day of birth" value={shown.day || ""} onChange={(e) => update({ day: Number(e.target.value) })} className={inputClass(missing || invalid, "px-2")}>
            <option value="">Day</option>
            {Array.from({ length: daysIn }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select aria-label="Month of birth" value={shown.month || ""} onChange={(e) => update({ month: Number(e.target.value) })} className={inputClass(missing || invalid, "px-2")}>
            <option value="">Month</option>
            {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
          </select>
          <select aria-label="Year of birth" value={shown.year || ""} onChange={(e) => update({ year: Number(e.target.value) })} className={inputClass(missing || invalid, "px-2")}>
            <option value="">Year</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}
    </Field>
  );
}

/** Minutes east of UTC for an IANA zone right now, or null when the browser does not know it. */
function offsetMinutes(zone: string, at = new Date()): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
    return Math.round((local - Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), at.getUTCHours(), at.getUTCMinutes())) / 60000);
  } catch {
    return null;
  }
}

/** The list entry for this browser's timezone: the same zone, else one with the same offset now. */
export function suggestTimezone(browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string | undefined {
  const exact = TIMEZONES.find((entry) => entry.split(" ")[0] === browserZone);
  if (exact) return exact;
  const offset = offsetMinutes(browserZone);
  if (offset === null) return undefined;
  return TIMEZONES.find((entry) => offsetMinutes(entry.split(" ")[0]) === offset);
}

export function TimezoneField({ value, onChange, required, missing }: { value: string; onChange: (value: string) => void; required?: boolean; missing?: boolean }) {
  // The browser's own zone, worked out after hydration: the server's zone (UTC on Vercel) would
  // render a different suggestion and break hydration.
  const [suggestion, setSuggestion] = useState<string | undefined>();
  useEffect(() => { setSuggestion(value ? undefined : suggestTimezone()); }, [value]);
  const choices = value && !TIMEZONES.includes(value) ? [value, ...TIMEZONES] : TIMEZONES;
  return (
    <Field label="Timezone" required={required}>
      {({ id }) => (
        <div>
          <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={missing || undefined} className={inputClass(missing)}>
            <option value="">Select timezone</option>
            {choices.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
          </select>
          {suggestion && <button type="button" onClick={() => onChange(suggestion)} className={`${smallButton("ghost")} mt-1.5`}>Use my timezone: {suggestion}</button>}
        </div>
      )}
    </Field>
  );
}
