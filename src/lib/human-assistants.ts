export interface HumanAssistant {
  name: string;
  firstName: string;
  avatar: string;
}

export const humanAssistants: HumanAssistant[] = [
  { name: "Angela Price", firstName: "Angela", avatar: "/assets/agents/angela-price.webp" },
  { name: "Daniel Kim", firstName: "Daniel", avatar: "/assets/agents/daniel-kim.webp" },
  { name: "Lena Santos", firstName: "Lena", avatar: "/assets/agents/lena-santos.webp" },
  { name: "Marcus Reed", firstName: "Marcus", avatar: "/assets/agents/marcus-reed.webp" },
  { name: "Maya Brooks", firstName: "Maya", avatar: "/assets/agents/maya-brooks.webp" },
];

function stableIndex(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % humanAssistants.length;
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
  return humanAssistants.find((assistant) => assistant.name.toLowerCase() === saved)
    ?? humanAssistants[stableIndex(userId)];
}

/** The assistant actually recorded on the profile, or null if none was assigned. */
export function savedHumanAssistant(savedName?: string | null): HumanAssistant | null {
  const saved = savedName?.trim().toLowerCase();
  if (!saved) return null;
  return humanAssistants.find((assistant) => assistant.name.toLowerCase() === saved) ?? null;
}
