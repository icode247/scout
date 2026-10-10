/**
 * Repeating entries for the profile editor: experience, education, projects, references and
 * extra links. Dates are month + year selects (month-year.ts), so a date is always one FastApply
 * and the answer models can place on a timeline: "March 2021", a bare year, "Present", or blank.
 */
import type { ReactNode } from "react";
import { MONTHS, PRESENT, formatMonthYear, parseMonthYear, yearOptions } from "../../lib/month-year";
import type { EducationEntry, ExperienceEntry, LinkEntry, ProjectEntry, ReferenceEntry } from "./draft";
import { inputClass, smallButton } from "./ui";

const YEARS = yearOptions();
const DEGREES = ["High School Diploma", "Associate Degree", "Bachelor's Degree", "Master's Degree", "Doctorate/PhD", "Other"];

function MonthYearField({ label, value, onChange, allowPresent }: { label: string; value: string; onChange: (value: string) => void; allowPresent?: boolean }) {
  const parts = parseMonthYear(value);
  const present = Boolean(allowPresent && parts.present);
  const emit = (month: string, year: string) => {
    const isPresent = month === PRESENT;
    onChange(formatMonthYear({ month: isPresent ? "" : month, year: isPresent ? "" : year, present: isPresent }));
  };
  return (
    <div className="min-w-0" role="group" aria-label={label}>
      <span className="block text-xs font-bold text-ink">{label}</span>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <select aria-label={`${label} month`} value={present ? PRESENT : parts.month} onChange={(e) => emit(e.target.value, parts.year)} className={inputClass(false, "px-2")}>
          <option value="">Month</option>
          {allowPresent && <option value={PRESENT}>{PRESENT}</option>}
          {MONTHS.map((month) => <option key={month} value={month}>{month}</option>)}
        </select>
        <select aria-label={`${label} year`} value={present ? "" : parts.year} disabled={present} onChange={(e) => emit(parts.month, e.target.value)} className={inputClass(false, "px-2")}>
          <option value="">Year</option>
          {YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text", className = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; className?: string }) {
  return (
    <label className={`block min-w-0 text-xs font-bold text-ink ${className}`}>{label}
      <input value={value} type={type} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${inputClass(false)} mt-1.5`} />
    </label>
  );
}

function EntryCard({ title, onRemove, onUp, onDown, children }: { title: string; onRemove: () => void; onUp?: () => void; onDown?: () => void; children: ReactNode }) {
  return (
    <li className="rounded-xl border border-ink/10 bg-surface/50 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <strong className="min-w-0 truncate text-xs">{title}</strong>
        <span className="flex shrink-0 items-center gap-1">
          {onUp && <button type="button" className={smallButton("ghost")} onClick={onUp} aria-label={`Move ${title} up`}>↑</button>}
          {onDown && <button type="button" className={smallButton("ghost")} onClick={onDown} aria-label={`Move ${title} down`}>↓</button>}
          <button type="button" className={smallButton("danger")} onClick={onRemove}>Remove</button>
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </li>
  );
}

function useList<T>(items: T[], onChange: (items: T[]) => void) {
  return {
    update: (index: number, patch: Partial<T>) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item))),
    remove: (index: number) => onChange(items.filter((_, i) => i !== index)),
    move: (index: number, by: number) => {
      const target = index + by;
      if (target < 0 || target >= items.length) return;
      const next = [...items];
      [next[index], next[target]] = [next[target], next[index]];
      onChange(next);
    },
  };
}

const Empty = ({ children }: { children: ReactNode }) => <p className="rounded-xl bg-surface px-3 py-4 text-center text-xs text-ink-muted">{children}</p>;

export function ExperienceEditor({ items, onChange }: { items: ExperienceEntry[]; onChange: (items: ExperienceEntry[]) => void }) {
  const list = useList(items, onChange);
  return (
    <div>
      {items.length ? (
        <ul className="space-y-3">
          {items.map((item, index) => (
            <EntryCard key={index} title={[item.title, item.company].filter(Boolean).join(" · ") || `Role ${index + 1}`} onRemove={() => list.remove(index)}
              onUp={index > 0 ? () => list.move(index, -1) : undefined} onDown={index < items.length - 1 ? () => list.move(index, 1) : undefined}>
              <Input label="Job title" value={item.title} onChange={(title) => list.update(index, { title })} />
              <Input label="Company" value={item.company} onChange={(company) => list.update(index, { company })} />
              <Input label="Location" value={item.location} onChange={(location) => list.update(index, { location })} placeholder="City, country or Remote" className="sm:col-span-2" />
              <MonthYearField label="Start date" value={item.startDate} onChange={(startDate) => list.update(index, { startDate })} />
              <MonthYearField label="End date" value={item.endDate} onChange={(endDate) => list.update(index, { endDate })} allowPresent />
              <label className="block text-xs font-bold text-ink sm:col-span-2">What you did
                <textarea value={item.description} rows={4} onChange={(e) => list.update(index, { description: e.target.value })} className={`${inputClass(false, "resize-y leading-relaxed")} mt-1.5`} />
              </label>
            </EntryCard>
          ))}
        </ul>
      ) : <Empty>No roles yet. Your resume usually fills these in.</Empty>}
      <button type="button" className={`${smallButton()} mt-3`} onClick={() => onChange([...items, { title: "", company: "", location: "", startDate: "", endDate: "", description: "" }])}>+ Add a role</button>
    </div>
  );
}

export function EducationEditor({ items, onChange }: { items: EducationEntry[]; onChange: (items: EducationEntry[]) => void }) {
  const list = useList(items, onChange);
  return (
    <div>
      {items.length ? (
        <ul className="space-y-3">
          {items.map((item, index) => (
            <EntryCard key={index} title={[item.degree, item.school].filter(Boolean).join(" · ") || `Education ${index + 1}`} onRemove={() => list.remove(index)}
              onUp={index > 0 ? () => list.move(index, -1) : undefined} onDown={index < items.length - 1 ? () => list.move(index, 1) : undefined}>
              <Input label="School" value={item.school} onChange={(school) => list.update(index, { school })} className="sm:col-span-2" />
              <label className="block min-w-0 text-xs font-bold text-ink">Degree
                <select value={item.degree} onChange={(e) => list.update(index, { degree: e.target.value })} className={`${inputClass(false)} mt-1.5`}>
                  <option value="">Select</option>
                  {(item.degree && !DEGREES.includes(item.degree) ? [item.degree, ...DEGREES] : DEGREES).map((degree) => <option key={degree} value={degree}>{degree}</option>)}
                </select>
              </label>
              <Input label="Field of study" value={item.major} onChange={(major) => list.update(index, { major })} />
              <MonthYearField label="Start date" value={item.startDate} onChange={(startDate) => list.update(index, { startDate })} />
              <MonthYearField label="End date (or expected)" value={item.endDate} onChange={(endDate) => list.update(index, { endDate })} allowPresent />
              <Input label="GPA (optional)" value={item.gpa} onChange={(gpa) => list.update(index, { gpa })} />
              <Input label="Location" value={item.location} onChange={(location) => list.update(index, { location })} />
            </EntryCard>
          ))}
        </ul>
      ) : <Empty>No education yet.</Empty>}
      <button type="button" className={`${smallButton()} mt-3`} onClick={() => onChange([...items, { school: "", degree: "", major: "", gpa: "", startDate: "", endDate: "", location: "" }])}>+ Add education</button>
    </div>
  );
}

export function ProjectsEditor({ items, onChange }: { items: ProjectEntry[]; onChange: (items: ProjectEntry[]) => void }) {
  const list = useList(items, onChange);
  return (
    <div>
      {items.length ? (
        <ul className="space-y-3">
          {items.map((item, index) => (
            <EntryCard key={index} title={item.name || `Project ${index + 1}`} onRemove={() => list.remove(index)}>
              <Input label="Project name" value={item.name} onChange={(name) => list.update(index, { name })} />
              <Input label="Link (optional)" value={item.url} type="url" placeholder="https://" onChange={(url) => list.update(index, { url })} />
              <label className="block text-xs font-bold text-ink sm:col-span-2">Description
                <textarea value={item.description} rows={3} onChange={(e) => list.update(index, { description: e.target.value })} className={`${inputClass(false, "resize-y leading-relaxed")} mt-1.5`} />
              </label>
            </EntryCard>
          ))}
        </ul>
      ) : <Empty>No projects yet. Add one when a role asks for a portfolio.</Empty>}
      <button type="button" className={`${smallButton()} mt-3`} onClick={() => onChange([...items, { name: "", description: "", url: "" }])}>+ Add a project</button>
    </div>
  );
}

export function ReferencesEditor({ items, onChange }: { items: ReferenceEntry[]; onChange: (items: ReferenceEntry[]) => void }) {
  const list = useList(items, onChange);
  return (
    <div>
      {items.length ? (
        <ul className="space-y-3">
          {items.map((item, index) => (
            <EntryCard key={index} title={item.name || `Reference ${index + 1}`} onRemove={() => list.remove(index)}>
              <Input label="Name" value={item.name} onChange={(name) => list.update(index, { name })} />
              <label className="block min-w-0 text-xs font-bold text-ink">Relationship
                <select value={item.type} onChange={(e) => list.update(index, { type: e.target.value })} className={`${inputClass(false)} mt-1.5`}>
                  <option value="">Select</option>
                  {(item.type && !["Work", "Personal"].includes(item.type) ? [item.type, "Work", "Personal"] : ["Work", "Personal"]).map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <Input label="Email" type="email" value={item.email} onChange={(email) => list.update(index, { email })} />
              <Input label="Phone" type="tel" value={item.phone} onChange={(phone) => list.update(index, { phone })} />
            </EntryCard>
          ))}
        </ul>
      ) : <Empty>No references yet. They are only shared when an employer asks.</Empty>}
      <button type="button" className={`${smallButton()} mt-3`} onClick={() => onChange([...items, { name: "", email: "", phone: "", type: "" }])}>+ Add a reference</button>
    </div>
  );
}

export function LinksEditor({ items, onChange }: { items: LinkEntry[]; onChange: (items: LinkEntry[]) => void }) {
  const list = useList(items, onChange);
  return (
    <div>
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={index} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)_auto] items-end gap-2">
              <Input label="Label" value={item.label} placeholder="Dribbble" onChange={(label) => list.update(index, { label })} />
              <Input label="URL" type="url" value={item.url} placeholder="https://" onChange={(url) => list.update(index, { url })} />
              <button type="button" className={smallButton("danger")} onClick={() => list.remove(index)} aria-label={`Remove ${item.label || "link"}`}>×</button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={`${smallButton()} mt-3`} onClick={() => onChange([...items, { label: "", url: "" }])}>+ Add another link</button>
    </div>
  );
}
