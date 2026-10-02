import type { SupabaseClient } from "@supabase/supabase-js";

export interface HumanAssistant {
  /** Database id; absent for the built-in fallback roster. */
  id?: string;
  name: string;
  firstName: string;
  avatar: string;
  /** Names this assistant was saved under before a rename; old profile rows still match. */
  formerNames?: string[];
  /** The login this assistant works from, when one is set. */
  email?: string | null;
  /** Inactive assistants still resolve for their existing clients but receive no new ones. */
  active?: boolean;
}

/** Placeholder for an assistant added without a photo. */
export const DEFAULT_ASSISTANT_AVATAR = "/scout-mark-512.png";

/**
 * The roster before the human_assistants table existed. It is the fallback until
 * that migration runs, so the app behaves exactly as it did.
 */
export const BUILT_IN_ASSISTANTS: HumanAssistant[] = [
  { name: "Angela Price", firstName: "Angela", avatar: "/assets/agents/angela-price.webp" },
  { name: "Clinton", firstName: "Clinton", avatar: "/assets/agents/clinton.webp", formerNames: ["Daniel Kim"] },
  { name: "Lena Santos", firstName: "Lena", avatar: "/assets/agents/lena-santos.webp" },
  { name: "Marcus Reed", firstName: "Marcus", avatar: "/assets/agents/marcus-reed.webp" },
  { name: "Maya Brooks", firstName: "Maya", avatar: "/assets/agents/maya-brooks.webp" },
];

// Admins edit the roster from /admin. Each server instance keeps a copy for a
// minute so rendering a page never waits on it; an edit refreshes it at once.
const ROSTER_TTL_MS = 60_000;
let roster: HumanAssistant[] = BUILT_IN_ASSISTANTS;
let rosterFromDatabase = false;
let loadedAt = 0;

export function mapAssistantRow(row: any): HumanAssistant {
  return {
    id: row.id, name: row.name, firstName: row.first_name || String(row.name).split(/\s+/)[0],
    avatar: row.avatar_url || DEFAULT_ASSISTANT_AVATAR, formerNames: row.former_names || [],
    email: row.email ?? null, active: row.active !== false,
  };
}

/**
 * Loads the roster from the human_assistants table (cached). A missing table or
 * an error keeps the current roster, so the app never loses its assistants.
 */
export async function refreshHumanAssistants(admin: SupabaseClient, force = false) {
  if (!force && Date.now() - loadedAt < ROSTER_TTL_MS) return;
  loadedAt = Date.now();
  const result = await admin.from("human_assistants").select("id,name,first_name,email,avatar_url,former_names,active").order("name");
  if (result.error) {
    rosterFromDatabase = false;
    return;
  }
  roster = (result.data || []).map(mapAssistantRow);
  rosterFromDatabase = true;
}

/** True once the roster comes from the database (the migration has run). */
export function rosterIsManaged() {
  return rosterFromDatabase;
}

/** Every assistant, including inactive ones, for lookups and admin screens. */
export function allHumanAssistants(): HumanAssistant[] {
  return roster;
}

/** Assistants who can take new clients. */
export function activeHumanAssistants(): HumanAssistant[] {
  const active = roster.filter((assistant) => assistant.active !== false);
  return active.length ? active : roster;
}

function matchesName(assistant: HumanAssistant, saved: string) {
  return assistant.name.toLowerCase() === saved
    || Boolean(assistant.formerNames?.some((name) => name.toLowerCase() === saved));
}

function stableIndex(value: string, size: number) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % size;
}

/**
 * Picks the assistant for a user, falling back to a stable hash when no name is
 * saved yet. The fallback makes this an ASSIGNMENT, not a lookup — call it only
 * where you intend to grant somebody an assistant (the payment webhook) or to
 * show operations a suggested pairing (the admin queue).
 *
 * For rendering a member's own assistant, use `savedHumanAssistant` instead:
 * this one would invent a name for someone who has never paid.
 */
export function assignedHumanAssistant(userId: string, savedName?: string | null): HumanAssistant {
  const saved = savedName?.trim().toLowerCase();
  const pool = activeHumanAssistants();
  return (saved ? roster.find((assistant) => matchesName(assistant, saved)) : undefined)
    ?? pool[stableIndex(userId, pool.length)];
}

/** The assistant actually recorded on the profile, or null if none was assigned. */
export function savedHumanAssistant(savedName?: string | null): HumanAssistant | null {
  const saved = savedName?.trim().toLowerCase();
  if (!saved) return null;
  return roster.find((assistant) => matchesName(assistant, saved)) ?? null;
}

/** Test hook: replace the in-memory roster. */
export function setHumanAssistantsForTest(next: HumanAssistant[] | null) {
  roster = next ?? BUILT_IN_ASSISTANTS;
  rosterFromDatabase = Boolean(next);
  loadedAt = next ? Date.now() : 0;
}
