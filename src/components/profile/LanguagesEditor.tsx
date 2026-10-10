/**
 * Spoken languages, each with a level (FastApply's editor, ported). The levels answer "How well
 * do you speak X?" questions from what the member said; a level is never assumed, so a language
 * without one shows "Set a level" and is saved as level unknown.
 */
import { useState } from "react";
import { LANGUAGE_LEVEL_VALUES, MAX_LANGUAGES, type LanguageLevel } from "../../lib/profile-values";
import type { LanguageRow } from "./draft";
import { inputClass, smallButton, splitList } from "./ui";

const COMMON = ["English", "Spanish", "French", "German", "Portuguese", "Arabic", "Mandarin", "Hindi", "Swedish", "Swahili", "Yoruba", "Dutch", "Italian"];

interface Props {
  rows: LanguageRow[];
  onChange: (rows: LanguageRow[]) => void;
  missing?: boolean;
  levelsMissing?: boolean;
}

export default function LanguagesEditor({ rows, onChange, missing, levelsMissing }: Props) {
  const [draft, setDraft] = useState("");
  const [draftLevel, setDraftLevel] = useState<LanguageLevel | "">("");
  const names = new Set(rows.map((row) => row.language.toLowerCase()));
  const add = (raw: string, level: LanguageLevel | "" = draftLevel) => {
    const fresh = splitList(raw).map((name) => name.slice(0, 50)).filter((name, i, all) => !names.has(name.toLowerCase()) && all.findIndex((n) => n.toLowerCase() === name.toLowerCase()) === i);
    if (fresh.length) {
      // A single typed language takes the level chosen beside it; a pasted list gets none.
      onChange([...rows, ...fresh.map((language) => ({ language, level: fresh.length === 1 ? level : "" as const }))].slice(0, MAX_LANGUAGES));
    }
    setDraft("");
    setDraftLevel("");
  };
  const unlevelled = rows.filter((row) => !row.level).length;
  const suggestions = COMMON.filter((name) => !names.has(name.toLowerCase())).slice(0, 6);

  return (
    <div>
      {rows.length > 0 ? (
        <ul className="mb-3 space-y-2">
          {rows.map((row, index) => (
            <li key={`${row.language}-${index}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-2">
              <span className="truncate rounded-xl bg-surface px-3 py-2.5 text-sm font-semibold text-ink" title={row.language}>{row.language}</span>
              <select aria-label={`${row.language} level`} value={row.level} onChange={(e) => onChange(rows.map((item, i) => (i === index ? { ...item, level: e.target.value as LanguageLevel | "" } : item)))}
                className={inputClass(levelsMissing && !row.level)}>
                <option value="">Set a level</option>
                {LANGUAGE_LEVEL_VALUES.map((level) => <option key={level} value={level}>{level}</option>)}
              </select>
              <button type="button" aria-label={`Remove ${row.language}`} onClick={() => onChange(rows.filter((_, i) => i !== index))} className={smallButton("danger")}>×</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`mb-2 text-xs ${missing ? "font-bold text-amber-800" : "text-ink-muted"}`}>No languages yet. Add the ones you could work in.</p>
      )}
      {/* Leaving the row (for Save, say) adds what was typed, as the skills box does: moving to the
          level select beside it stays inside the row, so the level can still be picked first. */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-2"
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null) && draft.trim()) add(draft); }}>
        <input aria-label="Add a language" value={draft} placeholder="Type a language, or paste a list"
          onChange={(e) => { const value = e.target.value; if (/[,;\n]/.test(value)) add(value, ""); else setDraft(value); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (draft.trim()) add(draft); } }}
          className={inputClass(missing && rows.length === 0)} />
        <select aria-label="Level for the language being added" value={draftLevel}
          onChange={(e) => { const level = e.target.value as LanguageLevel | ""; if (draft.trim() && level) add(draft, level); else setDraftLevel(level); }}
          className={inputClass(false)}>
          <option value="">Level</option>
          {LANGUAGE_LEVEL_VALUES.map((level) => <option key={level} value={level}>{level}</option>)}
        </select>
        <button type="button" className={smallButton("primary")} disabled={!draft.trim()} onClick={() => add(draft)}>Add</button>
      </div>
      {suggestions.length > 0 && rows.length < 3 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-muted">Quick add:</span>
          {suggestions.map((name) => <button key={name} type="button" className={smallButton("ghost")} onClick={() => add(name, "")}>+ {name}</button>)}
        </div>
      )}
      {unlevelled > 0 && (
        <p className={`mt-2 text-xs ${levelsMissing ? "font-bold text-amber-800" : "text-ink-muted"}`}>
          {unlevelled === 1 ? "One language has no level yet" : `${unlevelled} languages have no level yet`}: a form asking how well you speak it would be left for you to answer.
        </p>
      )}
    </div>
  );
}
