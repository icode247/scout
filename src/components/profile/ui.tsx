/**
 * Small accessible form controls for the profile editor, drawn with Scout's Tailwind tokens.
 * Every control is controlled (value + onChange) and carries no `name`, so the profile form's
 * own submit never picks up stray fields; the editor posts one `applicant_profile` JSON instead.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

export const inputClass = (missing = false, extra = "") =>
  `w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-muted/70 focus:border-brand-600 focus:ring-2 focus:ring-brand-200 disabled:cursor-not-allowed disabled:bg-surface disabled:text-ink-muted ${missing ? "border-amber-400 ring-2 ring-amber-100" : "border-ink/15"} ${extra}`;

export const smallButton = (tone: "default" | "primary" | "danger" | "ghost" = "default") => ({
  default: "rounded-full border border-ink/15 bg-white px-3.5 py-2 text-xs font-bold text-ink hover:border-brand-600 disabled:cursor-not-allowed disabled:opacity-50",
  primary: "rounded-full bg-ink px-3.5 py-2 text-xs font-extrabold text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50",
  danger: "rounded-full px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50",
  ghost: "rounded-full px-3 py-2 text-xs font-bold text-brand-800 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50",
}[tone]);

interface FieldProps {
  label: ReactNode;
  /** Needed before Scout AI can apply. */
  required?: boolean;
  hint?: ReactNode;
  className?: string;
  children: (ids: { id: string; hintId?: string }) => ReactNode;
}

export function Field({ label, required, hint, className = "", children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="flex items-baseline gap-1.5 text-xs font-bold text-ink">
        <span>{label}</span>
        {required && <span className="text-amber-600" title="Needed before Scout AI can apply" aria-label="needed before Scout AI can apply">●</span>}
      </label>
      <div className="mt-1.5">{children({ id, hintId })}</div>
      {hint && <p id={hintId} className="mt-1 text-xs leading-relaxed text-ink-muted">{hint}</p>}
    </div>
  );
}

interface TextProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  missing?: boolean;
  hint?: ReactNode;
  placeholder?: string;
  type?: string;
  inputMode?: "text" | "numeric" | "decimal" | "email" | "tel" | "url";
  autoComplete?: string;
  className?: string;
  disabled?: boolean;
  maxLength?: number;
  rows?: number;
}

export function TextField({ label, value, onChange, required, missing, hint, placeholder, type = "text", inputMode, autoComplete, className, disabled, maxLength, rows }: TextProps) {
  return (
    <Field label={label} required={required} hint={hint} className={className}>
      {({ id, hintId }) => rows ? (
        <textarea id={id} aria-describedby={hintId} value={value} onChange={(e) => onChange(e.target.value)} rows={rows}
          placeholder={placeholder} disabled={disabled} maxLength={maxLength} aria-invalid={missing || undefined}
          className={inputClass(missing, "resize-y leading-relaxed")} />
      ) : (
        <input id={id} aria-describedby={hintId} value={value} onChange={(e) => onChange(e.target.value)} type={type}
          inputMode={inputMode} autoComplete={autoComplete} placeholder={placeholder} disabled={disabled} maxLength={maxLength}
          aria-invalid={missing || undefined} className={inputClass(missing)} />
      )}
    </Field>
  );
}

export interface Choice { value: string; label: string }
export const plainChoices = (values: readonly string[]): Choice[] => values.map((value) => ({ value, label: value }));

interface SelectProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  choices: readonly Choice[];
  required?: boolean;
  missing?: boolean;
  hint?: ReactNode;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SelectField({ label, value, onChange, choices, required, missing, hint, placeholder = "Select", className, disabled }: SelectProps) {
  // A stored value no longer on the list still shows, so nothing is silently dropped on view.
  const options = value && !choices.some((choice) => choice.value === value) ? [...choices, { value, label: value }] : choices;
  return (
    <Field label={label} required={required} hint={hint} className={className}>
      {({ id, hintId }) => (
        <select id={id} aria-describedby={hintId} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
          aria-invalid={missing || undefined} className={inputClass(missing, "pr-8")}>
          <option value="">{placeholder}</option>
          {options.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
        </select>
      )}
    </Field>
  );
}

interface PillsProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  choices: readonly Choice[];
  required?: boolean;
  missing?: boolean;
  hint?: ReactNode;
  className?: string;
  disabled?: boolean;
}

/** A short list of choices as one-tap pills (native radios, so keyboard and screen readers work). */
export function Pills({ label, value, onChange, choices, required, missing, hint, className = "", disabled }: PillsProps) {
  const groupId = useId();
  return (
    <div className={`min-w-0 ${className}`}>
      <p id={groupId} className="flex items-baseline gap-1.5 text-xs font-bold text-ink">
        <span>{label}</span>
        {required && <span className="text-amber-600" title="Needed before Scout AI can apply" aria-label="needed before Scout AI can apply">●</span>}
      </p>
      <div role="radiogroup" aria-labelledby={groupId} aria-invalid={missing || undefined}
        className={`mt-1.5 flex flex-wrap gap-2 rounded-xl ${missing ? "ring-2 ring-amber-100 ring-offset-2" : ""}`}>
        {choices.map((choice) => {
          const checked = value === choice.value;
          return (
            <label key={choice.value} className={`relative inline-flex min-h-10 cursor-pointer select-none items-center rounded-full border px-3.5 text-sm font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-300 ${checked ? "border-brand-700 bg-brand-700 text-white" : "border-ink/15 bg-white text-ink hover:border-brand-600"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}>
              <input type="radio" className="sr-only" checked={checked} disabled={disabled} onChange={() => onChange(choice.value)} />
              {checked && <span aria-hidden="true" className="mr-1.5">✓</span>}
              {choice.label}
            </label>
          );
        })}
      </div>
      {hint && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{hint}</p>}
    </div>
  );
}

/** `order` breaks ties between equally good matches (the main country of a shared dial code first). */
export interface ComboOption { value: string; label: string; keywords?: string[]; order?: number }

interface ComboboxProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly ComboOption[];
  placeholder?: string;
  disabled?: boolean;
  missing?: boolean;
  ariaLabel?: string;
  describedBy?: string;
  /** Clears itself after a pick (for "add another" pickers). */
  resetOnPick?: boolean;
}

const rank = (option: ComboOption, query: string) => {
  const label = option.label.toLowerCase();
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  if (label.split(/[\s(/-]+/).some((word) => word.startsWith(query))) return 2;
  if (option.keywords?.some((word) => word.toLowerCase().startsWith(query))) return 3;
  if (label.includes(query)) return 4;
  return -1;
};

/** Type to search a long list (countries, dial codes); arrow keys, Enter and Escape work as expected. */
export function Combobox({ id, value, onChange, options, placeholder = "Type to search", disabled, missing, ariaLabel, describedBy, resetOnPick }: ComboboxProps) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = options.find((option) => option.value === value);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 80);
    return options.map((option) => ({ option, score: rank(option, q) })).filter((item) => item.score >= 0)
      .sort((a, b) => a.score - b.score || (a.option.order ?? Infinity) - (b.option.order ?? Infinity) || a.option.label.localeCompare(b.option.label))
      .slice(0, 80).map((item) => item.option);
  }, [options, query]);
  useEffect(() => { setActive(0); }, [query, open]);
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  const pick = (option: ComboOption) => {
    onChange(option.value);
    setQuery("");
    setOpen(false);
  };
  const shown = open ? query : resetOnPick ? "" : selected?.label ?? value;
  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={missing || undefined}
        autoComplete="off"
        disabled={disabled}
        value={shown}
        placeholder={open && selected ? selected.label : placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter") { if (open && matches[active]) { e.preventDefault(); pick(matches[active]); } else if (open) e.preventDefault(); }
          else if (e.key === "Escape") { if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); setQuery(""); } }
        }}
        className={inputClass(missing, "pr-8")}
      />
      <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted">▾</span>
      {open && (
        <ul ref={listRef} id={listId} role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-ink/10 bg-white py-1 shadow-card">
          {matches.length ? matches.map((option, index) => (
            <li key={option.value} id={`${listId}-${index}`} data-index={index} role="option" aria-selected={option.value === value}
              onMouseDown={(e) => { e.preventDefault(); pick(option); }} onMouseEnter={() => setActive(index)}
              className={`cursor-pointer px-3 py-2 text-sm ${index === active ? "bg-brand-100" : ""} ${option.value === value ? "font-bold" : ""}`}>
              {option.label}
            </li>
          )) : <li className="px-3 py-2 text-sm text-ink-muted">No match. Check the spelling.</li>}
        </ul>
      )}
    </div>
  );
}

interface ChipsProps {
  label: ReactNode;
  values: string[];
  onChange: (values: string[]) => void;
  required?: boolean;
  missing?: boolean;
  hint?: ReactNode;
  placeholder?: string;
  max?: number;
}

/** Split a typed or pasted list on commas, semicolons, new lines and bullets. */
export function splitList(raw: string) {
  return raw.split(/[,;\n•·|]+/).map((item) => item.replace(/^[-*\s]+/, "").trim()).filter(Boolean);
}

/** A list of short answers as removable chips: type and press Enter or comma, or paste a whole list. */
export function ChipsField({ label, values, onChange, required, missing, hint, placeholder = "Type and press Enter", max = 100 }: ChipsProps) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const seen = new Set(values.map((item) => item.toLowerCase()));
    const next = [...values];
    for (const item of splitList(raw)) {
      const value = item.slice(0, 200);
      if (seen.has(value.toLowerCase()) || next.length >= max) continue;
      seen.add(value.toLowerCase());
      next.push(value);
    }
    if (next.length !== values.length) onChange(next);
    setDraft("");
  };
  return (
    <Field label={label} required={required} hint={hint}>
      {({ id, hintId }) => (
        <div className={`rounded-xl border bg-white p-2 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-200 ${missing ? "border-amber-400 ring-2 ring-amber-100" : "border-ink/15"}`}>
          {values.length > 0 && (
            <ul className="mb-1.5 flex flex-wrap gap-1.5">
              {values.map((item) => (
                <li key={item} className="inline-flex items-center gap-1 rounded-full bg-brand-100 py-1 pl-2.5 pr-1 text-xs font-bold text-brand-900">
                  {item}
                  <button type="button" aria-label={`Remove ${item}`} onClick={() => onChange(values.filter((value) => value !== item))}
                    className="grid h-5 w-5 place-items-center rounded-full text-brand-900 hover:bg-brand-200">×</button>
                </li>
              ))}
            </ul>
          )}
          <input id={id} aria-describedby={hintId} value={draft} placeholder={values.length ? "Add another" : placeholder}
            onChange={(e) => { const value = e.target.value; if (/[,;\n]/.test(value)) add(value); else setDraft(value); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) { e.preventDefault(); add(draft); }
              else if (e.key === "Enter") e.preventDefault();
              else if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
            }}
            onBlur={() => { if (draft.trim()) add(draft); }}
            className="w-full bg-transparent px-1 py-1 text-sm outline-none placeholder:text-ink-muted/70" />
        </div>
      )}
    </Field>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={`${id}-label`} aria-describedby={description ? `${id}-description` : undefined}
        disabled={disabled} onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-brand-700" : "bg-ink/20"}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
      <span>
        <span id={`${id}-label`} className="block text-sm font-bold text-ink">{label}</span>
        {description && <span id={`${id}-description`} className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{description}</span>}
      </span>
    </div>
  );
}

interface SectionProps {
  id: string;
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  /** Answers still needed before Scout AI can apply; 0 = complete; null = nothing required here. */
  missing: number | null;
  children: ReactNode;
}

export function Section({ id, title, subtitle, open, onToggle, missing, children }: SectionProps) {
  const bodyId = `profile-section-${id}`;
  return (
    <section id={`section-${id}`} className={`scroll-mt-40 rounded-2xl border bg-white ${missing ? "border-amber-200" : "border-ink/10"}`}>
      <h3>
        <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}
          className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 sm:px-5">
          <span className="min-w-0">
            <span className="block text-sm font-extrabold text-ink">{title}</span>
            <span className="mt-0.5 block text-xs font-normal text-ink-muted">{subtitle}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {missing === null ? <span className="rounded-full bg-surface px-2.5 py-1 text-[0.7rem] font-bold text-ink-muted">Optional</span>
              : missing === 0 ? <span className="rounded-full bg-signal-50 px-2.5 py-1 text-[0.7rem] font-bold text-signal-700">✓ Done</span>
              : <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[0.7rem] font-bold text-amber-800">{missing} to answer</span>}
            <span aria-hidden="true" className={`text-lg text-ink-muted transition ${open ? "rotate-180" : ""}`}>⌄</span>
          </span>
        </button>
      </h3>
      {open && <div id={bodyId} className="border-t border-ink/10 px-4 py-5 sm:px-5">{children}</div>}
    </section>
  );
}
