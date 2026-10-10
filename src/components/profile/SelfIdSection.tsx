/**
 * Self-identification answers (lib/privacy.ts), behind the member's explicit choice. Nothing is
 * pre-selected. "Use my answers" opens the eleven questions; "I'd rather not share" answers them
 * all "Prefer not to say"; withdrawing a saved "Use my answers" asks for confirmation first.
 */
import { useState } from "react";
import {
  CRIMINAL_RECORD_VALUES,
  DISABILITY_STATUS_VALUES,
  ETHNICITY_VALUES,
  GENDER_SAME_AS_BIRTH_SEX_VALUES,
  GENDER_VALUES,
  MARITAL_STATUS_VALUES,
  PRONOUNS_MAX_LENGTH,
  PRONOUN_SUGGESTIONS,
  RACE_VALUES,
  RELIGION_VALUES,
  SELF_DESCRIBE_MAX_LENGTH,
  SEXUAL_ORIENTATION_VALUES,
  VETERAN_STATUS_VALUES,
} from "../../lib/profile-values";
import {
  SELF_ID_CONSENT_BODY,
  SELF_ID_CONSENT_DECLINE_LABEL,
  SELF_ID_CONSENT_GRANT_LABEL,
  SELF_ID_CONSENT_HEADING,
  SELF_ID_DECLINE_VALUE,
} from "../../lib/privacy";
import type { ApplicantDraft, ConsentChoice } from "./draft";
import { Field, Pills, SelectField, inputClass, plainChoices, smallButton } from "./ui";

type SelfIdKey = "gender" | "genderSameAsBirthSex" | "sexualOrientation" | "pronouns" | "ethnicity" | "race" | "religion" | "disabilityStatus" | "veteranStatus" | "maritalStatus" | "criminalRecord";

interface Props {
  draft: ApplicantDraft;
  /** The decision saved on the profile; a saved "granted" is what a decline withdraws. */
  storedConsent: ConsentChoice;
  onConsent: (choice: ConsentChoice) => void;
  onAnswer: (key: SelfIdKey, value: string) => void;
  showMissing: boolean;
  required: boolean;
}

/** A list plus "Prefer to self-describe", which opens a short text box (orientation, religion). */
function SelfDescribe({ label, values, value, onChange, disabled, missing, required }: { label: string; values: readonly string[]; value: string; onChange: (v: string) => void; disabled: boolean; missing: boolean; required: boolean }) {
  const [describing, setDescribing] = useState(() => !!value && !values.includes(value));
  return (
    <Field label={label} required={required}>
      {({ id }) => (
        <div>
          <select id={id} disabled={disabled} value={describing && !disabled ? "__describe__" : value} aria-invalid={missing || undefined} className={inputClass(missing)}
            onChange={(e) => {
              if (e.target.value === "__describe__") { setDescribing(true); if (values.includes(value)) onChange(""); return; }
              setDescribing(false);
              onChange(e.target.value);
            }}>
            <option value="">Select</option>
            {values.map((item) => <option key={item} value={item}>{item}</option>)}
            <option value="__describe__">Prefer to self-describe</option>
          </select>
          {describing && !disabled && (
            <input aria-label={`${label}, in your own words`} value={value} maxLength={SELF_DESCRIBE_MAX_LENGTH} onChange={(e) => onChange(e.target.value)}
              placeholder="In your own words" className={`${inputClass(false)} mt-2`} />
          )}
        </div>
      )}
    </Field>
  );
}

function PronounsInput({ value, onChange, disabled, missing, required }: { value: string; onChange: (v: string) => void; disabled: boolean; missing: boolean; required: boolean }) {
  const suggested = (PRONOUN_SUGGESTIONS as readonly string[]).includes(value);
  const [other, setOther] = useState(() => !!value && !suggested);
  return (
    <Field label="Pronouns" required={required}>
      {({ id }) => (
        <div>
          <select id={id} disabled={disabled} value={other && !disabled ? "__other__" : value} aria-invalid={missing || undefined} className={inputClass(missing)}
            onChange={(e) => {
              if (e.target.value === "__other__") { setOther(true); if (suggested) onChange(""); return; }
              setOther(false);
              onChange(e.target.value);
            }}>
            <option value="">Select</option>
            {PRONOUN_SUGGESTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            <option value="__other__">Other (type your own)</option>
          </select>
          {other && !disabled && <input aria-label="Your pronouns" value={value} maxLength={PRONOUNS_MAX_LENGTH} onChange={(e) => onChange(e.target.value)} placeholder="e.g. Ze/Zir" className={`${inputClass(false)} mt-2`} />}
        </div>
      )}
    </Field>
  );
}

const ANSWER_KEYS: readonly SelfIdKey[] = [
  "gender", "genderSameAsBirthSex", "sexualOrientation", "pronouns", "ethnicity", "race", "religion",
  "disabilityStatus", "veteranStatus", "maritalStatus", "criminalRecord",
];

export default function SelfIdSection({ draft, storedConsent, onConsent, onAnswer, showMissing, required }: Props) {
  const [confirming, setConfirming] = useState(false);
  const choice = draft.sensitiveDataConsent;
  // Answers given before Scout asked for this choice stay on the profile, and in use, until the
  // member decides (as FastApply does for its own users); say so rather than hide them.
  const answersOnFile = choice === "" && ANSWER_KEYS.some((key) => draft[key].trim() !== "");
  const locked = choice !== "granted";
  const miss = (key: SelfIdKey) => showMissing && choice === "granted" && !draft[key];
  const answerRequired = required && choice === "granted";
  const choose = (next: ConsentChoice) => {
    // Declining over a saved grant clears saved answers: confirm first.
    if (next === "declined" && storedConsent === "granted" && choice === "granted") { setConfirming(true); return; }
    setConfirming(false);
    onConsent(next);
  };
  const card = (value: ConsentChoice, title: string, body: string) => (
    <label className={`flex min-h-24 cursor-pointer flex-col rounded-xl border-2 p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-300 ${choice === value ? "border-brand-700 bg-brand-100/60" : "border-ink/10 bg-white hover:border-brand-500"}`}>
      <span className="flex items-center gap-2">
        <input type="radio" name="self-id-consent" checked={choice === value} onChange={() => choose(value)} className="h-4 w-4 accent-brand-700" />
        <strong className="text-sm">{title}</strong>
      </span>
      <span className="mt-1 pl-6 text-xs leading-relaxed text-ink-soft">{body}</span>
    </label>
  );

  return (
    <div>
      <div className={`rounded-xl border p-4 ${showMissing && !choice ? "border-amber-400 bg-amber-50/60" : "border-brand-300 bg-brand-100/40"}`} role="group" aria-labelledby="self-id-heading">
        <p id="self-id-heading" className="flex items-baseline gap-1.5 text-sm font-extrabold">{SELF_ID_CONSENT_HEADING}{required && <span className="text-amber-600" aria-label="needed before Scout AI can apply">●</span>}</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">{SELF_ID_CONSENT_BODY} <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-bold underline">Privacy Policy</a></p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {card("granted", SELF_ID_CONSENT_GRANT_LABEL, "Answer the questions below. “Prefer not to say” stays available on each one.")}
          {card("declined", SELF_ID_CONSENT_DECLINE_LABEL, "Every one of these questions is answered “Prefer not to say”.")}
        </div>
        {confirming && (
          <div role="alertdialog" aria-label="Withdraw your self-identification answers" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-white p-3">
            <span className="text-sm">This sets every self-identification answer to “Prefer not to say”. Withdraw?</span>
            <button type="button" className={smallButton("danger")} onClick={() => { setConfirming(false); onConsent("declined"); }}>Withdraw</button>
            <button type="button" className={smallButton()} onClick={() => setConfirming(false)}>Keep my answers</button>
          </div>
        )}
        {answersOnFile && (
          <p className="mt-3 rounded-lg bg-white p-2.5 text-xs leading-relaxed text-ink">
            Your profile already holds some of these answers, from before Scout asked for this choice. They are used as before until you choose:
            “{SELF_ID_CONSENT_GRANT_LABEL}” shows them so you can check them, and “{SELF_ID_CONSENT_DECLINE_LABEL}” replaces them all with “{SELF_ID_DECLINE_VALUE}”.
          </p>
        )}
        <p className="mt-2 text-xs text-ink-muted">Either choice lets Scout AI apply.{choice === "" ? " The questions open once you choose “Use my answers”." : ""}</p>
      </div>

      {choice !== "" && (
        <div className={`mt-4 grid gap-4 sm:grid-cols-2 ${locked ? "opacity-60" : ""}`} aria-disabled={locked}>
          {locked && <p className="text-xs text-ink-soft sm:col-span-2">All set to “{SELF_ID_DECLINE_VALUE}”. Choose “{SELF_ID_CONSENT_GRANT_LABEL}” above to answer them yourself.</p>}
          <SelectField label="Gender" value={locked ? SELF_ID_DECLINE_VALUE : draft.gender} onChange={(v) => onAnswer("gender", v)} choices={plainChoices(GENDER_VALUES)} disabled={locked} missing={miss("gender")} required={answerRequired} />
          <Pills label="Is your gender the same as the sex you were registered at birth?" value={locked ? SELF_ID_DECLINE_VALUE : draft.genderSameAsBirthSex} onChange={(v) => onAnswer("genderSameAsBirthSex", v)}
            choices={plainChoices(GENDER_SAME_AS_BIRTH_SEX_VALUES)} disabled={locked} missing={miss("genderSameAsBirthSex")} required={answerRequired} />
          <SelfDescribe label="Sexual orientation" values={SEXUAL_ORIENTATION_VALUES} value={locked ? SELF_ID_DECLINE_VALUE : draft.sexualOrientation} onChange={(v) => onAnswer("sexualOrientation", v)} disabled={locked} missing={miss("sexualOrientation")} required={answerRequired} />
          <PronounsInput value={locked ? SELF_ID_DECLINE_VALUE : draft.pronouns} onChange={(v) => onAnswer("pronouns", v)} disabled={locked} missing={miss("pronouns")} required={answerRequired} />
          <SelectField label="Are you Hispanic or Latino?" value={locked ? SELF_ID_DECLINE_VALUE : draft.ethnicity} onChange={(v) => onAnswer("ethnicity", v)} choices={plainChoices(ETHNICITY_VALUES)} disabled={locked} missing={miss("ethnicity")} required={answerRequired} />
          <SelectField label="Race" value={locked ? SELF_ID_DECLINE_VALUE : draft.race} onChange={(v) => onAnswer("race", v)} choices={plainChoices(RACE_VALUES)} disabled={locked} missing={miss("race")} required={answerRequired} />
          <SelfDescribe label="Religion or belief" values={RELIGION_VALUES} value={locked ? SELF_ID_DECLINE_VALUE : draft.religion} onChange={(v) => onAnswer("religion", v)} disabled={locked} missing={miss("religion")} required={answerRequired} />
          <SelectField label="Disability status" value={locked ? SELF_ID_DECLINE_VALUE : draft.disabilityStatus} onChange={(v) => onAnswer("disabilityStatus", v)} choices={plainChoices(DISABILITY_STATUS_VALUES)} disabled={locked} missing={miss("disabilityStatus")} required={answerRequired} />
          <SelectField label="Veteran status" value={locked ? SELF_ID_DECLINE_VALUE : draft.veteranStatus} onChange={(v) => onAnswer("veteranStatus", v)} choices={plainChoices(VETERAN_STATUS_VALUES)} disabled={locked} missing={miss("veteranStatus")} required={answerRequired} />
          <SelectField label="Criminal convictions" value={locked ? SELF_ID_DECLINE_VALUE : draft.criminalRecord} onChange={(v) => onAnswer("criminalRecord", v)} choices={plainChoices(CRIMINAL_RECORD_VALUES)} disabled={locked} missing={miss("criminalRecord")} required={answerRequired}
            hint="Used only when a form asks." />
          <SelectField label="Marital status" value={locked ? SELF_ID_DECLINE_VALUE : draft.maritalStatus} onChange={(v) => onAnswer("maritalStatus", v)} choices={plainChoices(MARITAL_STATUS_VALUES)} disabled={locked} hint="Optional." />
        </div>
      )}
    </div>
  );
}
