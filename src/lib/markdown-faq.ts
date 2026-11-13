export interface MarkdownFaqItem {
  question: string;
  answer: string;
}

const FAQ_HEADING = /^## Frequently asked questions\s*$/m;
const LINK = /\[([^\]]+)\]\([^)\s]+\)/g;

/**
 * Reads the visible FAQ out of a Markdown post: every `### Question` under
 * `## Frequently asked questions`, with the paragraph(s) below it as the answer.
 * Links become their anchor words, so FAQPage JSON-LD matches the page word for word.
 * Throws when there is nothing to read, so a post that asks for FAQPage cannot ship without one.
 */
export function markdownFaq(body: string): MarkdownFaqItem[] {
  const start = body.search(FAQ_HEADING);
  if (start === -1) throw new Error('markdownFaq: no "## Frequently asked questions" section');
  const afterHeading = body.slice(start).replace(FAQ_HEADING, "");
  const nextSection = afterHeading.search(/^## /m);
  const section = nextSection === -1 ? afterHeading : afterHeading.slice(0, nextSection);

  const items = section
    .split(/^### /m)
    .slice(1)
    .map((block) => {
      const [heading, ...rest] = block.split("\n");
      const answer = rest
        .join("\n")
        .trim()
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
        .join(" ")
        .replace(LINK, "$1");
      return { question: heading.trim(), answer };
    });

  if (items.length === 0 || items.some((item) => !item.question || !item.answer)) {
    throw new Error("markdownFaq: every FAQ needs a question and an answer");
  }
  return items;
}
