import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import mammoth from "mammoth";

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
export type ResumeKind = "pdf" | "docx";
export type ResumeExtractionProvider = "anthropic" | "openai";

export interface ResumeExtraction {
  version: 1;
  status: "complete";
  contact: { name: string; email: string; phone: string; location: string };
  headline: string;
  summary: string;
  roles: Array<{ title: string; company: string; location: string; start_date: string; end_date: string; achievements: string[] }>;
  education: Array<{ institution: string; degree: string; field: string; graduation_date: string }>;
  skills: string[];
  target_roles: string[];
  preferred_locations: string[];
  salary_min: number | null;
  work_authorization: string;
  sponsorship_required: boolean | null;
  extracted_at: string;
}

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["contact", "headline", "summary", "roles", "education", "skills", "target_roles", "preferred_locations", "salary_min", "work_authorization", "sponsorship_required"],
  properties: {
    contact: {
      type: "object", additionalProperties: false,
      required: ["name", "email", "phone", "location"],
      properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, location: { type: "string" } },
    },
    headline: { type: "string" },
    summary: { type: "string" },
    roles: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        required: ["title", "company", "location", "start_date", "end_date", "achievements"],
        properties: {
          title: { type: "string" }, company: { type: "string" }, location: { type: "string" },
          start_date: { type: "string" }, end_date: { type: "string" },
          achievements: { type: "array", items: { type: "string" } },
        },
      },
    },
    education: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        required: ["institution", "degree", "field", "graduation_date"],
        properties: { institution: { type: "string" }, degree: { type: "string" }, field: { type: "string" }, graduation_date: { type: "string" } },
      },
    },
    skills: { type: "array", items: { type: "string" } },
    target_roles: { type: "array", items: { type: "string" } },
    preferred_locations: { type: "array", items: { type: "string" } },
    salary_min: { anyOf: [{ type: "integer" }, { type: "null" }] },
    work_authorization: { type: "string" },
    sponsorship_required: { anyOf: [{ type: "boolean" }, { type: "null" }] },
  },
} as const;

const extractionPrompt = "Extract only facts present in this resume. Do not invent missing values. Use empty strings or empty arrays for unknown text/list fields and null for unknown salary or sponsorship. Suggest target roles only when supported by the resume.";

export function resumeExtractionProvider(): ResumeExtractionProvider {
  const provider = import.meta.env.RESUME_EXTRACTION_PROVIDER?.trim().toLowerCase() || "anthropic";
  if (provider !== "anthropic" && provider !== "openai") {
    throw new Error("RESUME_EXTRACTION_PROVIDER must be anthropic or openai");
  }
  return provider;
}

export async function validateResumeFile(file: File): Promise<{ kind: ResumeKind; bytes: Uint8Array }> {
  if (!file.size) throw new Error("Choose a resume file");
  if (file.size > MAX_RESUME_BYTES) throw new Error("Resume must be under 10 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2]) && [0x04, 0x06, 0x08].includes(bytes[3]);
  const extension = file.name.toLowerCase().split(".").pop();
  if (isPdf && extension === "pdf") return { kind: "pdf", bytes };
  if (isZip && extension === "docx") return { kind: "docx", bytes };
  if (extension === "doc") throw new Error("Legacy .doc files are not supported. Save the resume as PDF or DOCX.");
  throw new Error("Upload a valid PDF or DOCX resume");
}

async function docxText(bytes: Uint8Array) {
  const parsed = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  const text = parsed.value.trim();
  if (!text) throw new Error("No readable text was found in this DOCX");
  return text.slice(0, 120000);
}

function completeExtraction(parsed: Omit<ResumeExtraction, "version" | "status" | "extracted_at">): ResumeExtraction {
  return { version: 1, status: "complete", ...parsed, extracted_at: new Date().toISOString() };
}

async function extractWithAnthropic(kind: ResumeKind, bytes: Uint8Array): Promise<ResumeExtraction> {
  const apiKey = import.meta.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required when RESUME_EXTRACTION_PROVIDER=anthropic");
  const client = new Anthropic({ apiKey });
  const content: any[] = kind === "pdf"
    ? [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(bytes).toString("base64") } },
        { type: "text", text: extractionPrompt },
      ]
    : [{ type: "text", text: extractionPrompt + "\n\nRESUME:\n" + await docxText(bytes) }];

  const response = await client.messages.create({
    model: import.meta.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5",
    max_tokens: 5000,
    messages: [{ role: "user", content }],
    output_config: { format: { type: "json_schema", schema: extractionSchema } },
  });
  if (response.stop_reason === "max_tokens" || response.stop_reason === "refusal") throw new Error("Anthropic resume extraction could not complete");
  const block = response.content.find((item) => item.type === "text");
  if (!block || block.type !== "text") throw new Error("Anthropic resume extraction returned no data");
  return completeExtraction(JSON.parse(block.text));
}

async function extractWithOpenAI(file: File, kind: ResumeKind, bytes: Uint8Array): Promise<ResumeExtraction> {
  const apiKey = import.meta.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required when RESUME_EXTRACTION_PROVIDER=openai");
  const client = new OpenAI({ apiKey });
  const content: any[] = kind === "pdf"
    ? [
        { type: "input_file", filename: file.name, file_data: "data:application/pdf;base64," + Buffer.from(bytes).toString("base64") },
        { type: "input_text", text: extractionPrompt },
      ]
    : [{ type: "input_text", text: extractionPrompt + "\n\nRESUME:\n" + await docxText(bytes) }];

  const response = await client.responses.create({
    model: import.meta.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini",
    input: [{ role: "user", content }],
    text: {
      format: {
        type: "json_schema",
        name: "resume_extraction",
        strict: true,
        schema: extractionSchema,
      },
    },
  });
  if (!response.output_text) throw new Error("OpenAI resume extraction returned no data");
  return completeExtraction(JSON.parse(response.output_text));
}

export async function extractResume(file: File): Promise<ResumeExtraction> {
  const { kind, bytes } = await validateResumeFile(file);
  return resumeExtractionProvider() === "openai"
    ? extractWithOpenAI(file, kind, bytes)
    : extractWithAnthropic(kind, bytes);
}
