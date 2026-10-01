import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = path.resolve("public/assets/blog");
fs.mkdirSync(OUT, { recursive: true });

const C = {
  forest: "#10210D",
  ink: "#14210F",
  soft: "#3D4A35",
  muted: "#69735F",
  lime: "#9DDE47",
  brand: "#7FC92B",
  pale: "#F4FFEB",
  softPale: "#E7FFD2",
  sunken: "#DFF1CF",
  signal: "#1F9D6A",
  signalPale: "#D7F4E4",
  amber: "#D88A24",
  amberPale: "#FFE8C4",
  white: "#FFFFFF",
};

const font = "Nimbus Sans, Arial, sans-serif";
const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function lines(text, max = 28) {
  const words = String(text).split(/\s+/);
  const result = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      result.push(line);
      line = word;
    } else line = next;
  }
  if (line) result.push(line);
  return result;
}

function textBlock(text, x, y, { max = 28, size = 28, weight = 500, fill = C.ink, lineHeight = 1.22, anchor = "start" } = {}) {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${font}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${lines(text, max).map((line, index) => `<tspan x="${x}" dy="${index ? size * lineHeight : 0}">${esc(line)}</tspan>`).join("")}</text>`;
}

function logo({ x = 64, y = 48, reversed = false, scale = 1 } = {}) {
  const dark = reversed ? C.white : C.forest;
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <path fill="${C.lime}" d="M4.5 9.2c0-1.2 1.2-2 2.3-1.6l6.7 2.7v12.8l-6.7 2.7a1.7 1.7 0 0 1-2.3-1.6v-15Z"/>
    <path fill="${dark}" d="m15.9 8.8 9.2-3.7c1.1-.5 2.4.4 2.4 1.6v18.6c0 1.2-1.3 2.1-2.4 1.6l-8.6-3.4V13.3l-1.2-.5c-1.8-.7-1.7-3.2.1-3.8l.5-.2Z"/>
    <text x="42" y="27" fill="${dark}" font-family="${font}" font-size="25" font-weight="700" letter-spacing="-1">scout</text>
  </g>`;
}

/** Pill width for an uppercase kicker: approximate glyph width plus tracking and padding, never narrower than the original design. */
function pillWidth(text, size, tracking, minimum) {
  const upper = String(text).toUpperCase();
  return Math.max(minimum, Math.ceil(upper.length * (size * 0.68 + tracking) + 28));
}

function baseSvg(width, height, content, background = C.pale) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="${background}"/>
    ${content}
  </svg>`;
}

function cover(config) {
  const titleLines = lines(config.title, 22).slice(0, 3);
  const title = `<text x="72" y="196" fill="${C.white}" font-family="${font}" font-size="64" font-weight="700" letter-spacing="-2">${titleLines.map((line, i) => `<tspan x="72" dy="${i ? 70 : 0}">${esc(line)}</tspan>`).join("")}</text>`;
  const titleBottom = 196 + (titleLines.length - 1) * 70;
  const visualCards = config.cards.map((card, index) => {
    const x = 744 + index * 28;
    const y = 142 + index * 112;
    const fill = index === 1 ? C.amberPale : C.white;
    const badge = index === 1 ? C.amber : C.signal;
    return `<g transform="translate(${x} ${y}) rotate(${index === 0 ? -3 : index === 2 ? 3 : 0} 175 58)">
      <rect width="360" height="104" rx="16" fill="${fill}" opacity=".98"/>
      <circle cx="42" cy="52" r="18" fill="${badge}"/>
      <path d="m34 52 6 6 11-14" fill="none" stroke="${C.white}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="76" y="45" fill="${C.ink}" font-family="${font}" font-size="20" font-weight="700">${esc(card)}</text>
      <rect x="76" y="61" width="${160 + index * 34}" height="8" rx="4" fill="${C.sunken}"/>
    </g>`;
  }).join("");

  return baseSvg(1200, 628, `
    <defs>
      <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
        <path d="M32 0H0V32" fill="none" stroke="${C.white}" stroke-opacity=".055"/>
      </pattern>
      <radialGradient id="glow" cx="84%" cy="42%" r="58%">
        <stop offset="0" stop-color="${C.brand}" stop-opacity=".34"/>
        <stop offset="1" stop-color="${C.forest}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="628" fill="${C.forest}"/>
    <rect width="1200" height="628" fill="url(#grid)"/>
    <rect width="1200" height="628" fill="url(#glow)"/>
    <path d="M1030 -40C920 96 1010 184 1168 210" fill="none" stroke="${C.lime}" stroke-width="26" stroke-linecap="round" opacity=".9"/>
    ${logo({ x: 72, y: 48, reversed: true, scale: 1.2 })}
    <rect x="72" y="112" width="${pillWidth(config.kicker, 15, 1.2, 178)}" height="34" rx="17" fill="${config.accent || C.signal}"/>
    <text x="${72 + pillWidth(config.kicker, 15, 1.2, 178) / 2}" y="135" fill="${C.white}" font-family="${font}" font-size="15" font-weight="700" text-anchor="middle" letter-spacing="1.2">${esc(config.kicker.toUpperCase())}</text>
    ${title}
    ${textBlock(config.subtitle, 72, titleBottom + 56, { max: 48, size: 23, weight: 500, fill: "#C8D7C0", lineHeight: 1.35 })}
    ${visualCards}
    <rect x="72" y="560" width="1056" height="1" fill="${C.white}" opacity=".14"/>
    <text x="72" y="596" fill="${C.lime}" font-family="${font}" font-size="17" font-weight="700">applyscout.app</text>
    <text x="1128" y="596" fill="${C.white}" opacity=".62" font-family="${font}" font-size="15" font-weight="600" text-anchor="end">Human + AI job application service</text>
  `, C.forest);
}

function infographicHeader(config) {
  return `
    <defs>
      <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.1" fill="${C.forest}" opacity=".06"/>
      </pattern>
    </defs>
    <rect width="1200" height="800" fill="url(#dots)"/>
    ${logo({ x: 64, y: 40, scale: 1.15 })}
    <rect x="64" y="112" width="${pillWidth(config.kicker, 13, 1.1, 180)}" height="30" rx="15" fill="${config.accentPale || C.signalPale}"/>
    <text x="${64 + pillWidth(config.kicker, 13, 1.1, 180) / 2}" y="133" fill="${config.accent || C.signal}" font-family="${font}" font-size="13" font-weight="700" text-anchor="middle" letter-spacing="1.1">${esc(config.kicker.toUpperCase())}</text>
    ${textBlock(config.title, 64, 196, { max: 42, size: 42, weight: 700, fill: C.ink, lineHeight: 1.12 })}
    ${textBlock(config.subtitle, 64, 258, { max: 86, size: 19, weight: 500, fill: C.soft, lineHeight: 1.25 })}
  `;
}

function footer() {
  return `<rect x="64" y="750" width="1072" height="1" fill="${C.ink}" opacity=".12"/>
    <text x="64" y="780" fill="${C.muted}" font-family="${font}" font-size="14" font-weight="600">SCOUT FIELD GUIDE</text>
    <text x="1136" y="780" fill="${C.ink}" font-family="${font}" font-size="14" font-weight="700" text-anchor="end">applyscout.app</text>`;
}

function cardsGraphic(config) {
  const columns = config.columns || (config.items.length <= 4 ? 2 : 3);
  const rows = Math.ceil(config.items.length / columns);
  const gap = 18;
  const x0 = 64;
  const y0 = 326;
  const usableW = 1072;
  const usableH = 390;
  const w = (usableW - gap * (columns - 1)) / columns;
  const h = (usableH - gap * (rows - 1)) / rows;
  const cards = config.items.map((item, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = x0 + col * (w + gap);
    const y = y0 + row * (h + gap);
    const accent = item.tone === "amber" ? C.amber : item.tone === "lime" ? C.brand : C.signal;
    const pale = item.tone === "amber" ? C.amberPale : item.tone === "lime" ? C.softPale : C.signalPale;
    return `<g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${C.white}" stroke="${C.ink}" stroke-opacity=".09"/>
      <rect x="${x}" y="${y}" width="8" height="${h}" rx="4" fill="${accent}"/>
      <circle cx="${x + 42}" cy="${y + 38}" r="18" fill="${pale}"/>
      <text x="${x + 42}" y="${y + 44}" fill="${accent}" font-family="${font}" font-size="16" font-weight="700" text-anchor="middle">${item.number || index + 1}</text>
      ${textBlock(item.title, x + 72, y + 35, { max: columns === 3 ? 20 : 28, size: 20, weight: 700, fill: C.ink })}
      ${textBlock(item.body, x + 28, y + 82, { max: columns === 3 ? 32 : 48, size: 16, weight: 500, fill: C.soft, lineHeight: 1.25 })}
    </g>`;
  }).join("");
  return baseSvg(1200, 800, `${infographicHeader(config)}${cards}${footer()}`);
}

function splitGraphic(config) {
  const sides = config.sides.map((side, index) => {
    const x = index ? 618 : 64;
    const accent = index ? (config.rightTone === "amber" ? C.amber : C.signal) : C.brand;
    const pale = index ? (config.rightTone === "amber" ? C.amberPale : C.signalPale) : C.softPale;
    const rows = side.items.map((item, row) => `
      <g>
        <circle cx="${x + 30}" cy="${405 + row * 72}" r="17" fill="${pale}"/>
        <text x="${x + 30}" y="${411 + row * 72}" fill="${accent}" font-family="${font}" font-size="17" font-weight="700" text-anchor="middle">${index ? "!" : "✓"}</text>
        ${textBlock(item, x + 62, 398 + row * 72, { max: 43, size: 17, weight: 600, fill: C.ink, lineHeight: 1.2 })}
      </g>`).join("");
    return `<g>
      <rect x="${x}" y="320" width="518" height="402" rx="18" fill="${C.white}" stroke="${C.ink}" stroke-opacity=".09"/>
      <rect x="${x}" y="320" width="518" height="58" rx="18" fill="${pale}"/>
      <rect x="${x}" y="360" width="518" height="18" fill="${pale}"/>
      <text x="${x + 24}" y="357" fill="${accent}" font-family="${font}" font-size="22" font-weight="700">${esc(side.title)}</text>
      ${rows}
    </g>`;
  }).join("");
  return baseSvg(1200, 800, `${infographicHeader(config)}${sides}${footer()}`);
}

const posts = [
  {
    slug: "how-scout-works",
    cover: { kicker: "Product guide", title: "How Scout works", subtitle: "Choose a Human or AI Assistant. Keep control of every application.", cards: ["Build your profile", "Scout applies", "You interview"], accent: C.brand },
    info1: { type: "cards", kicker: "Four-step workflow", title: "How Scout works in four steps", subtitle: "You interview. Scout handles the application work.", columns: 2, items: [
      { title: "Build your profile", body: "Set roles, locations, preferences, resumes, and exclusions." },
      { title: "Choose your assistant", body: "Use lower-cost AI or a dedicated Human Assistant.", tone: "lime" },
      { title: "Applications go out", body: "Scout matches, prepares, submits, and records the work." },
      { title: "You interview", body: "Handle assessments, conversations, and final decisions.", tone: "amber" },
    ]},
    info2: { type: "cards", kicker: "Proven infrastructure", title: "Scout is built on the FastApply engine", subtitle: "The service layer you control sits on established application infrastructure.", columns: 3, items: [
      { title: "You + assistant", body: "AI or human execution guided by your decisions.", tone: "lime" },
      { title: "Scout layer", body: "Profiles, targeting, delegation, plans, and tracking." },
      { title: "FastApply engine", body: "Discovery, matching, tailoring, and ATS submission. 2M+ applications.", tone: "amber" },
    ]},
  },
  {
    slug: "app-that-applies-to-jobs-for-you",
    cover: { kicker: "Buyer guide", title: "Apps that apply to jobs for you", subtitle: "What they do, what you control, and what proof to expect.", cards: ["Match the right role", "Human review", "Save the receipt"], accent: C.signal },
    info1: { type: "cards", kicker: "Service map", title: "Four levels of application help", subtitle: "The interface matters less than the work that is actually completed.", columns: 2, items: [
      { title: "Autofill", body: "Inserts saved data. You find, review, and submit the job." },
      { title: "Auto-submit", body: "Completes supported forms using approved profile information.", tone: "lime" },
      { title: "AI assistant", body: "Matches, prepares, submits, and tracks repeatable workflows." },
      { title: "Human assistant", body: "Adds judgment, communication, and detailed evidence.", tone: "amber" },
    ]},
    info2: { type: "cards", kicker: "Control checklist", title: "Five controls to verify before paying", subtitle: "A trustworthy service should answer these questions before it applies.", columns: 3, items: [
      { title: "Fit rules", body: "Roles, level, location, salary, authorization." },
      { title: "Approval mode", body: "Know exactly when a job can be submitted.", tone: "amber" },
      { title: "Resume integrity", body: "Keep the original and every version used.", tone: "lime" },
      { title: "Sensitive answers", body: "Ask when salary, clearance, or sponsorship is unclear." },
      { title: "Submission proof", body: "Job, date, status, resume, and answer evidence." },
    ]},
  },
  {
    slug: "automatic-cover-letter-for-every-job-application",
    cover: { kicker: "Application materials", title: "Automatic cover letters without invented facts", subtitle: "Use automation for selection and drafting. Keep truth and approval human.", cards: ["Select real evidence", "Draft for one role", "Review every claim"], accent: C.brand },
    info1: { type: "split", kicker: "Quality check", title: "Useful automation vs risky automation", subtitle: "Tailoring changes emphasis—not your employment history.", rightTone: "amber", sides: [
      { title: "Useful", items: ["Selects facts from approved materials", "Uses role language naturally", "Marks uncertainty for review", "Stores the exact version sent"] },
      { title: "Risky", items: ["Invents missing experience", "Swaps only the company name", "Keyword-stuffs the draft", "Leaves no application record"] },
    ]},
    info2: { type: "cards", kicker: "Workflow", title: "Six steps to a trustworthy draft", subtitle: "The goal is a relevant letter when one adds value—not maximum output.", columns: 3, items: [
      { title: "Protect source", body: "Start from verified resume facts." },
      { title: "Read priorities", body: "Separate required from preferred." },
      { title: "Select evidence", body: "Choose one or two real outcomes." },
      { title: "Draft briefly", body: "Aim for a specific, concise note.", tone: "lime" },
      { title: "Review facts", body: "Check names, dates, metrics, and tools.", tone: "amber" },
      { title: "Save version", body: "Know what every employer received." },
    ]},
  },
  {
    slug: "does-ai-applying-to-jobs-work",
    cover: { kicker: "Evidence guide", title: "Does AI applying to jobs work?", subtitle: "Measure application quality, accuracy, interviews, and time saved.", cards: ["Set one profile", "Measure the errors", "Track interviews"], accent: C.signal },
    info1: { type: "split", kicker: "Reality check", title: "What AI controls—and what it cannot", subtitle: "Application operations can improve. Hiring decisions still belong to employers.", rightTone: "amber", sides: [
      { title: "AI can help control", items: ["Profile extraction and repeatable answers", "Job criteria and document drafts", "Application records and versions", "Missing-information alerts"] },
      { title: "AI cannot control", items: ["Employer demand and competition", "Salary and authorization fit", "Recruiter preferences", "Interview performance"] },
    ]},
    info2: { type: "cards", kicker: "Measurement", title: "The scorecard that matters", subtitle: "Application count is activity. These metrics reveal whether the process works.", columns: 3, items: [
      { title: "Qualified apps", body: "How many met the real profile?" },
      { title: "Wrong-fit rate", body: "Errors per 100 applications.", tone: "amber" },
      { title: "Interview screens", body: "Responses per 100 qualified apps.", tone: "lime" },
      { title: "Duplicates", body: "Repeat submissions prevented." },
      { title: "Corrections", body: "Materials or answers repaired." },
      { title: "Time saved", body: "Minutes of candidate work removed." },
    ]},
  },
  {
    slug: "how-to-apply-to-hundreds-of-jobs",
    cover: { kicker: "Campaign playbook", title: "Apply at scale without losing quality", subtitle: "Profiles, hard filters, version control, and outcome measurement.", cards: ["Filter before fit", "Ask—do not guess", "Measure per 100"], accent: C.brand },
    info1: { type: "cards", kicker: "Controlled pipeline", title: "Seven steps before volume goes up", subtitle: "Scale the process only after the controls are working.", columns: 3, items: [
      { title: "Separate profiles", body: "One strategy per role family." },
      { title: "Hard filters", body: "Eligibility before similarity." },
      { title: "Protect truth", body: "Original plus versioned copies.", tone: "lime" },
      { title: "Escalate", body: "Ask when answers are uncertain.", tone: "amber" },
      { title: "Stop duplicates", body: "Normalize roles and requisitions." },
      { title: "Choose approval", body: "Review every job or strict rules." },
      { title: "Measure outcomes", body: "Interviews, errors, and time saved." },
    ]},
    info2: { type: "split", kicker: "Decision order", title: "Hard filters come before fit scores", subtitle: "A persuasive match score must never override a disqualifying fact.", rightTone: "amber", sides: [
      { title: "Check first", items: ["Work authorization and sponsorship", "Location and work arrangement", "Seniority and employment type", "Clearance, license, and salary"] },
      { title: "Rank second", items: ["Skills and domain overlap", "Relevant accomplishments", "Tools and responsibilities", "Posting age and candidate preference"] },
    ]},
  },
  {
    slug: "how-to-auto-apply-to-workday-jobs",
    cover: { kicker: "Workday field guide", title: "Auto-apply to Workday with better controls", subtitle: "Prepare one accurate profile. Make every exception visible.", cards: ["Source profile", "Employer questions", "Submission receipt"], accent: C.signal },
    info1: { type: "cards", kicker: "Source profile", title: "Prepare these facts once", subtitle: "Accurate source information prevents the same error from spreading.", columns: 3, items: [
      { title: "Identity", body: "Legal name and contact details." },
      { title: "Work history", body: "Titles, employers, and exact dates." },
      { title: "Education", body: "Degrees, licenses, certifications." },
      { title: "Authorization", body: "Sponsorship and work eligibility.", tone: "amber" },
      { title: "Preferences", body: "Location, travel, salary guidance." },
      { title: "Approved answers", body: "Reusable only while still true.", tone: "lime" },
    ]},
    info2: { type: "cards", kicker: "Submission flow", title: "A controlled Workday workflow", subtitle: "Every application should use the right profile, document, and answer path.", columns: 3, items: [
      { title: "Match profile", body: "Select the correct role strategy." },
      { title: "Check eligibility", body: "Apply non-negotiable filters." },
      { title: "Choose resume", body: "Original or approved tailored copy." },
      { title: "Escalate", body: "Pause on sensitive uncertainty.", tone: "amber" },
      { title: "Save receipt", body: "Record job, date, status, and version.", tone: "lime" },
    ]},
  },
  {
    slug: "is-using-a-job-application-bot-safe",
    cover: { kicker: "Safety guide", title: "Job application bots are not risk-free", subtitle: "Check platform rules, data handling, answers, resumes, and control.", cards: ["Read the rules", "Protect the truth", "Keep a stop button"], accent: C.amber },
    info1: { type: "cards", kicker: "Risk map", title: "Six risks to evaluate", subtitle: "Safety is broader than submission speed.", columns: 3, items: [
      { title: "Platform rules", body: "Automation may be prohibited.", tone: "amber" },
      { title: "Wrong answers", body: "Never infer sensitive facts.", tone: "amber" },
      { title: "Resume changes", body: "Tailoring can become fabrication.", tone: "amber" },
      { title: "Wrong-fit jobs", body: "Volume can hide matching failures." },
      { title: "Data exposure", body: "Credentials and personal records." },
      { title: "Lost control", body: "Unwanted applications may continue." },
    ]},
    info2: { type: "cards", kicker: "Safer controls", title: "The operational safeguards to demand", subtitle: "No control overrides platform terms, but these reduce preventable errors.", columns: 3, items: [
      { title: "Approval mode", body: "Review jobs before submission." },
      { title: "Hard filters", body: "Block ineligible applications." },
      { title: "Original resume", body: "Preserve a truthful source." },
      { title: "Ask-don't-guess", body: "Escalate sensitive questions.", tone: "amber" },
      { title: "Duplicate check", body: "Detect repeat requisitions." },
      { title: "Receipt + pause", body: "See the work and stop it fast.", tone: "lime" },
    ]},
  },
  {
    slug: "pay-someone-to-apply-for-jobs-for-you",
    cover: { kicker: "Delegation guide", title: "Pay someone to apply for jobs for you", subtitle: "Choose the right scope, controls, and evidence before handing off your search.", cards: ["Define the search", "Protect your answers", "Review the proof"], accent: C.signal },
    info1: { type: "cards", kicker: "Service levels", title: "Four ways to delegate applications", subtitle: "The right choice depends on which decisions you want to keep.", columns: 2, items: [
      { title: "Freelance VA", body: "Flexible execution that needs your training and supervision." },
      { title: "Managed service", body: "Defined profiles, records, and an operating process.", tone: "lime" },
      { title: "AI assistant", body: "Lower-cost execution for clear, repeatable searches." },
      { title: "Reverse recruiter", body: "Broader strategy, outreach, networking, and coaching.", tone: "amber" },
    ]},
    info2: { type: "cards", kicker: "Buyer checklist", title: "Settle this before the first application", subtitle: "A written operating brief protects speed and accuracy.", columns: 3, items: [
      { title: "Target roles", body: "Titles, seniority, location, and exclusions." }, { title: "Hard answers", body: "Salary, sponsorship, clearance, travel.", tone: "amber" },
      { title: "Resume rules", body: "Approved versions and truthful edits." }, { title: "Approval mode", body: "Review each job or permit strict profiles." },
      { title: "Evidence", body: "Job, date, answers, file, and status.", tone: "lime" }, { title: "Stop control", body: "Pause or change direction quickly." },
    ]},
  },
  {
    slug: "best-job-application-services-2026",
    cover: { kicker: "2026 buyer guide", title: "Best job application services in 2026", subtitle: "Compare human, AI, and reverse recruiting options by their actual work.", cards: ["Human service", "AI assistant", "Reverse recruiter"], accent: C.brand },
    info1: { type: "cards", kicker: "Shortlist", title: "Match the service to the job", subtitle: "Best means best fit for your search, budget, and control.", columns: 3, items: [
      { title: "Scout Human", body: "Human execution, communication, and detailed evidence.", tone: "lime" }, { title: "Scout AI", body: "Lower-cost throughput for clear job profiles." },
      { title: "Scale.jobs", body: "Large one-time human application bundles." }, { title: "ApplyAll", body: "Managed packages with human review." },
      { title: "JobCopilot", body: "AI discovery, applying, and career tools." }, { title: "LazyApply", body: "Bulk applications on supported sites.", tone: "amber" },
    ]},
    info2: { type: "split", kicker: "Decision guide", title: "Human service or automation?", subtitle: "Choose based on ambiguity, risk, and desired supervision.", rightTone: "amber", sides: [
      { title: "Human-led fits when", items: ["Forms contain frequent exceptions", "You want direct communication", "Detailed evidence matters", "The search needs judgment"] },
      { title: "Automation fits when", items: ["Profiles are narrow and repeatable", "Budget is the main constraint", "You will audit early results", "Supported sites cover targets"] },
    ]},
  },
  {
    slug: "job-application-service-cost",
    cover: { kicker: "Pricing guide", title: "How much does a job application service cost?", subtitle: "Compare total cost per qualified application, not sticker price alone.", cards: ["Price model", "Work included", "Quality cost"], accent: C.amber },
    info1: { type: "cards", kicker: "Price models", title: "How application services charge", subtitle: "Similar prices might include completely different work.", columns: 2, items: [
      { title: "Subscription", body: "Recurring access tied to usage limits or features." }, { title: "Application bundle", body: "One payment for a stated number of submissions.", tone: "lime" },
      { title: "Hourly assistant", body: "Labor time, including training and corrections." }, { title: "Full engagement", body: "Strategy, outreach, coaching, and applications.", tone: "amber" },
    ]},
    info2: { type: "cards", kicker: "True cost", title: "Cost per qualified application", subtitle: "Remove wrong-fit, duplicate, and unverifiable submissions.", columns: 3, items: [
      { title: "Service fee", body: "Base plan plus required add-ons." }, { title: "Your time", body: "Setup, review, and correction hours." }, { title: "Wrong-fit loss", body: "Work outside the approved profile.", tone: "amber" },
      { title: "Duplicate loss", body: "Repeated work on one requisition." }, { title: "Unused credits", body: "Volume that expires or stays idle." }, { title: "Qualified total", body: "Verified work that met your rules.", tone: "lime" },
    ]},
  },
  {
    slug: "virtual-assistant-for-job-applications",
    cover: { kicker: "Hiring guide", title: "Virtual assistant for job applications", subtitle: "Understand costs, training, privacy risks, and managed alternatives.", cards: ["Write the brief", "Run a pilot", "Audit the evidence"], accent: C.signal },
    info1: { type: "cards", kicker: "Operating system", title: "What an assistant needs before starting", subtitle: "A resume alone does not support safe delegation.", columns: 3, items: [
      { title: "Search profiles", body: "Targets, exclusions, and eligibility." }, { title: "Answer library", body: "Verified recurring responses." }, { title: "Resume policy", body: "Approved files and edits." },
      { title: "Escalation list", body: "Questions that return to you.", tone: "amber" }, { title: "Application log", body: "Job, status, answers, and file." }, { title: "Quality review", body: "Audit before raising volume.", tone: "lime" },
    ]},
    info2: { type: "split", kicker: "Tradeoffs", title: "Independent VA vs managed service", subtitle: "The difference is who builds and supervises the process.", rightTone: "amber", sides: [
      { title: "Managed service", items: ["Provides a defined workflow", "Centralizes profiles and records", "Includes support coverage", "Reduces direct supervision"] },
      { title: "Independent VA", items: ["Offers flexible task scope", "Needs candidate-led training", "Requires your security process", "Leaves quality control with you"] },
    ]},
  },
  {
    slug: "job-search-concierge-vs-reverse-recruiter",
    cover: { kicker: "Service comparison", title: "Job search concierge vs reverse recruiter", subtitle: "Separate application execution from strategy, outreach, and coaching.", cards: ["Execution", "Strategy", "Outreach"], accent: C.brand },
    info1: { type: "split", kicker: "Scope", title: "Where the two services differ", subtitle: "Names vary, so compare the written deliverables.", rightTone: "amber", sides: [
      { title: "Job search concierge", items: ["Finds and submits suitable jobs", "Manages forms and records", "Handles recurring questions", "Focuses on operational workload"] },
      { title: "Reverse recruiter", items: ["Builds a wider strategy", "Adds networking and outreach", "Often includes interview coaching", "Focuses on the whole campaign"] },
    ]},
    info2: { type: "cards", kicker: "Selection", title: "Questions that reveal the real scope", subtitle: "Ask for direct answers before comparing prices.", columns: 3, items: [
      { title: "Who finds jobs?", body: "Candidate, assistant, or shared queue?" }, { title: "Who applies?", body: "Human, software, or both?" }, { title: "Who networks?", body: "Is outreach included?", tone: "amber" },
      { title: "What is logged?", body: "Files, answers, status, proof." }, { title: "How is fit set?", body: "Written profiles or messages?" }, { title: "How is success judged?", body: "Work, interviews, or a promise?", tone: "lime" },
    ]},
  },
  {
    slug: "human-vs-ai-job-application-service",
    cover: { kicker: "Decision guide", title: "Human vs AI job application service", subtitle: "Choose by ambiguity, oversight, evidence, and budget—not hype.", cards: ["Map the search", "Choose the lane", "Audit the work"], accent: C.brand },
    info1: { type: "split", kicker: "Best fit", title: "Choose the assistant for the search", subtitle: "The more exceptions a search creates, the more valuable human judgment becomes.", rightTone: "amber", sides: [
      { title: "AI fits when", items: ["Targets are narrow and repeatable", "Approved answers cover most forms", "Budget is the main constraint", "You can audit early results"] },
      { title: "Human fits when", items: ["Roles or industries are changing", "Forms create frequent exceptions", "Direct communication matters", "Detailed answer evidence is required"] },
    ]},
    info2: { type: "cards", kicker: "Buyer scorecard", title: "Compare the workflow, not the label", subtitle: "Human and AI services both need visible operating controls.", columns: 3, items: [
      { title: "Fit rules", body: "Roles, seniority, location, and exclusions." }, { title: "Answer policy", body: "What is reused, inferred, or escalated?", tone: "amber" },
      { title: "Resume control", body: "Original source plus exact sent versions." }, { title: "Evidence", body: "Job, status, file, and important answers.", tone: "lime" },
      { title: "Stop control", body: "Pause or change direction quickly." }, { title: "True cost", body: "Qualified output plus your review time." },
    ]},
  },
  {
    slug: "reverse-recruiter-cost",
    cover: { kicker: "Pricing guide", title: "What does a reverse recruiter cost?", subtitle: "Compare fixed fees, monthly retainers, and post-offer percentages.", cards: ["Map the scope", "Model the fee", "Read the guarantee"], accent: C.amber },
    info1: { type: "cards", kicker: "Fee models", title: "Reverse recruiter fee models", subtitle: "The headline fee is only useful when the scope and duration are clear.", columns: 2, items: [
      { title: "Fixed program fee", body: "One price for a defined campaign and set of deliverables." }, { title: "Monthly retainer", body: "Recurring fee while sourcing, outreach, and support continue." },
      { title: "Success fee", body: "A percentage or fixed amount becomes due after an accepted offer.", tone: "amber" }, { title: "Hybrid", body: "An upfront or monthly fee plus a post-offer payment.", tone: "lime" },
    ]},
    info2: { type: "cards", kicker: "Contract check", title: "Calculate the whole engagement", subtitle: "Model a realistic search before comparing providers.", columns: 3, items: [
      { title: "Setup fee", body: "Documents, positioning, and onboarding." }, { title: "Monthly cost", body: "Multiply by a realistic duration." }, { title: "Success fee", body: "Apply the percentage to expected salary.", tone: "amber" },
      { title: "Add-ons", body: "Coaching, extra profiles, or outreach." }, { title: "Cancellation", body: "Notice, pauses, and unused time." }, { title: "Guarantee", body: "Eligibility, remedy, and exclusions.", tone: "lime" },
    ]},
  },
  {
    slug: "reverse-recruiter-vs-career-coach-vs-job-application-service",
    cover: { kicker: "Service map", title: "Reverse recruiter, coach, or application service?", subtitle: "Buy advice, application execution, or a managed campaign intentionally.", cards: ["Advice", "Execution", "Full campaign"], accent: C.signal },
    info1: { type: "cards", kicker: "Three models", title: "Match the service to the bottleneck", subtitle: "Similar marketing language can hide very different deliverables.", columns: 3, items: [
      { title: "Career coach", body: "Improves direction, positioning, skills, and decisions." }, { title: "Application service", body: "Finds, completes, and records suitable applications.", tone: "lime" },
      { title: "Reverse recruiter", body: "Runs a broader search with outreach and support.", tone: "amber" },
    ]},
    info2: { type: "cards", kicker: "Scope worksheet", title: "Mark the work you actually need", subtitle: "A written task list makes proposals comparable.", columns: 3, items: [
      { title: "Direction", body: "Target role, level, and market." }, { title: "Positioning", body: "Resume, LinkedIn, and narrative." }, { title: "Applications", body: "Sourcing, forms, and tracking.", tone: "lime" },
      { title: "Outreach", body: "Recruiters, managers, and network." }, { title: "Interviews", body: "Practice, feedback, and preparation." }, { title: "Negotiation", body: "Offer analysis and response.", tone: "amber" },
    ]},
  },
  {
    slug: "how-to-stop-auto-apply-tools-from-applying-to-wrong-jobs",
    cover: { kicker: "Quality controls", title: "Stop auto-apply from choosing wrong jobs", subtitle: "Use hard filters before fit scores, then audit the first batch.", cards: ["Block ineligible", "Rank the rest", "Audit per 100"], accent: C.amber },
    info1: { type: "split", kicker: "Decision order", title: "Eligibility before similarity", subtitle: "A strong keyword match cannot repair a disqualifying requirement.", rightTone: "amber", sides: [
      { title: "Block first", items: ["Wrong work authorization", "Unavailable location or work mode", "Required clearance or license missing", "Seniority or employment type mismatch"] },
      { title: "Rank second", items: ["Skills and responsibility overlap", "Relevant outcomes and industry", "Preferred tools and qualifications", "Posting age and candidate preference"] },
    ]},
    info2: { type: "cards", kicker: "Control loop", title: "Fix drift before adding volume", subtitle: "Every wrong-fit application should improve the rules that follow it.", columns: 3, items: [
      { title: "Pause", body: "Stop the queue after a pattern appears.", tone: "amber" }, { title: "Classify", body: "Name the rule that failed." }, { title: "Correct", body: "Add a hard filter or exclusion." },
      { title: "Review neighbors", body: "Inspect recent similar submissions." }, { title: "Pilot again", body: "Test a small new batch." }, { title: "Measure", body: "Track wrong fits per 100.", tone: "lime" },
    ]},
  },
  {
    slug: "how-to-prevent-duplicate-job-applications",
    cover: { kicker: "Tracking guide", title: "Prevent duplicate job applications", subtitle: "Normalize the employer, requisition, location, and source before submitting.", cards: ["Capture the job", "Check the key", "Save the receipt"], accent: C.brand },
    info1: { type: "cards", kicker: "Duplicate map", title: "Four listings that look alike", subtitle: "Not every repeated title is the same requisition.", columns: 2, items: [
      { title: "Exact duplicate", body: "The same employer requisition appears through two sources.", tone: "amber" }, { title: "Cross-posted role", body: "A board link redirects to the employer's original listing." },
      { title: "Reposted opening", body: "A new date may or may not carry a new requisition." }, { title: "Similar opening", body: "Same title, but a different team, location, or requisition.", tone: "lime" },
    ]},
    info2: { type: "cards", kicker: "Dedupe key", title: "Check these fields before submission", subtitle: "Use the strongest identifiers available, then preserve the decision.", columns: 3, items: [
      { title: "Employer", body: "Use a normalized company name." }, { title: "Requisition ID", body: "Prefer the employer's stable identifier.", tone: "lime" }, { title: "Canonical URL", body: "Strip tracking parameters." },
      { title: "Title + team", body: "Distinguish similar openings." }, { title: "Location", body: "Separate genuinely different roles." }, { title: "Prior channel", body: "Record referral, manual, or service.", tone: "amber" },
    ]},
  },
  {
    slug: "resume-version-control-for-job-applications",
    cover: { kicker: "Document integrity", title: "Resume version control", subtitle: "Preserve the source. Trace every tailored copy. Know what was submitted.", cards: ["Verified source", "Tailored copy", "Submitted artifact"], accent: C.brand },
    info1: { type: "cards", kicker: "Version chain", title: "Four layers protect resume truth", subtitle: "Each submitted file should trace back to verified facts.", columns: 2, items: [
      { title: "Source record", body: "Complete, verified career facts. Never tailored for one job.", tone: "lime" }, { title: "Role-family master", body: "Relevant facts arranged for one search." },
      { title: "Job-specific copy", body: "Permitted tailoring for one requisition." }, { title: "Submitted artifact", body: "Immutable record of what the employer received.", tone: "amber" },
    ]},
    info2: { type: "cards", kicker: "Quality check", title: "Check the facts, meaning, scope, and file", subtitle: "A polished document still fails if its claims drift.", columns: 3, items: [
      { title: "Facts", body: "Titles, dates, degrees, metrics, and tools." }, { title: "Meaning", body: "Rewording must preserve the original claim." }, { title: "Scope", body: "Support must not become ownership.", tone: "amber" },
      { title: "Relevance", body: "Choose evidence that fits the role." }, { title: "Keywords", body: "Use natural, truthful terminology." }, { title: "Final file", body: "Readable PDF linked to the job.", tone: "lime" },
    ]},
  },
  {
    slug: "what-proof-should-job-application-assistant-provide",
    cover: { kicker: "Evidence guide", title: "Proof behind every application", subtitle: "A total is not enough. Require a job-level receipt and document record.", cards: ["Job + requisition", "Resume used", "Answer evidence"], accent: C.signal },
    info1: { type: "cards", kicker: "Minimum receipt", title: "What every claimed submission should show", subtitle: "The record must identify the opportunity, document, and result.", columns: 3, items: [
      { title: "Job identity", body: "Employer, role, requisition, and canonical URL." }, { title: "Time + channel", body: "When and where the application was sent." }, { title: "True status", body: "Prepared, attempted, submitted, or confirmed.", tone: "amber" },
      { title: "Resume version", body: "The exact employer-facing file." }, { title: "Confirmation", body: "Reference, email, page, or portal signal.", tone: "lime" }, { title: "Exceptions", body: "Questions, decisions, and corrections." },
    ]},
    info2: { type: "cards", kicker: "Evidence depth", title: "Match proof to the field's risk", subtitle: "Structured records and selective screenshots serve different jobs.", columns: 3, items: [
      { title: "Routine fields", body: "Searchable data from the approved profile." }, { title: "Important answers", body: "Exact evidence for salary, eligibility, and clearance.", tone: "amber" }, { title: "Exceptions", body: "Why the work paused and who decided." },
      { title: "Documents", body: "Original, tailored, and submitted versions." }, { title: "Timeline", body: "Preparation, approval, submission, and failure." }, { title: "Privacy", body: "Redaction, access, retention, and deletion.", tone: "lime" },
    ]},
  },
  {
    slug: "can-job-application-service-change-your-resume-without-permission",
    cover: { kicker: "Permission guide", title: "Who can change your resume?", subtitle: "Define the editing boundary before a service applies in your name.", cards: ["Formatting", "Truthful tailoring", "Direct approval"], accent: C.amber },
    info1: { type: "cards", kicker: "Permission levels", title: "Three kinds of resume change", subtitle: "The more a change affects truth, the stronger its approval must be.", columns: 3, items: [
      { title: "Formatting", body: "Spacing, typography, page breaks, and punctuation.", tone: "lime" }, { title: "Editorial", body: "Selection, order, shortening, and truthful wording." }, { title: "Material", body: "Titles, dates, credentials, metrics, skills, and scope.", tone: "amber" },
    ]},
    info2: { type: "split", kicker: "Editing boundary", title: "Standing permission vs direct approval", subtitle: "Write the rule before the first tailored document.", rightTone: "amber", sides: [
      { title: "May be pre-approved", items: ["Reorder verified bullets", "Shorten unrelated experience", "Use accurate role language", "Adjust layout and summary"] },
      { title: "Approve directly", items: ["Titles, employers, or dates", "Skills and certifications", "Metrics and leadership scope", "Eligibility or disclosure facts"] },
    ]},
  },
  {
    slug: "can-auto-apply-get-your-job-board-account-restricted",
    cover: { kicker: "Platform rules", title: "Can auto-apply restrict your account?", subtitle: "Pacing is not permission. Check the rule and the actual submission route.", cards: ["Read the terms", "Map the workflow", "Keep a stop control"], accent: C.amber },
    info1: { type: "cards", kicker: "Before connecting", title: "Answer these platform questions first", subtitle: "“Supports this job board” does not explain what the tool does there.", columns: 2, items: [
      { title: "Where does it act?", body: "Personal account, employer ATS, or approved integration?", tone: "amber" }, { title: "What is automated?", body: "Discovery, preparation, form entry, or submission?" },
      { title: "What do rules allow?", body: "Check the current terms for that exact workflow." }, { title: "How does it stop?", body: "Pause instantly and preserve the activity log.", tone: "lime" },
    ]},
    info2: { type: "cards", kicker: "Restriction response", title: "What to do after a restriction notice", subtitle: "Follow the platform's recovery path; do not try to evade enforcement.", columns: 3, items: [
      { title: "Pause", body: "Stop the tool or service immediately.", tone: "amber" }, { title: "Disconnect", body: "Disable involved extensions and software." }, { title: "Preserve", body: "Save the notice and activity records." },
      { title: "Secure", body: "Review sessions, access, and account security." }, { title: "Appeal", body: "Use the platform's official support process." }, { title: "Audit", body: "Check whether other applications continued.", tone: "lime" },
    ]},
  },
  {
    slug: "application-volume-vs-interview-rate",
    cover: { kicker: "Measurement guide", title: "Volume vs interview rate", subtitle: "Count qualified applications, process errors, time saved, and outcomes together.", cards: ["Useful throughput", "Quality controls", "Interview outcomes"], accent: C.signal },
    info1: { type: "cards", kicker: "Core scorecard", title: "Start with qualified applications", subtitle: "Raw submissions are not a useful denominator when they break your rules.", columns: 3, items: [
      { title: "Qualified apps", body: "Roles that met the profile at submission.", tone: "lime" }, { title: "Wrong-fit rate", body: "Targeting failures per 100 submitted.", tone: "amber" }, { title: "Duplicate rate", body: "Repeated requisitions that escaped controls." },
      { title: "Correction rate", body: "Material document or answer repairs." }, { title: "Evidence rate", body: "Submissions with the required receipt." }, { title: "Interview rate", body: "Interviews per 100 qualified applications." },
    ]},
    info2: { type: "cards", kicker: "Balanced measurement", title: "Four views of a healthy search", subtitle: "A single headline number cannot diagnose the campaign.", columns: 2, items: [
      { title: "Volume", body: "How much application work was completed." }, { title: "Quality", body: "Fit, accuracy, duplicates, and evidence.", tone: "lime" },
      { title: "Efficiency", body: "Candidate time and service cost required." }, { title: "Outcomes", body: "Assessments, screens, and live interviews.", tone: "amber" },
    ]},
  },
  {
    slug: "job-search-while-working-full-time",
    cover: { kicker: "Job search strategy", title: "Job search while working full time", subtitle: "A five-hour weekly plan that does not eat every evening", cards: ["5 focused hours a week", "Batch, don't sprinkle", "Protect sleep and one day off"], accent: C.signal },
    info1: {"type": "cards", "kicker": "Time per application", "title": "Where one application's time goes", "subtitle": "The form averages under 5 minutes. The rest is everything around it.", "columns": 3, "items": [{"title": "Find the role", "body": "Search, filter and read the posting properly"}, {"title": "Check fit", "body": "Decide yes, maybe or no against your criteria"}, {"title": "Tailor resume", "body": "Adjust summary and top bullets for the role family"}, {"title": "Screening answers", "body": "Work authorization, notice, salary range, short answers"}, {"title": "Fill the form", "body": "Avg 4 min 52 sec and 51 clicks (Fortune 500 audit)", "tone": "lime"}, {"title": "Log and follow up", "body": "Record version, contact and next step in your tracker", "tone": "amber"}]},
    info2: {"type": "cards", "kicker": "Sample weekly plan", "title": "A 5-hour job search week", "subtitle": "Fixed blocks around a standard workday, with Sunday off", "columns": 3, "items": [{"title": "Mon lunch, 30 min", "body": "Triage alerts into yes, maybe and no"}, {"title": "Tue evening, 60 min", "body": "Tailor 2 to 3 resume versions for the yes list"}, {"title": "Wed lunch, 30 min", "body": "Send two networking or referral messages"}, {"title": "Thu evening, 90 min", "body": "Submission batch: 3 to 5 complete applications", "tone": "lime"}, {"title": "Sat morning, 60 min", "body": "Follow-ups, tracker update, interview prep"}, {"title": "Sunday, off", "body": "Rest. The pipeline will still be there Monday", "tone": "amber"}]},
  },
  {
    slug: "how-to-job-search-without-employer-finding-out",
    cover: { kicker: "Confidential job search", title: "Job search without your boss knowing", subtitle: "Settings, habits and scripts for a discreet search while employed", cards: ["Personal devices only", "LinkedIn: Recruiters only", "Updates sharing off"], accent: C.amber },
    info1: {"type": "cards", "kicker": "LinkedIn settings", "title": "Check these before you edit LinkedIn", "subtitle": "Defaults cause most accidental reveals", "columns": 2, "items": [{"title": "Open to Work: Recruiters only", "body": "Limits it to Recruiter users. LinkedIn can't guarantee privacy", "tone": "lime"}, {"title": "Share profile updates: off", "body": "Stops feed posts and alerts. Visitors still see changes"}, {"title": "Private mode browsing", "body": "Shows you as LinkedIn Member when viewing profiles"}, {"title": "Mark current job as current", "body": "LinkedIn uses it to hide Open to Work from your employer", "tone": "amber"}]},
    info2: {"type": "split", "kicker": "Risk check", "title": "Lower-risk vs higher-risk moves", "subtitle": "Small defaults decide whether your search stays private", "rightTone": "amber", "sides": [{"title": "Lower risk", "items": ["Personal phone, laptop and email", "References from former colleagues", "Early, lunch or late interview slots", "Gradual profile edits, sharing off"]}, {"title": "Higher risk", "items": ["Work laptop, email or office Wi-Fi", "Public #OpenToWork frame", "Telling friends at work", "Suit on a T-shirt day"]}]},
  },
  {
    slug: "do-recruitment-agencies-take-a-percentage-of-your-salary",
    cover: { kicker: "Recruitment fees explained", title: "Do recruiters take a cut of your salary?", subtitle: "Employers pay placement fees. Here is who pays what, and when a fee is a red flag.", cards: ["Employer pays the fee", "Temp markups vs your pay", "Upfront fees: red flag"], accent: C.amber },
    info1: {"type": "cards", "kicker": "Fee models", "title": "Who pays the recruiter", "subtitle": "Permanent placement fees come from the employer, not your paycheck.", "columns": 2, "items": [{"title": "Contingency recruiter", "body": "Employer pays about 20-25% of first-year pay, only on a hire.", "tone": "lime"}, {"title": "Retained search", "body": "Employer pays about 33% of first-year pay, success or not.", "tone": "lime"}, {"title": "Temp or contract staffing", "body": "Client pays a markup on your hourly rate. Get your rate in writing."}, {"title": "Upfront candidate fee", "body": "Fee before any placement or a job promise: treat as a likely scam.", "tone": "amber"}]},
    info2: {"type": "split", "kicker": "Before you pay anyone", "title": "Red flags vs safe signs", "subtitle": "Quick checks when an agency or service asks you for money.", "rightTone": "amber", "sides": [{"title": "Safe signs", "items": ["Employer pays the placement fee", "Licensed or registered agency", "Written scope, price and refunds", "Proof of every application"]}, {"title": "Red flags", "items": ["Fee before any interview", "Guaranteed job for money", "Cut of salary after you join", "Cash or personal account, no receipt"]}]},
  },
  {
    slug: "job-application-service-no-interviews",
    cover: { kicker: "When interviews don't come", title: "No interviews from your application service?", subtitle: "Benchmarks, what a service controls, how to read guarantees, and what to fix first.", cards: ["Tailored: ~5.7% interview rate", "Audit 10 applications", "No honest interview guarantee"], accent: C.signal },
    info1: {"type": "split", "kicker": "Fair expectations", "title": "What a service can and can't control", "subtitle": "Judge the service on what is actually in its hands.", "rightTone": "amber", "sides": [{"title": "Service controls", "items": ["Which jobs match your rules", "Resume tailoring quality", "Accurate form answers", "Proof of what was sent"]}, {"title": "Outside its control", "items": ["Employer hiring decisions", "Referrals and networking", "Your interview performance", "Ghost jobs and hiring freezes"]}]},
    info2: {"type": "cards", "kicker": "Diagnostic checklist", "title": "When interviews don't come", "subtitle": "Wait 3-4 weeks and 50+ applications, then check in this order.", "columns": 3, "items": [{"title": "1. Targeting", "body": "Open 10 applications. Would you have applied to each one?", "tone": "lime"}, {"title": "2. Resume", "body": "Tailored per role, true, and clear on your target in seconds.", "tone": "lime"}, {"title": "3. Location and visa", "body": "Check authorization answers and remote-only limits."}, {"title": "4. Volume and source", "body": "Steady pace, with more career-site applications than boards."}, {"title": "5. Timing", "body": "Median 23 days to a first interview. Week two is early."}, {"title": "6. Your side", "body": "Reply to recruiters within a day; align LinkedIn and resume.", "tone": "amber"}]},
  },
  {
    slug: "how-to-tailor-resume-without-lying",
    cover: { kicker: "Job search strategy", title: "Tailor your resume without lying", subtitle: "Change the emphasis and wording. Never change the facts.", cards: ["Mirror real skills", "Reorder by relevance", "Titles and dates stay true"], accent: C.signal },
    info1: {"type": "cards", "kicker": "How ATS screen", "title": "Where resumes actually get filtered", "subtitle": "Most automatic rejections come from form answers, not bullet wording.", "columns": 3, "items": [{"title": "Parsing", "body": "Software splits your file into fields. Plain layouts parse best.", "tone": "lime"}, {"title": "Knockout questions", "body": "Yes/no form answers like work authorization can auto-reject.", "tone": "amber"}, {"title": "Recruiter search", "body": "Recruiters filter by skills and titles. Use their exact terms.", "tone": "lime"}]},
    info2: {"type": "split", "kicker": "Where the line is", "title": "Honest tailoring vs fabrication", "subtitle": "You may change how a true fact is presented, not the fact.", "rightTone": "amber", "sides": [{"title": "Honest tailoring", "items": ["Reorder bullets by relevance", "Use the employer's term for real skills", "Add numbers you can defend", "Clarify an internal title in brackets"]}, {"title": "Fabrication", "items": ["Inflated or fake job titles", "Degrees you didn't finish", "Shifted or stretched dates", "Skills you've never used"]}]},
  },
  {
    slug: "how-to-spot-fake-job-postings",
    cover: { kicker: "Job search safety", title: "Spot fake and ghost jobs before you apply", subtitle: "A 5-minute check that protects your time and your money.", cards: ["Verify the domain", "Cross-check careers site", "Never pay to get hired"], accent: C.amber },
    info1: {"type": "split", "kicker": "Two different problems", "title": "Scam jobs vs ghost jobs", "subtitle": "One steals from you. The other wastes your effort.", "rightTone": "amber", "sides": [{"title": "Ghost jobs", "items": ["Real company, no active hiring", "Old or repeatedly reposted", "Costs time and hope", "Fix: deprioritize, don't over-invest"]}, {"title": "Scam jobs", "items": ["Fake employer or spoofed brand", "Asks for money or bank details", "Unsolicited chat-app recruiting", "Fix: stop, verify, report"]}]},
    info2: {"type": "cards", "kicker": "Before you apply", "title": "The 5-minute verification routine", "subtitle": "One check per minute. Any failure means stop and verify.", "columns": 3, "items": [{"title": "1. Company domain", "body": "Official site exists and recruiter email uses that domain.", "tone": "lime"}, {"title": "2. Careers site", "body": "Same role, title, and location on the company's own page.", "tone": "lime"}, {"title": "3. LinkedIn page", "body": "Real employees, active page, consistent location.", "tone": "lime"}, {"title": "4. Recruiter identity", "body": "Profile shows real history at the company.", "tone": "lime"}, {"title": "5. Posting age", "body": "Posted recently, not reposted every few weeks.", "tone": "amber"}, {"title": "Red line", "body": "Any request to pay, deposit a check, or share bank details.", "tone": "amber"}]},
  },
  {
    slug: "how-many-jobs-to-apply-for-per-week",
    cover: { kicker: "Job search strategy", title: "How many jobs to apply to per week", subtitle: "A calculator for employed searchers, built on your own interview rate", cards: ["Start at 5 to 15 a week", "Add warm attempts", "Adjust after 4 weeks"], accent: C.signal },
    info1: {"type": "cards", "kicker": "Weekly plan", "title": "Size your week from interviews", "subtitle": "Work backward from the interviews you want, not a quota", "columns": 2, "items": [{"title": "Pick a target", "body": "Choose first-round interviews you want in the next 8 to 12 weeks", "tone": "lime"}, {"title": "Measure your rate", "body": "Screens per qualified application over your last 30 to 50", "tone": "lime"}, {"title": "Divide", "body": "Target ÷ rate = qualified applications; ÷ weeks = weekly number"}, {"title": "Add warm attempts", "body": "One to three referral or network asks per week", "tone": "amber"}]},
    info2: {"type": "split", "kicker": "Adjusting volume", "title": "When to raise or cut your number", "subtitle": "Change one variable at a time, after cohorts have had time to respond", "rightTone": "amber", "sides": [{"title": "Increase when", "items": ["Rate is healthy, calendar is thin", "More good roles than time", "Your timeline is shrinking", "Screens convert to rounds"]}, {"title": "Hold or cut when", "items": ["Rate under 2% after 50 apps", "Two or more active loops", "Work or sleep is slipping", "Pivoting: shift to warm paths"]}]},
  },
  {
    slug: "best-time-to-apply-for-jobs",
    cover: { kicker: "Application timing", title: "Does the time you apply matter?", subtitle: "Posting age beats the clock. What the evidence supports and what it does not", cards: ["Apply in the first days", "Exact hour: weak evidence", "Check postings twice daily"], accent: C.amber },
    info1: {"type": "cards", "kicker": "A posting's life", "title": "Why early in the posting matters", "subtitle": "Applications and screening both cluster in the first weeks", "columns": 3, "items": [{"title": "Week one", "body": "Inbound volume runs 2.5 to 3x higher than later weeks", "tone": "lime"}, {"title": "First screens", "body": "Non-interviewed candidates archived in about 6 days (median)", "tone": "lime"}, {"title": "Later weeks", "body": "Shortlist may be full; strong fits are still worth a try", "tone": "amber"}]},
    info2: {"type": "cards", "kicker": "Daily routine", "title": "Catch new postings while fresh", "subtitle": "A system beats a 6 a.m. alarm", "columns": 3, "items": [{"title": "Daily alerts", "body": "One alert per role family and location, sorted by newest", "tone": "lime"}, {"title": "Two checks", "body": "Morning and evening catch most roles within 12 hours"}, {"title": "Ten-minute triage", "body": "Apply today, this week, or skip"}, {"title": "One focused block", "body": "Tailor and submit same-day roles in 45 to 60 minutes", "tone": "lime"}, {"title": "Weekly sweep", "body": "Catch strong fits posted 5 to 14 days ago"}, {"title": "Track posting age", "body": "Log days since posted to see what converts for you", "tone": "amber"}]},
  },
  {
    slug: "how-to-choose-target-role-before-applying",
    cover: { kicker: "Job search strategy", title: "Pick a target role before you apply", subtitle: "A one-week process for mixed, mid-career skill sets", cards: ["3 candidate titles", "20 real postings", "1 primary + 1 backup"], accent: C.signal },
    info1: {"type": "cards", "kicker": "The one-week plan", "title": "From mixed skills to one clear title", "subtitle": "60 to 90 minutes a day, in this order", "columns": 3, "items": [{"title": "Day 1: Inventory", "body": "List 15 to 25 skills, each with proof and an energy score", "tone": "lime"}, {"title": "Day 2: Map", "body": "Turn your top skills into 3 titles using O*NET and BLS data"}, {"title": "Days 3-4: Validate", "body": "Tally keywords across 20 real postings per title"}, {"title": "Days 5-6: Interview", "body": "Ask 1 or 2 people per title what the job is really like"}, {"title": "Day 7: Decide", "body": "Choose a primary and a backup that share keywords", "tone": "lime"}, {"title": "Then: Dealbreakers", "body": "Set work arrangement, salary floor, and contract type", "tone": "amber"}]},
    info2: {"type": "split", "kicker": "Target role worksheet", "title": "Write it down before you apply", "subtitle": "If you cannot fill this in, you are not ready to apply at volume", "rightTone": "amber", "sides": [{"title": "Your target", "items": ["Primary title and synonyms", "Backup title and synonyms", "Top 5 proof points", "One-sentence pitch"]}, {"title": "Your dealbreakers", "items": ["Remote, hybrid, or on-site", "Base salary floor", "Contract type", "Industries to exclude"]}]},
  },
  {
    slug: "how-to-help-your-partner-find-a-job",
    cover: { kicker: "Job search strategy", title: "Helping your partner find a job", subtitle: "What actually helps, what backfires, and a weekly script", cards: ["Support they ask for", "Consent before action", "One weekly check-in"], accent: C.amber },
    info1: {"type": "cards", "kicker": "Pick two roles, not all five", "title": "Ways a partner can genuinely help", "subtitle": "Ask which ones they want, then do only those", "columns": 2, "items": [{"title": "Admin support", "body": "Set up a tracker, organize documents, research companies", "tone": "lime"}, {"title": "Accountability partner", "body": "Hold a weekly check-in where they set their own targets"}, {"title": "Mock interviewer", "body": "Practice questions, then give one strength and one fix"}, {"title": "Connector", "body": "Ask contacts to talk with your partner, then step aside", "tone": "amber"}]},
    info2: {"type": "split", "kicker": "Weekly check-in", "title": "20 minutes, once a week, then stop", "subtitle": "Your partner leads. You mostly ask.", "rightTone": "amber", "sides": [{"title": "Ask", "items": ["What went well this week?", "What felt hardest?", "What is next week's plan?", "What do you want from me?"]}, {"title": "Avoid", "items": ["Daily 'did you apply?' questions", "Applying without consent", "Logging in to their accounts", "Comparing them to others"]}]},
  },
];

const requestedSlug = process.argv[2];
const selectedPosts = requestedSlug ? posts.filter((post) => post.slug === requestedSlug) : posts;
if (requestedSlug && selectedPosts.length === 0) throw new Error(`Unknown blog slug: ${requestedSlug}`);

for (const post of selectedPosts) {
  const assets = [
    [`${post.slug}-cover.webp`, cover(post.cover), 1200, 628],
    [`${post.slug}-infographic-1.webp`, post.info1.type === "split" ? splitGraphic(post.info1) : cardsGraphic(post.info1), 1200, 800],
    [`${post.slug}-infographic-2.webp`, post.info2.type === "split" ? splitGraphic(post.info2) : cardsGraphic(post.info2), 1200, 800],
  ];
  for (const [name, svg, width, height] of assets) {
    await sharp(Buffer.from(svg))
      .resize(width, height)
      .webp({ quality: 92, effort: 5 })
      .toFile(path.join(OUT, name));
  }
}

console.log(`Generated ${selectedPosts.length * 3} Scout blog visuals in ${OUT}`);
