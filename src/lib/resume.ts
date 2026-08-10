import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import mammoth from "mammoth";
import type { ResumeExtraction } from "./resume-extraction";

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
export type ResumeKind = "pdf" | "docx";
export type ResumeExtractionProvider = "anthropic" | "openai";

export type { ResumeExtraction } from "./resume-extraction";

const text = { type: "string" } as const;
const textList = { type: "array", items: { type: "string" } } as const;

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "firstName", "middleName", "lastName", "email", "phoneCountryCode", "phoneNumber",
    "streetAddress", "currentCity", "state", "zipcode", "country",
    "headline", "summary", "yearsOfExperience", "skills", "languages", "certifications",
    "linkedinURL", "githubURL", "website", "education", "experience",
    "workAuthorization", "requiresSponsorship", "securityClearance",
    "targetRoles", "preferredLocations", "desiredSalary",
  ],
  properties: {
    firstName: text, middleName: text, lastName: text, email: text,
    phoneCountryCode: text, phoneNumber: text,
    streetAddress: text, currentCity: text, state: text, zipcode: text, country: text,
    headline: text, summary: text,
    yearsOfExperience: { anyOf: [{ type: "integer" }, { type: "null" }] },
    skills: textList, languages: textList, certifications: textList,
    linkedinURL: text, githubURL: text, website: text,
    education: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        required: ["school", "degree", "major", "gpa", "startDate", "endDate", "location"],
        properties: { school: text, degree: text, major: text, gpa: text, startDate: text, endDate: text, location: text },
      },
    },
    experience: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        required: ["title", "company", "location", "startDate", "endDate", "description"],
        properties: { title: text, company: text, location: text, startDate: text, endDate: text, description: text },
      },
    },
    workAuthorization: text,
    requiresSponsorship: { type: "string", enum: ["Yes", "No", ""] },
    securityClearance: text,
    targetRoles: textList, preferredLocations: textList, desiredSalary: text,
  },
} as const;

const extractionPrompt = [
  "Extract only facts stated in this resume. Do not invent, infer, or guess missing values.",
  "Use an empty string for unknown text, an empty array for unknown lists, and null for an unknown years of experience.",
  "Split the candidate's name into firstName / middleName / lastName, and split their address into streetAddress, currentCity, state, zipcode, and country. Leave any part the resume does not state empty — never guess a city from an employer's location.",
  "phoneCountryCode is the leading international dialling code (for example \"+1\"); phoneNumber is the rest of the number.",
  "yearsOfExperience is the total years of professional experience the work history covers, rounded down. Use null when the dates are too incomplete to total.",
  "Every startDate and endDate must be a full month name and a four-digit year, like \"March 2021\". Use just the year (\"2014\") when the resume gives no month, \"Present\" for a role or course still ongoing, and an empty string when there is no date at all. Never write a season, a quarter, a range, or an abbreviation.",
  "workAuthorization, requiresSponsorship, and securityClearance must be left empty unless the resume states them outright.",
  "Suggest targetRoles and preferredLocations only where the resume supports them. desiredSalary is only for a salary the resume itself states.",
].join(" ");

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
  return { version: 2, status: "complete", ...parsed, extracted_at: new Date().toISOString() };
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
