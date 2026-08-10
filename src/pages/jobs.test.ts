import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The jobs list filters itself by toggling Tailwind's `.hidden` on each card — that is
 * how the search box, the profile dropdown and the status tabs all work.
 *
 * Astro scopes this page's styles with `scopedStyleStrategy: "attribute"` (its default),
 * so `.job-result { display: block }` ships as `.job-result[data-astro-cid-…]` — two
 * simple selectors. Tailwind's `.hidden { display: none }` is one. Specificity, not
 * source order, decides: the scoped rule wins and the card stays on screen, so every
 * filter on the page silently does nothing.
 *
 * This guards the fix: whatever `display` rules the page grows, the one that hides a
 * filtered card has to outrank them.
 */
const source = readFileSync(resolve(import.meta.dirname, "jobs.astro"), "utf8");
const styles = [...source.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1]).join("\n");

/** Counts ids/classes/attributes/elements the way the cascade does, before Astro's scoping attribute. */
function specificity(selector: string) {
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const classes = (selector.match(/\.[\w-]+/g) || []).length
    + (selector.match(/\[[^\]]+\]/g) || []).length
    + (selector.match(/:(?!:)(?!where\b)[\w-]+/g) || []).length;
  return ids * 100 + classes * 10;
}

/** Every `selector { … }` in the page's scoped CSS, ignoring at-rule headers. */
function rules(css: string) {
  return [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)]
    .flatMap(([, selectorList, body]) => selectorList.split(",").map((selector) => ({ selector: selector.trim(), body })));
}

describe("jobs list filtering", () => {
  const cardRules = rules(styles).filter((rule) => /(^|[\s>+~])\.job-result\b/.test(rule.selector) && /(^|[;{\s])display\s*:/.test(rule.body));

  it("has scoped display rules on the card, which is what makes this fragile", () => {
    expect(cardRules.length).toBeGreaterThan(0);
  });

  it("hides a filtered card at higher specificity than any rule that shows it", () => {
    const hiding = cardRules.filter((rule) => /display\s*:\s*none/.test(rule.body) && /\.hidden\b/.test(rule.selector));
    expect(hiding.length, "no `.job-result.hidden { display: none }` rule — toggling `hidden` cannot hide a card").toBeGreaterThan(0);

    const strongestShowing = Math.max(
      ...cardRules.filter((rule) => !/display\s*:\s*none/.test(rule.body)).map((rule) => specificity(rule.selector)),
      0,
    );
    for (const rule of hiding) {
      expect(specificity(rule.selector), `"${rule.selector}" must outrank the rules that set display on a card`)
        .toBeGreaterThan(strongestShowing);
    }
  });
});
