import { describe, expect, it } from "vitest";
import { EVIDENCE_MAX_BYTES, evidenceFiles, evidenceProblem } from "./application-evidence";

const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });

describe("application evidence", () => {
  it("accepts screenshots and PDFs", () => {
    expect(evidenceProblem([file("a.png", "image/png"), file("b.pdf", "application/pdf")])).toBeNull();
  });

  it("rejects other file types and oversized files", () => {
    expect(evidenceProblem([file("resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")])).toMatch(/resume\.docx/);
    expect(evidenceProblem([file("big.png", "image/png", EVIDENCE_MAX_BYTES + 1)])).toMatch(/larger than 10 MB/);
  });

  it("ignores empty file inputs", () => {
    const form = new FormData();
    form.append("screenshots", file("empty.png", "image/png", 0));
    form.append("screenshots", file("real.png", "image/png"));
    expect(evidenceFiles(form, "screenshots").map((item) => item.name)).toEqual(["real.png"]);
  });
});
