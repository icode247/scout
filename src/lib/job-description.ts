import sanitizeHtml from "sanitize-html";

/**
 * Sanitize an untrusted job description (from the job board / FastApply / user paste)
 * into HTML that is safe to inject via `set:html` / `innerHTML`.
 *
 * This is the single source of truth for job-description sanitization. Every code path
 * that renders a description as HTML — server-rendered (jobs.astro) and the client
 * infinite-scroll path (job-search.ts feeding appendBoardJobs) — must route through
 * this function so no unescaped third-party markup can ever reach the DOM.
 */
export function sanitizeJobDescription(value: string): string {
  const raw = String(value || "");
  const safe = sanitizeHtml(raw, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "h2", "h3", "h4", "ul", "ol", "li", "a", "blockquote"],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https", "mailto"],
    exclusiveFilter: (frame) => frame.tag === "p" && !frame.text.trim(),
    transformTags: { a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }) },
  });
  // Plain-text descriptions (no markup) keep their line breaks; anything with tags is
  // returned already-sanitized so newlines are irrelevant.
  return /<[a-z][\s\S]*>/i.test(raw) ? safe : safe.replace(/\n/g, "<br>");
}
