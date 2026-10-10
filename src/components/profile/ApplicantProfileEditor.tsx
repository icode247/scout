/**
 * The job profile's application answers: everything employers' forms ask that a resume does not
 * reliably carry, in the field names and canonical values FastApply validates. A React island
 * inside the /profiles dialog.
 *
 * Contract with the dialog (pages/profiles.astro), all on the `[data-applicant-editor]` host:
 *   - `scout:set-applicant-profile` { profile, profileId, media, assistantType, targetRoles, salaryMin, hasResume, focusMissing }
 *     replaces what is shown (a bare answers object is accepted too);
 *   - `scout:fill-applicant-profile` { profile, onFilled } fills blanks only, from a resume;
 *   - `scout:resume-state` { hasResume } follows the dialog's resume list;
 *   - events sent before this island hydrates wait in `host.__scoutQueue`; `data-ready` says it is listening;
 *   - on the form's `formdata`, the answers go out as one `applicant_profile` JSON field;
 *   - a saved photo or video change is announced as `scout:media-changed` { profileId, media }, so the
 *     page shows it the next time that profile opens.
 *
 * Completeness is checked live with the same gate Scout AI runs before it starts
 * (agent-profile-gate.ts on the payload Scout sends), so "ready" here means ready there.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { fastApplyProfilePayload, holdsClearance } from "../../lib/applicant-payload";
import { cleanApplicantProfile } from "../../lib/applicant-profile";
import { CURRENCIES } from "../../lib/applicant-options";
import { REQUIRED_SECTIONS, checkAgentProfileGate } from "../../lib/agent-profile-gate";
import {
  countryRowByName,
  NOTICE_PERIOD_VALUES,
  REMOTE_PREFERENCE_VALUES,
  SECURITY_CLEARANCE_VALUES,
  WILLING_TO_TRAVEL_VALUES,
  YES_NO_VALUES,
} from "../../lib/profile-values";
import type { ProfileMediaView } from "../../lib/profile-media-rules";
import { PROFILE_LINK_FIELDS, profileLinkError } from "../../lib/profile-links";
import { draftFromProfile, emptyDraft, fillBlanks, profileFromDraft, type ApplicantDraft, type ConsentChoice } from "./draft";
import { CitizenshipsField, CountryField, DateOfBirthField, PhoneField, TimezoneField } from "./PersonalFields";
import WorkAuthorizationsEditor from "./WorkAuthorizationsEditor";
import LanguagesEditor from "./LanguagesEditor";
import { EducationEditor, ExperienceEditor, LinksEditor, ProjectsEditor, ReferencesEditor } from "./HistoryEditors";
import SelfIdSection from "./SelfIdSection";
import { PhotoCard, VideoCard } from "./MediaCards";
import { ChipsField, Field, Pills, Section, SelectField, TextField, inputClass, plainChoices, smallButton } from "./ui";

type SectionId = "personal" | "eligibility" | "languages" | "professional" | "history" | "preferences" | "links" | "media" | "selfid";

/** Which gate keys each editor section answers; sections without any are optional. */
const SECTION_KEYS: Record<SectionId, string[]> = {
  personal: ["firstName", "lastName", "email", "phoneCountryCode", "phoneNumber", "country", "currentCity", "state", "streetAddress", "zipcode", "timezone", "dateOfBirth"],
  eligibility: ["citizenships", "workAuthorizations", "securityClearance", "securityClearanceCountry"],
  languages: ["languages", "languageProficiencies"],
  professional: ["headline", "summary", "yearsOfExperience", "skills"],
  history: ["experience", "education"],
  preferences: ["desiredSalary", "desiredSalaryCurrency", "currentSalary", "currentSalaryCurrency", "noticePeriod", "remotePreference", "willingToRelocate", "willingToTravel", "driversLicense", "backgroundCheckConsent", "drugTestConsent"],
  links: [],
  media: [],
  selfid: ["sensitiveDataConsent", "gender", "genderSameAsBirthSex", "sexualOrientation", "pronouns", "ethnicity", "race", "religion", "disabilityStatus", "veteranStatus", "criminalRecord"],
};
const SECTION_ORDER: SectionId[] = ["personal", "eligibility", "languages", "professional", "history", "preferences", "links", "media", "selfid"];
const SECTION_TITLES: Record<SectionId, string> = {
  personal: "Personal and contact", eligibility: "Citizenship and work rights", languages: "Languages",
  professional: "Professional profile", history: "Experience, education and projects", preferences: "Work preferences",
  links: "Links and references", media: "Photo and video", selfid: "Self-identification",
};

const EMPTY_MEDIA: ProfileMediaView = { photo: null, video: null };
const YES_NO = plainChoices(YES_NO_VALUES);
const CURRENCY_CHOICES = plainChoices(CURRENCIES);

interface Loaded {
  profileId: string | null;
  media: ProfileMediaView;
  assistantType: "ai" | "human";
  targetRoles: string[];
  salaryMin: number | null;
  hasResume: boolean;
  storedConsent: ConsentChoice;
}

type Host = HTMLElement & { __scoutQueue?: [string, any][] };

/**
 * The activation gate on the payload Scout would send, with the same inputs the server uses (the
 * profile's target roles and minimum salary, and whether it has a resume), plus one editor-only
 * gap: a work-authorization row without a country, which is not saved until it has one.
 */
function gateFor(draft: ApplicantDraft, context: Pick<Loaded, "targetRoles" | "salaryMin" | "hasResume">) {
  const payload = fastApplyProfilePayload({ email: draft.email } as User,
    { applicant_profile: cleanApplicantProfile(profileFromDraft(draft)), target_roles: context.targetRoles, salary_min: context.salaryMin }, null);
  const result = checkAgentProfileGate(payload, context.hasResume);
  const missingKeys = new Set(result.incompleteSections.flatMap((section) => section.missingKeys));
  if (draft.workAuthorizations?.some((row) => !row.country.trim())) missingKeys.add("workAuthorizations");
  return { payload, result, missingKeys };
}

export default function ApplicantProfileEditor({ demo = false }: { demo?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<ApplicantDraft>(emptyDraft);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [loaded, setLoaded] = useState<Loaded>({ profileId: null, media: EMPTY_MEDIA, assistantType: "ai", targetRoles: [], salaryMin: null, hasResume: true, storedConsent: "" });
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState<Set<SectionId>>(() => new Set(["personal"]));
  const [showMissing, setShowMissing] = useState(false);

  const set = useCallback(<K extends keyof ApplicantDraft>(key: K, value: ApplicantDraft[K]) => setDraft((current) => ({ ...current, [key]: value })), []);

  const gate = useMemo(() => {
    const { payload, result, missingKeys } = gateFor(draft, loaded);
    // Every gate field that applies, plus the resume.
    const total = REQUIRED_SECTIONS.reduce((sum, section) => sum + section.fields.filter((field) => !field.skipIf?.(payload)).length, 0) + 1;
    return { result, total, missingKeys, payload };
  }, [draft, loaded.targetRoles, loaded.salaryMin, loaded.hasResume]);

  const isAi = loaded.assistantType === "ai";
  const missing = (key: string) => showMissing && gate.missingKeys.has(key);
  const sectionMissing = (id: SectionId) => (SECTION_KEYS[id].length ? SECTION_KEYS[id].filter((key) => gate.missingKeys.has(key)).length : null);
  const firstIncomplete = () => SECTION_ORDER.find((id) => (sectionMissing(id) ?? 0) > 0);

  // ---- the contract with the dialog
  useEffect(() => {
    const host = rootRef.current?.closest<Host>("[data-applicant-editor]");
    if (!host) return;
    const apply = (type: string, detail: any) => {
      if (type === "scout:set-applicant-profile") {
        const wrapped = detail && typeof detail === "object" && "profile" in detail;
        const profile = (wrapped ? detail.profile : detail) || {};
        const next = draftFromProfile(profile);
        const context: Loaded = {
          profileId: wrapped && typeof detail.profileId === "string" ? detail.profileId : null,
          media: (wrapped && detail.media) || EMPTY_MEDIA,
          assistantType: wrapped && detail.assistantType === "human" ? "human" : "ai",
          targetRoles: wrapped && Array.isArray(detail.targetRoles) ? detail.targetRoles : [],
          salaryMin: wrapped && typeof detail.salaryMin === "number" ? detail.salaryMin : null,
          hasResume: !(wrapped && detail.hasResume === false),
          storedConsent: next.sensitiveDataConsent,
        };
        // The ref moves now, not at the next render: a fill queued behind this event (replayed in the
        // same tick after hydration) must fill THIS profile's blanks, not the empty initial draft.
        draftRef.current = next;
        setDraft(next);
        setLoaded(context);
        const focus = Boolean(wrapped && detail.focusMissing);
        setShowMissing(focus);
        // A different profile: the sections remount, so no field keeps another profile's half-typed state.
        setVersion((v) => v + 1);
        // Opened from Scout AI's "Complete profile": every section with a gap, already marked.
        if (focus) {
          const { missingKeys } = gateFor(next, context);
          const gaps = SECTION_ORDER.filter((id) => SECTION_KEYS[id].some((key) => missingKeys.has(key)));
          setOpen(new Set(gaps.length ? gaps : ["personal"]));
        } else {
          setOpen(new Set(["personal"]));
        }
      } else if (type === "scout:fill-applicant-profile") {
        const profile = detail?.profile ?? detail ?? {};
        const result = fillBlanks(draftRef.current, draftFromProfile(profile));
        draftRef.current = result.draft;
        // Same profile, so nothing remounts: half-typed text, a date being picked and an upload in
        // progress all stay as they are.
        setDraft(result.draft);
        detail?.onFilled?.(result.filled);
      } else if (type === "scout:resume-state") {
        setLoaded((current) => ({ ...current, hasResume: detail?.hasResume !== false }));
      }
    };
    const onSet = (event: Event) => apply("scout:set-applicant-profile", (event as CustomEvent).detail);
    const onFill = (event: Event) => apply("scout:fill-applicant-profile", (event as CustomEvent).detail);
    const onResume = (event: Event) => apply("scout:resume-state", (event as CustomEvent).detail);
    host.addEventListener("scout:set-applicant-profile", onSet);
    host.addEventListener("scout:fill-applicant-profile", onFill);
    host.addEventListener("scout:resume-state", onResume);
    const queued = host.__scoutQueue || [];
    host.__scoutQueue = [];
    for (const [type, detail] of queued) apply(type, detail);
    host.dataset.ready = "true";
    // Started late (a slow connection): the page may already have said it could not load.
    host.querySelector("[data-editor-fallback]")?.classList.add("hidden");

    const form = host.closest("form");
    const onFormData = (event: FormDataEvent) => event.formData.set("applicant_profile", JSON.stringify(profileFromDraft(draftRef.current)));
    form?.addEventListener("formdata", onFormData);
    return () => {
      host.removeEventListener("scout:set-applicant-profile", onSet);
      host.removeEventListener("scout:fill-applicant-profile", onFill);
      host.removeEventListener("scout:resume-state", onResume);
      form?.removeEventListener("formdata", onFormData);
      delete host.dataset.ready;
    };
  }, []);

  // A saved photo or video change: the page keeps it for the next time this profile opens, and an
  // upload that finishes after another profile was opened changes only its own profile.
  const onMedia = useCallback((media: ProfileMediaView, forProfile: string) => {
    rootRef.current?.closest("[data-applicant-editor]")?.dispatchEvent(new CustomEvent("scout:media-changed", { detail: { profileId: forProfile, media } }));
    setLoaded((current) => (current.profileId === forProfile ? { ...current, media } : current));
  }, []);

  const toggle = (id: SectionId) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const showGaps = () => {
    const gaps = SECTION_ORDER.filter((id) => (sectionMissing(id) ?? 0) > 0);
    setShowMissing(true);
    setOpen((current) => new Set([...current, ...gaps]));
    const first = firstIncomplete();
    if (first) requestAnimationFrame(() => rootRef.current?.querySelector(`#section-${first}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const jump = (id: SectionId) => {
    setOpen((current) => new Set([...current, id]));
    setShowMissing(true);
    requestAnimationFrame(() => rootRef.current?.querySelector(`#section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const missingCount = gate.missingKeys.size;
  const done = Math.max(0, gate.total - missingCount);
  const share = gate.total ? done / gate.total : 0;
  const gapSections = SECTION_ORDER.filter((id) => (sectionMissing(id) ?? 0) > 0);
  const resumeMissing = gate.missingKeys.has("resume");
  const showResumeStep = () => document.querySelector("[data-profile-step=resume]")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const linkError = (key: keyof typeof PROFILE_LINK_FIELDS) => profileLinkError(PROFILE_LINK_FIELDS[key], draft[key]);
  const linkHint = (key: keyof typeof PROFILE_LINK_FIELDS) => {
    const error = linkError(key);
    return error ? <span className="font-bold text-red-700">{error}</span> : undefined;
  };
  const section = (id: SectionId, subtitle: string, children: ReactNode) => (
    <Section key={id} id={id} title={SECTION_TITLES[id]} subtitle={subtitle} open={open.has(id)} onToggle={() => toggle(id)} missing={sectionMissing(id)}>{children}</Section>
  );
  const req = isAi;

  return (
    <div ref={rootRef} className="min-w-0 space-y-3">
      {/* Full-bleed sticky band: the negative offsets cancel the dialog form's padding (1.25rem on a phone,
          global.css; p-7 from sm up), so nothing scrolls visibly above or beside it. */}
      <div className="sticky -top-5 z-20 -mx-5 border-b border-ink/10 bg-white px-5 pb-3 pt-4 sm:-top-7 sm:-mx-7 sm:px-7" aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-extrabold">
              {missingCount === 0 ? (isAi ? "Ready for Scout AI" : "Every answer employers usually ask is here")
                : isAi ? `${missingCount} ${missingCount === 1 ? "answer" : "answers"} left before Scout AI can apply` : `${missingCount} common ${missingCount === 1 ? "question is" : "questions are"} still blank`}
            </p>
            <p className="mt-0.5 hidden text-xs text-ink-muted sm:block">{isAi ? "Partial answers save fine. Scout AI starts once every marked answer is in." : "Your assistant can fill gaps, but every answer here saves them asking you."}</p>
          </div>
          {missingCount > 0 && <button type="button" className={`${smallButton("primary")} shrink-0`} onClick={showGaps}>Show what's missing</button>}
        </div>
        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-label="Profile completeness" aria-valuemin={0} aria-valuemax={gate.total} aria-valuenow={done}>
          <div className={`h-full rounded-full transition-all ${missingCount ? "bg-amber-400" : "bg-signal-500"}`} style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
        {showMissing && (gapSections.length > 0 || resumeMissing) && (
          <div className="-mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {resumeMissing && (
              <button type="button" onClick={showResumeStep} className="shrink-0 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100">Resume · 1</button>
            )}
            {gapSections.map((id) => (
              <button key={id} type="button" onClick={() => jump(id)} className="shrink-0 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100">
                {SECTION_TITLES[id]} · {sectionMissing(id)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div key={version} className="space-y-3">
        {section("personal", "Name, contact details and address", (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="First name" value={draft.firstName} onChange={(v) => set("firstName", v)} required={req} missing={missing("firstName")} autoComplete="given-name" />
            <TextField label="Last name" value={draft.lastName} onChange={(v) => set("lastName", v)} required={req} missing={missing("lastName")} autoComplete="family-name" />
            <TextField label="Middle name" value={draft.middleName} onChange={(v) => set("middleName", v)} hint="Leave blank if you have none." autoComplete="additional-name" />
            <TextField label="Email" type="email" inputMode="email" value={draft.email} onChange={(v) => set("email", v)} required={req} missing={missing("email")} autoComplete="email" hint="Employers reply here." />
            <PhoneField code={draft.phoneCountryCode} number={draft.phoneNumber} onCode={(v) => set("phoneCountryCode", v)} onNumber={(v) => set("phoneNumber", v)} required={req} codeMissing={missing("phoneCountryCode")} numberMissing={missing("phoneNumber")} />
            <DateOfBirthField value={draft.dateOfBirth} onChange={(v) => set("dateOfBirth", v)} required={req} missing={missing("dateOfBirth")} />
            <TimezoneField value={draft.timezone} onChange={(v) => set("timezone", v)} required={req} missing={missing("timezone")} />
            <CountryField label="Country of residence" value={draft.country} required={req} missing={missing("country")} className="sm:col-span-2"
              // A blank phone country code follows the country of residence (the usual case).
              onChange={(v) => setDraft((current) => ({ ...current, country: v, phoneCountryCode: current.phoneCountryCode || countryRowByName(v)?.id || "" }))} />
            <TextField label="Street address" value={draft.streetAddress} onChange={(v) => set("streetAddress", v)} required={req} missing={missing("streetAddress")} autoComplete="street-address" className="sm:col-span-2" />
            <TextField label="City" value={draft.currentCity} onChange={(v) => set("currentCity", v)} required={req} missing={missing("currentCity")} autoComplete="address-level2" />
            <TextField label="State / region" value={draft.state} onChange={(v) => set("state", v)} required={req} missing={missing("state")} autoComplete="address-level1" />
            <TextField label="Postal code" value={draft.zipcode} onChange={(v) => set("zipcode", v)} required={req} missing={missing("zipcode")} autoComplete="postal-code" />
          </div>
        ))}

        {section("eligibility", "Where you can work, and on what basis", (
          <div className="space-y-5">
            <CitizenshipsField value={draft.citizenships} onChange={(v) => set("citizenships", v)} required={req} missing={missing("citizenships")} />
            <Field label="Work authorization by country" required={req} hint="One row for each country where you may work. Forms ask about the job's country, and Scout answers from this list.">
              {() => (
                <WorkAuthorizationsEditor value={draft.workAuthorizations} onChange={(v) => set("workAuthorizations", v)} missing={missing("workAuthorizations")}
                  legacy={{ workAuthorization: draft.workAuthorization, requiresSponsorship: draft.requiresSponsorship, citizenships: draft.citizenships, country: draft.country }} />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Security clearance" value={draft.securityClearance} onChange={(v) => set("securityClearance", v)} choices={plainChoices(SECURITY_CLEARANCE_VALUES)}
                required={req} missing={missing("securityClearance")} hint="Most people choose “None”." />
              {holdsClearance(draft.securityClearance) && (
                <CountryField label="Clearance issued by" value={draft.securityClearanceCountry} onChange={(v) => set("securityClearanceCountry", v)} required={req} missing={missing("securityClearanceCountry")} />
              )}
            </div>
          </div>
        ))}

        {section("languages", "The languages you could work in, and how well", (
          <Field label="Languages" required={req} hint="Forms ask “How well do you speak…?”; each level answers that.">
            {() => <LanguagesEditor rows={draft.languages} onChange={(v) => set("languages", v)} missing={missing("languages")} levelsMissing={missing("languageProficiencies")} />}
          </Field>
        ))}

        {section("professional", "How you introduce yourself", (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Professional headline" value={draft.headline} onChange={(v) => set("headline", v)} required={req} missing={missing("headline")} placeholder="Senior Backend Engineer" className="sm:col-span-2" />
            <TextField label="Professional summary" value={draft.summary} onChange={(v) => set("summary", v)} required={req} missing={missing("summary")} rows={4} maxLength={10_000}
              hint={`${draft.summary.trim().length} characters. Two to four sentences works best.`} className="sm:col-span-2" />
            <TextField label="Years of experience" value={draft.yearsOfExperience} onChange={(v) => set("yearsOfExperience", v.replace(/[^0-9]/g, "").slice(0, 2))} inputMode="numeric" required={req} missing={missing("yearsOfExperience")} placeholder="0" />
            <div className="sm:col-span-2"><ChipsField label="Skills" values={draft.skills} onChange={(v) => set("skills", v)} required={req} missing={missing("skills")} hint="Paste a list or add one at a time." /></div>
            <div className="sm:col-span-2"><ChipsField label="Certifications" values={draft.certifications} onChange={(v) => set("certifications", v)} placeholder="AWS Solutions Architect, PMP…" /></div>
            <TextField label="Default cover letter" value={draft.coverLetter} onChange={(v) => set("coverLetter", v)} rows={5} maxLength={10_000} hint="Optional. Scout adapts it for each job." className="sm:col-span-2" />
          </div>
        ))}

        {section("history", "Usually filled in from your resume", (
          <div className="space-y-6">
            {isAi && (
              <p className={`rounded-xl p-3 text-xs leading-relaxed ${showMissing && (gate.missingKeys.has("experience") || gate.missingKeys.has("education")) ? "bg-amber-50 font-bold text-amber-900" : "bg-surface text-ink-soft"}`}>
                Scout AI needs at least one job with a title, company, start date and description, and one education entry with a school and degree.
                {gate.missingKeys.has("experience") && " A job with all four is still missing."}
                {gate.missingKeys.has("education") && " An education entry with a school and degree is still missing."}
              </p>
            )}
            <div><p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-ink-muted">Experience</p><ExperienceEditor items={draft.experience} onChange={(v) => set("experience", v)} /></div>
            <div><p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-ink-muted">Education</p><EducationEditor items={draft.education} onChange={(v) => set("education", v)} /></div>
            <div><p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-ink-muted">Projects</p><ProjectsEditor items={draft.projects} onChange={(v) => set("projects", v)} /></div>
          </div>
        ))}

        {section("preferences", "Pay, start date and the screening questions forms ask", (
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2 grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <Field label="Expected annual salary" required={req && !draft.desiredSalaryNegotiable}>
                {({ id }) => (
                  <div>
                    <input id={id} inputMode="decimal" value={draft.desiredSalaryNegotiable ? "" : draft.desiredSalary} disabled={draft.desiredSalaryNegotiable}
                      onChange={(e) => set("desiredSalary", e.target.value.replace(/[^0-9.,]/g, ""))} placeholder={draft.desiredSalaryNegotiable ? "Negotiable" : "e.g. 85000"}
                      aria-invalid={missing("desiredSalary") || undefined} className={inputClass(missing("desiredSalary"))} />
                    <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink-soft">
                      <input type="checkbox" checked={draft.desiredSalaryNegotiable} onChange={(e) => set("desiredSalaryNegotiable", e.target.checked)} className="h-4 w-4 accent-brand-700" />
                      I'd rather say it's negotiable
                    </label>
                  </div>
                )}
              </Field>
              <SelectField label="Currency" value={draft.desiredSalaryCurrency} onChange={(v) => set("desiredSalaryCurrency", v)} choices={CURRENCY_CHOICES} required={req && !draft.desiredSalaryNegotiable} missing={missing("desiredSalaryCurrency")} />
            </div>
            <div className="sm:col-span-2 grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <TextField label="Current annual salary" value={draft.currentSalary} onChange={(v) => set("currentSalary", v.replace(/[^0-9.,]/g, ""))} inputMode="decimal" required={req} missing={missing("currentSalary")} placeholder="0 if not working" />
              <SelectField label="Currency" value={draft.currentSalaryCurrency} onChange={(v) => set("currentSalaryCurrency", v)} choices={CURRENCY_CHOICES} required={req} missing={missing("currentSalaryCurrency")} />
            </div>
            <Pills className="sm:col-span-2" label="How soon could you start?" value={draft.noticePeriod} onChange={(v) => set("noticePeriod", v)} choices={plainChoices(NOTICE_PERIOD_VALUES).map((c) => (c.value === "Immediate" ? { ...c, label: "Right away" } : c))} required={req} missing={missing("noticePeriod")} />
            <Pills className="sm:col-span-2" label="How do you want to work?" value={draft.remotePreference} onChange={(v) => set("remotePreference", v)} choices={plainChoices(REMOTE_PREFERENCE_VALUES)} required={req} missing={missing("remotePreference")} />
            <Pills label="Willing to relocate?" value={draft.willingToRelocate} onChange={(v) => set("willingToRelocate", v)} choices={YES_NO} required={req} missing={missing("willingToRelocate")} />
            <Pills label="Do you have a driver's licence?" value={draft.driversLicense} onChange={(v) => set("driversLicense", v)} choices={YES_NO} required={req} missing={missing("driversLicense")} />
            <Pills className="sm:col-span-2" label="How much could you travel?" value={draft.willingToTravel} onChange={(v) => set("willingToTravel", v)} choices={plainChoices(WILLING_TO_TRAVEL_VALUES).map((c) => (c.value === "No" ? { ...c, label: "Not at all" } : c))} required={req} missing={missing("willingToTravel")} />
            <Pills label="Would you agree to a background check?" value={draft.backgroundCheckConsent} onChange={(v) => set("backgroundCheckConsent", v)} choices={YES_NO} required={req} missing={missing("backgroundCheckConsent")} />
            <Pills label="Would you agree to a drug test?" value={draft.drugTestConsent} onChange={(v) => set("drugTestConsent", v)} choices={YES_NO} required={req} missing={missing("drugTestConsent")} />
          </div>
        ))}

        {section("links", "Profiles, portfolio and referees", (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Plain text with a URL keyboard: "linkedin.com/in/you" is fine (FastApply adds https), and
                  each field takes only its own network, as FastApply checks. */}
              <TextField label="LinkedIn" inputMode="url" value={draft.linkedinURL} onChange={(v) => set("linkedinURL", v)} placeholder="linkedin.com/in/…" hint={linkHint("linkedinURL")} missing={!!linkError("linkedinURL")} />
              <TextField label="GitHub" inputMode="url" value={draft.githubURL} onChange={(v) => set("githubURL", v)} placeholder="github.com/…" hint={linkHint("githubURL")} missing={!!linkError("githubURL")} />
              <TextField label="Portfolio or website" inputMode="url" value={draft.website} onChange={(v) => set("website", v)} placeholder="yourname.com" hint={linkHint("website")} missing={!!linkError("website")} />
              <TextField label="X / Twitter" inputMode="url" value={draft.twitterURL} onChange={(v) => set("twitterURL", v)} placeholder="x.com/…" hint={linkHint("twitterURL")} missing={!!linkError("twitterURL")} />
            </div>
            <div><p className="mb-2 text-xs font-bold text-ink">Other links</p><LinksEditor items={draft.additionalLinks} onChange={(v) => set("additionalLinks", v)} /></div>
            <div><p className="mb-2 text-xs font-bold text-ink">References</p><ReferencesEditor items={draft.references} onChange={(v) => set("references", v)} /></div>
            {/* Only your Human Assistant reads this; Scout AI's application service does not use it. */}
            {!isAi && (
              <TextField label="When a form asks “How did you hear about us?”, answer" value={draft.howDidYouHearAboutUs} onChange={(v) => set("howDidYouHearAboutUs", v)} placeholder="e.g. LinkedIn" hint="Your assistant uses this when a form asks." />
            )}
          </div>
        ))}

        {section("media", "Optional, for employers who ask for them", (
          <div className="space-y-3">
            <PhotoCard profileId={loaded.profileId} media={loaded.media} demo={demo} onMedia={onMedia} />
            <VideoCard profileId={loaded.profileId} media={loaded.media} demo={demo} onMedia={onMedia} />
          </div>
        ))}

        {section("selfid", "Voluntary equal-opportunity questions, only with your permission", (
          <SelfIdSection draft={draft} storedConsent={loaded.storedConsent} required={req} showMissing={showMissing}
            onConsent={(choice) => set("sensitiveDataConsent", choice)} onAnswer={(key, value) => set(key, value)} />
        ))}
      </div>
    </div>
  );
}
