import { describe, expect, it } from "vitest";
import { markdownFaq } from "./markdown-faq";

const post = `Intro.

## Frequently asked questions

### Is Scout a career coach?

No. Scout is a job application service.

### How much does Scout cost?

Plans start at $39 a month. See [pricing](/pricing).

## Buy the missing capability

### Not a question

Closing copy.
`;

describe("markdownFaq", () => {
  it("reads each question and answer from the FAQ section only", () => {
    expect(markdownFaq(post)).toEqual([
      { question: "Is Scout a career coach?", answer: "No. Scout is a job application service." },
      { question: "How much does Scout cost?", answer: "Plans start at $39 a month. See pricing." },
    ]);
  });

  it("throws when the post has no FAQ section", () => {
    expect(() => markdownFaq("## Something else\n\nText.")).toThrow();
  });

  it("throws when a question has no answer", () => {
    expect(() => markdownFaq("## Frequently asked questions\n\n### Empty?\n")).toThrow();
  });
});
