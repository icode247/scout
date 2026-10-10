/**
 * Work authorization by country (FastApply's editor, ported). One row per country the member may
 * work in: the country, the basis (citizen, permanent resident, a visa…), and for a visa its type,
 * expiry and whether sponsorship will be needed now or later. A country NOT listed is one they
 * would need sponsorship for, so "none anywhere" saves [] rather than leaving the list unset.
 *
 * `value === null` means the list was never set up. The editor then shows the row suggested by
 * the earlier single answer (the same rule FastApply's answer routes apply meanwhile), clearly
 * marked; any edit adopts it, and "Looks right" adopts it unchanged.
 *
 * A row the member adds starts without a basis of its own: when its country is one of their
 * citizenships it becomes "Citizen", otherwise a work visa whose sponsorship question must be
 * answered, so picking a country alone never claims citizenship (FastApply's editor defaults to
 * "Citizen"; Scout applies unattended, so a wrong default would go out on applications).
 */
import { useMemo, useState } from "react";
import {
  PERMANENT_WORK_AUTH_STATUSES,
  VISA_TYPE_OTHER,
  WORK_AUTH_STATUS_LABELS,
  WORK_AUTH_STATUS_VALUES,
  WORK_AUTHORIZATION_VISA_TYPE_MAX_LENGTH,
  listedVisaTypesFor,
  suggestWorkAuthorizations,
  type LegacyWorkAuthFields,
  type WorkAuthStatus,
  type WorkAuthorizationDraft,
} from "../../lib/profile-values";
import { COUNTRY_OPTIONS } from "./PersonalFields";
import { Combobox, inputClass, smallButton } from "./ui";

const isPermanent = (status: WorkAuthStatus) => PERMANENT_WORK_AUTH_STATUSES.includes(status);
const blankRow = (): WorkAuthorizationDraft => ({ country: "", status: "citizen", visaType: null, expiresAt: null, needsSponsorship: false });

interface Props {
  value: WorkAuthorizationDraft[] | null;
  onChange: (next: WorkAuthorizationDraft[] | null) => void;
  legacy: LegacyWorkAuthFields;
  missing?: boolean;
}

export default function WorkAuthorizationsEditor({ value, onChange, legacy, missing }: Props) {
  const suggestion = useMemo(() => (value === null ? suggestWorkAuthorizations(legacy) : null), [value, legacy]);
  const suggested = value === null;
  const rows: readonly WorkAuthorizationDraft[] = value ?? suggestion?.rows ?? [];
  const isUnset = (row: WorkAuthorizationDraft) => row.needsSponsorship === null && !isPermanent(row.status);
  const hasUnset = rows.some(isUnset);
  const [acceptAttempted, setAcceptAttempted] = useState(false);
  const [otherVisaRows, setOtherVisaRows] = useState<ReadonlySet<number>>(new Set());
  // Rows added here whose country has not been picked yet (by index; reset when a row is removed).
  const [freshRows, setFreshRows] = useState<ReadonlySet<number>>(new Set());
  const citizenOf = (country: string) => (legacy.citizenships || []).some((item) => item.toLowerCase() === country.toLowerCase());

  const commit = (next: WorkAuthorizationDraft[]) => onChange(next);
  const update = (index: number, patch: Partial<WorkAuthorizationDraft>) =>
    commit(rows.map((row, i) => {
      if (i !== index) return { ...row };
      const merged = { ...row, ...patch };
      if (patch.country && freshRows.has(index)) {
        merged.status = citizenOf(patch.country) ? "citizen" : "work_visa";
        merged.needsSponsorship = merged.status === "citizen" ? false : null;
      }
      if (isPermanent(merged.status)) { merged.needsSponsorship = false; merged.visaType = null; merged.expiresAt = null; }
      // Moving a row off a permanent status asks the sponsorship question afresh.
      else if (patch.status && isPermanent(row.status)) merged.needsSponsorship = null;
      return merged;
    }));
  const setOtherVisa = (index: number, on: boolean) => setOtherVisaRows((previous) => {
    if (previous.has(index) === on) return previous;
    const next = new Set(previous);
    if (on) next.add(index); else next.delete(index);
    return next;
  });
  const placeCountry = (index: number, country: string) => {
    update(index, { country });
    if (country && freshRows.has(index)) setFreshRows((previous) => { const next = new Set(previous); next.delete(index); return next; });
  };
  const remove = (index: number) => { setOtherVisaRows(new Set()); setFreshRows(new Set()); commit(rows.filter((_, i) => i !== index).map((row) => ({ ...row }))); };
  const add = () => { setFreshRows((previous) => new Set([...previous, rows.length])); commit([...rows.map((row) => ({ ...row })), blankRow()]); };
  const taken = (except: number) => rows.filter((_, i) => i !== except).map((row) => row.country.toLowerCase()).filter(Boolean);

  return (
    <div>
      {suggested && rows.length > 0 && (
        <div role="status" className="mb-3 rounded-xl border border-brand-300 bg-brand-100/60 p-3">
          <p className="text-xs leading-relaxed text-ink">
            <strong>Suggested from your earlier answer.</strong> Not saved until you save the profile. Edit anything that is wrong, or confirm it as it is.
            {hasUnset && " Answer the sponsorship question below first."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={smallButton("primary")} onClick={() => { if (hasUnset) { setAcceptAttempted(true); return; } commit(rows.map((row) => ({ ...row }))); }}>Looks right</button>
            <button type="button" className={smallButton()} onClick={() => { setOtherVisaRows(new Set()); setFreshRows(new Set([0])); commit([blankRow()]); }}>Start from scratch</button>
          </div>
        </div>
      )}
      {suggested && rows.length === 0 && (
        <p className={`mb-3 rounded-xl p-3 text-xs leading-relaxed ${missing ? "bg-amber-50 text-amber-900" : "bg-surface text-ink-soft"}`}>
          {suggestion?.legacySaysNone
            ? "Your earlier answer says you have no work authorization yet. Confirm that below, or add a country where you may work."
            : "Add every country where you are allowed to work, and on what basis. A country you leave out is one you would need sponsorship for."}
        </p>
      )}
      {value !== null && value.length === 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 bg-surface p-3">
          <span className="text-sm text-ink-soft">No work authorization in any country.</span>
          <button type="button" className={smallButton()} onClick={add}>Actually, add a country</button>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((row, index) => {
            const permanent = isPermanent(row.status);
            const where = row.country || "this country";
            const unset = isUnset(row);
            const visaType = row.visaType ?? "";
            const listed = listedVisaTypesFor(row.country);
            const visaOther = otherVisaRows.has(index) || (visaType !== "" && !listed.includes(visaType));
            return (
              <li key={index} className="rounded-xl border border-ink/10 bg-surface/50 p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                  <label className="min-w-0 text-xs font-bold text-ink">Country
                    <div className="mt-1.5">
                      <Combobox value={row.country} onChange={(country) => placeCountry(index, country)} ariaLabel={`Country for work authorization ${index + 1}`}
                        options={COUNTRY_OPTIONS.filter((option) => option.value === row.country || !taken(index).includes(option.value.toLowerCase()))}
                        placeholder="Search countries" missing={missing && !row.country} />
                    </div>
                  </label>
                  <label className="min-w-0 text-xs font-bold text-ink">Basis
                    <select value={row.status} onChange={(e) => update(index, { status: e.target.value as WorkAuthStatus })} aria-label={`Status in ${where}`} className={`${inputClass(false)} mt-1.5`}>
                      {WORK_AUTH_STATUS_VALUES.map((status) => <option key={status} value={status}>{WORK_AUTH_STATUS_LABELS[status]}</option>)}
                    </select>
                  </label>
                </div>
                {!row.country && <p className={`mt-2 text-xs ${missing ? "font-bold text-amber-800" : "text-ink-muted"}`}>Pick the country, or remove this row. A row without one is not saved.</p>}
                {row.status === "citizen" && row.country && (legacy.citizenships || []).length > 0 && !citizenOf(row.country) && (
                  <p className="mt-2 text-xs font-bold text-amber-800">{row.country} is not one of the citizenships above. Check the basis.</p>
                )}
                {!permanent && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                    <label className="min-w-0 text-xs font-bold text-ink">Visa type <span className="font-normal text-ink-muted">(optional)</span>
                      <select aria-label={`Visa type in ${where}`} value={visaOther ? VISA_TYPE_OTHER : visaType} className={`${inputClass(false)} mt-1.5`}
                        onChange={(e) => {
                          const picked = e.target.value;
                          if (picked === VISA_TYPE_OTHER) { setOtherVisa(index, true); if (!visaOther) update(index, { visaType: null }); return; }
                          setOtherVisa(index, false);
                          update(index, { visaType: picked || null });
                        }}>
                        <option value="">Select a visa type</option>
                        {listed.map((type) => <option key={type} value={type}>{type}</option>)}
                        <option value={VISA_TYPE_OTHER}>Other (type it)</option>
                      </select>
                      {visaOther && (
                        <input aria-label={`Other visa type in ${where}`} value={visaType} maxLength={WORK_AUTHORIZATION_VISA_TYPE_MAX_LENGTH}
                          onChange={(e) => update(index, { visaType: e.target.value })} placeholder="The visa or permit name" className={`${inputClass(false)} mt-2`} />
                      )}
                    </label>
                    <label className="min-w-0 text-xs font-bold text-ink">Expires <span className="font-normal text-ink-muted">(optional)</span>
                      <input type="date" aria-label={`Expiry date in ${where}`} value={row.expiresAt ?? ""} onChange={(e) => update(index, { expiresAt: e.target.value || null })} className={`${inputClass(false)} mt-1.5`} />
                    </label>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  {permanent ? (
                    <span className="text-xs text-ink-muted">No sponsorship needed: citizens and permanent residents never require it.</span>
                  ) : unset ? (
                    <div>
                      <div role="group" aria-label={`Needs sponsorship in ${where}?`} className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">Will you need sponsorship here, now or in the future?</span>
                        <button type="button" className={smallButton()} onClick={() => update(index, { needsSponsorship: true })}>Yes</button>
                        <button type="button" className={smallButton()} onClick={() => update(index, { needsSponsorship: false })}>No</button>
                      </div>
                      {(!suggested || acceptAttempted) && <p role="alert" className="mt-1 text-xs font-bold text-red-700">Choose Yes or No</p>}
                    </div>
                  ) : (
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
                      <input type="checkbox" checked={row.needsSponsorship === true} onChange={(e) => update(index, { needsSponsorship: e.target.checked })} className="h-4 w-4 accent-brand-700" />
                      I will need sponsorship here, now or in the future
                    </label>
                  )}
                  <button type="button" className={smallButton("danger")} aria-label={`Remove ${where === "this country" ? "this row" : where}`} onClick={() => remove(index)}>Remove</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={smallButton()} onClick={add} disabled={rows.some((row) => !row.country)}>+ Add a country</button>
        {!(value !== null && value.length === 0) && (
          <button type="button" className={smallButton("ghost")} onClick={() => onChange([])}>I have no work authorization in any country</button>
        )}
      </div>
    </div>
  );
}
