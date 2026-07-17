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
    <rect x="72" y="126" width="178" height="34" rx="17" fill="${config.accent || C.signal}"/>
    <text x="161" y="149" fill="${C.white}" font-family="${font}" font-size="15" font-weight="700" text-anchor="middle" letter-spacing="1.2">${esc(config.kicker.toUpperCase())}</text>
    ${title}
    ${textBlock(config.subtitle, 72, titleBottom + 56, { max: 48, size: 23, weight: 500, fill: "#C8D7C0", lineHeight: 1.35 })}
    ${visualCards}
    <rect x="72" y="560" width="1056" height="1" fill="${C.white}" opacity=".14"/>
    <text x="72" y="596" fill="${C.lime}" font-family="${font}" font-size="17" font-weight="700">getscout.app</text>
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
    <rect x="64" y="112" width="180" height="30" rx="15" fill="${config.accentPale || C.signalPale}"/>
    <text x="154" y="133" fill="${config.accent || C.signal}" font-family="${font}" font-size="13" font-weight="700" text-anchor="middle" letter-spacing="1.1">${esc(config.kicker.toUpperCase())}</text>
    ${textBlock(config.title, 64, 196, { max: 42, size: 42, weight: 700, fill: C.ink, lineHeight: 1.12 })}
    ${textBlock(config.subtitle, 64, 258, { max: 86, size: 19, weight: 500, fill: C.soft, lineHeight: 1.25 })}
  `;
}

function footer() {
  return `<rect x="64" y="750" width="1072" height="1" fill="${C.ink}" opacity=".12"/>
    <text x="64" y="780" fill="${C.muted}" font-family="${font}" font-size="14" font-weight="600">SCOUT FIELD GUIDE</text>
    <text x="1136" y="780" fill="${C.ink}" font-family="${font}" font-size="14" font-weight="700" text-anchor="end">getscout.app</text>`;
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
];

for (const post of posts) {
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

console.log(`Generated ${posts.length * 3} Scout blog visuals in ${OUT}`);
