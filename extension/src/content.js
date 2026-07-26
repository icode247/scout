function cleanScoutValue(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeScoutLocation(value) {
  const unavailable = /^(?:unavailable|unknown|not available|not specified|n\/a|null|undefined|-)$/i;
  const parts = cleanScoutValue(value)
    .split(/\s*[,|•]\s*/)
    .map(cleanScoutValue)
    .filter((part) => part && !unavailable.test(part));
  return [...new Set(parts.map((part) => part.toUpperCase() === "USA" ? "US" : part))].join(", ");
}

function normalizeScoutEmploymentType(value) {
  const raw = cleanScoutValue(value);
  if (!raw) return "";
  const normalized = raw.toLowerCase().replace(/[\s_]+/g, "-");
  const labels = {
    "full-time": "Full-time",
    "part-time": "Part-time",
    contract: "Contract",
    contractor: "Contract",
    temporary: "Temporary",
    intern: "Internship",
    internship: "Internship",
    volunteer: "Volunteer",
    "per-diem": "Per diem",
    other: "Other",
  };
  return labels[normalized] || raw.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function extractScoutJobFallback() {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const text = (...selectors) => {
    for (const selector of selectors.flat()) {
      const node = document.querySelector(selector);
      const value = clean(node?.textContent || node?.getAttribute?.("content"));
      if (value) return value;
    }
    return "";
  };
  const directText = (...selectors) => {
    for (const selector of selectors.flat()) {
      const node = document.querySelector(selector);
      if (!node) continue;
      const ownText = [...node.childNodes].filter((child) => child.nodeType === 3).map((child) => clean(child.textContent)).filter(Boolean).join(" ");
      const value = ownText || clean(node.getAttribute?.("aria-label")) || clean(node.textContent);
      if (value) return value.replace(/\(opens in a new tab\)/gi, "").trim();
    }
    return "";
  };
  const ldItems = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((node) => {
    try {
      const parsed = JSON.parse(node.textContent || "null");
      const queue = Array.isArray(parsed) ? parsed : [parsed];
      return queue.flatMap((item) => item?.["@graph"] || [item]);
    } catch { return []; }
  });
  const jobLd = ldItems.find((item) => {
    const type = item?.["@type"];
    return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
  });
  const htmlText = (value) => value ? clean(new DOMParser().parseFromString(String(value), "text/html").body.textContent) : "";
  const address = jobLd?.jobLocation?.address || jobLd?.jobLocation?.[0]?.address || {};
  const isRemote = clean(jobLd?.jobLocationType).toUpperCase().includes("TELECOMMUTE");
  const host = location.hostname.replace(/^www\./, "");
  const employmentTypeValue = Array.isArray(jobLd?.employmentType) ? jobLd.employmentType.join(", ") : jobLd?.employmentType;
  const salaryValue = jobLd?.baseSalary?.value || jobLd?.estimatedSalary?.value || {};
  const salaryCurrency = clean(jobLd?.baseSalary?.currency || jobLd?.estimatedSalary?.currency);
  const salaryUnit = clean(salaryValue.unitText).toLowerCase();
  const currencySymbol = ({ USD: "$", CAD: "C$", GBP: "£", EUR: "€", NGN: "₦", AUD: "A$" })[salaryCurrency] || (salaryCurrency ? `${salaryCurrency} ` : "");
  const amount = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return clean(value);
    return number >= 1000 && salaryUnit.includes("year") ? `${Math.round(number / 1000)}k` : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(number);
  };
  const structuredSalary = salaryValue.minValue != null || salaryValue.maxValue != null
    ? `${currencySymbol}${amount(salaryValue.minValue ?? salaryValue.value)}${salaryValue.maxValue != null ? `–${currencySymbol}${amount(salaryValue.maxValue)}` : ""}${salaryUnit ? ` / ${salaryUnit}` : ""}`
    : salaryValue.value != null ? `${currencySymbol}${amount(salaryValue.value)}${salaryUnit ? ` / ${salaryUnit}` : ""}` : "";

  let title = clean(jobLd?.title) || text(
    "[data-testid='job-title']", "[data-automation-id='jobPostingHeader'] h2",
    ".posting-headline h2", ".app-title", ".job-title", ".jobsearch-JobInfoHeader-title",
    "h1"
  );
  let company = clean(jobLd?.hiringOrganization?.name) || text(
    "[data-testid='company-name']", "[data-automation-id='company']",
    ".posting-headline .company", ".company-name", ".employer",
    ".jobsearch-InlineCompanyRating-companyHeader a", "[class*='CompanyName']", "[class*='company-name']"
  );
  let jobLocation = isRemote ? "Remote" : clean([
    address.addressLocality, address.addressRegion,
    typeof address.addressCountry === "object" ? address.addressCountry?.name : address.addressCountry,
  ].filter(Boolean).join(", ")) || text(
    "[data-testid='job-location']", "[data-automation-id='locations']",
    ".posting-categories .location", ".job-location", ".location",
    "[class*='JobLocation']", "[class*='job-location']"
  );
  let description = htmlText(jobLd?.description) || text(
    "[data-testid='job-description']", "[data-automation-id='jobPostingDescription']",
    "#jobDescriptionText", "#content", ".posting-page .content", ".posting .content",
    ".job-description", ".jobDescription", "[class*='JobDescription']",
    "[class*='job-description']", "[class*='jobDescription']", "main article", "main"
  );
  let employmentType = clean(employmentTypeValue) || text(
    "[data-testid='job-type']", "[data-automation-id='time']", "[data-automation-id='jobType']",
    ".posting-categories .commitment", ".job-type", "[class*='EmploymentType']", "[class*='employment-type']"
  );
  let salary = clean(structuredSalary) || text(
    "[data-testid='salary']", "[data-automation-id='salary']", "#salaryInfoAndJobType",
    ".salary", ".salary-range", "[class*='Salary']", "[class*='salary']"
  );

  const boardName = host.includes("linkedin.com") ? "linkedin" : host.includes("indeed.") ? "indeed" : host.includes("glassdoor.") ? "glassdoor" : host.includes("ziprecruiter.") ? "ziprecruiter" : host.includes("monster.") ? "monster" : host.includes("dice.com") ? "dice" : host.includes("simplyhired.") ? "simplyhired" : "";
  const boardSelectors = {
    linkedin: { title: [".job-details-jobs-unified-top-card__job-title h1",".jobs-unified-top-card__job-title",".top-card-layout__title"], company: [".job-details-jobs-unified-top-card__company-name a",".jobs-unified-top-card__company-name a",".topcard__org-name-link"], location: [".job-details-jobs-unified-top-card__primary-description-container .tvm__text",".jobs-unified-top-card__bullet",".jobs-unified-top-card__workplace-type"], employmentType: [".job-details-jobs-unified-top-card__job-insight span"], salary: [".job-details-jobs-unified-top-card__job-insight--highlight span",".salary-main-rail__data-amount"], description: [".jobs-description__content .jobs-box__html-content",".jobs-description__content","#job-details"] },
    indeed: { title: [".jobsearch-JobInfoHeader-title span","h1[data-testid=\"jobsearch-JobInfoHeader-title\"] span"], company: ["[data-testid=\"inlineHeader-companyName\"] a","[data-company-name=\"true\"]"], location: ["[data-testid=\"inlineHeader-companyLocation\"]","[data-testid=\"jobsearch-JobInfoHeader-companyLocation\"]","#jobLocationText","[data-testid=\"job-location\"]",".companyLocation"], employmentType: ["[role=\"group\"][aria-label=\"Job type\"] [data-testid$=\"-tile\"] span","#salaryInfoAndJobType span:nth-child(2)"], salary: ["#salaryInfoAndJobType span:first-child",".salary-snippet-container"], description: ["#jobDescriptionText",".jobsearch-jobDescriptionText","[data-testid=\"job-description\"]"] },
    glassdoor: { title: ["h1[id^=\"jd-job-title-\"]","h1[data-test=\"job-title\"]","h1.heading_Level1__w42c9"], company: ["[data-test=\"employer-name\"]","[class*=\"employerName\"] h4","[class*=\"EmployerProfile_compactEmployerName\"]"], location: ["[data-test=\"location\"]",".JobDetails_badgeStyle__xaoxT"], salary: ["[data-test=\"detailSalary\"]",".JobCard_salaryEstimate__QpbTW"], description: [".JobDetails_jobDescription__uW_fK","[class*=\"jobDescription\"]","[data-test=\"description\"]"] },
    ziprecruiter: { title: ["h1[data-testid=\"job-title\"]","[data-testid=\"job-title\"]",".job_title"], company: ["[data-testid=\"company-name\"]",".company_name"], location: ["[data-testid=\"job-location\"]",".job_location"], employmentType: ["[data-testid=\"job-type\"]",".job_type"], salary: ["[data-testid=\"salary\"]",".salary"], description: ["[data-testid=\"job-description\"]",".job_description"] },
    monster: { title: ["[data-testid=\"svx-job-view-wrapper\"] [data-testid=\"jobTitle\"]","[data-testid=\"jobTitle\"]"], company: ["[data-testid=\"svx-job-view-wrapper\"] [data-testid=\"company\"]","[data-testid=\"company\"]"], location: ["[data-testid=\"jobLocation\"]","[data-testid=\"location\"]"], employmentType: ["[data-testid=\"employmentType\"]","[data-testid=\"jobType\"]"], salary: ["[data-testid=\"salary\"]","[data-testid=\"compensation\"]"], description: ["[data-testid=\"svx-description-container-inner\"]"] },
    dice: { title: ["h1[data-testid=\"job-detail-title\"]","[data-testid=\"job-detail-title\"]","dhi-job-title h1"], company: ["[data-testid=\"company-name\"]","dhi-company-name","a[href*=\"/company-profile\"]"], location: ["[data-testid=\"job-detail-location\"]","[data-testid=\"location\"]","dhi-job-location"], employmentType: ["[data-testid=\"employment-type\"]","[aria-labelledby=\"employment-type-label\"]"], salary: ["[aria-labelledby=\"salary-label\"]","[data-testid=\"salary\"]"], description: ["[data-testid=\"job-description\"]","#jobDescription","dhi-job-description"] },
    simplyhired: { title: ["[data-testid=\"viewJobTitle\"]","[data-testid=\"searchSerpJobTitle\"] a"], company: ["[data-testid=\"viewJobCompanyName\"] a","[data-testid=\"companyName\"]"], location: ["[data-testid=\"viewJobCompanyLocation\"] [data-testid=\"detailText\"]","[data-testid=\"searchSerpJobLocation\"]"], employmentType: ["[data-testid=\"viewJobBodyJobDetailsJobType\"] [data-testid=\"detailText\"]"], salary: ["[data-testid=\"viewJobBodyJobCompensation\"] [data-testid=\"detailText\"]","[data-testid=\"searchSerpJobSalaryConfirmed\"]"], description: ["[data-testid=\"viewJobBodyJobFullDescriptionContent\"]","[data-testid=\"viewJobDescriptionContainer\"]","[data-testid=\"viewJobBodyContainer\"]"] }
  };
  const board = boardSelectors[boardName];
  if (board) {
    title = text(board.title || []) || title;
    company = (boardName === "indeed" ? directText(board.company || []) : text(board.company || [])) || company;
    jobLocation = text(board.location || []) || jobLocation;
    employmentType = text(board.employmentType || []) || employmentType;
    salary = text(board.salary || []) || salary;
    description = text(board.description || []) || description;
    if (boardName === "indeed") title = clean(title.replace(/\s*-\s*job post$/i, ""));
  }
  const ogTitle = clean(document.querySelector('meta[property="og:title"]')?.content);
  if (!title && ogTitle) title = ogTitle.split(/\s+[|–—-]\s+/)[0];
  if (!company) company = clean(document.querySelector('meta[property="og:site_name"]')?.content);
  if (!company && host) company = host.split(".").at(-2) || host.split(".")[0];
  if (company && title.toLowerCase().includes(company.toLowerCase())) {
    const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    title = clean(title.replace(new RegExp(escaped, "i"), "").replace(/^[\s|–—-]+|[\s|–—-]+$/g, ""));
  }
  description = description.slice(0, 50000);
  jobLocation = normalizeScoutLocation(jobLocation);
  employmentType = normalizeScoutEmploymentType(employmentType);

  return {
    title, company, location: jobLocation, employmentType, salary, description,
    platform: boardName || "generic",
    url: location.href, host,
    detected: { title: Boolean(title), company: Boolean(company), location: Boolean(jobLocation), employmentType: Boolean(employmentType), salary: Boolean(salary), description: Boolean(description) },
  };
}

async function extractScoutJob() {
  const fallback = extractScoutJobFallback();
  if (typeof globalThis.ScoutJobExtractor !== "function") return fallback;
  const extractor = globalThis.__scoutJobExtractor || (globalThis.__scoutJobExtractor = new globalThis.ScoutJobExtractor());
  extractor.resetCache();
  let job = await extractor.extract();
  if ((!job?.title || !job?.company || !job?.description)) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    extractor.resetCache();
    const settled = await extractor.extract();
    job = { ...job };
    for (const key of ["title","company","location","salary","description","employmentType","experienceLevel","postedDate","remote","applyUrl"]) if (!job[key] && settled?.[key]) job[key] = settled[key];
  }
  const boardFirst = ["indeed", "glassdoor", "ziprecruiter", "monster", "dice", "simplyhired"].includes(fallback.platform);
  const pick = (key) => boardFirst ? fallback[key] || job?.[key] : job?.[key] || fallback[key];
  const result = {
    title: pick("title"), company: pick("company"),
    location: normalizeScoutLocation(pick("location") || job?.remote),
    employmentType: normalizeScoutEmploymentType(pick("employmentType")), salary: pick("salary"),
    description: pick("description"), postedDate: job?.postedDate || "",
    experienceLevel: job?.experienceLevel || "",
    platform: fallback.platform !== "generic" ? fallback.platform : extractor.detectPlatform()?.name || "generic",
    url: job?.applyUrl || location.href, host: location.hostname.replace(/^www\./, ""),
  };
  result.description = String(result.description || "").slice(0, 50000);
  result.detected = Object.fromEntries(["title","company","location","employmentType","salary","description"].map((key) => [key, Boolean(result[key])]));
  return result;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SCOUT_EXTRACT_ACTIVE_JOB") return;
  extractScoutJob().then((job) => sendResponse({ ok: true, job })).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unable to read this job page." }));
  return true;
});

let lastUrl = location.href;
let changeTimer;
function announcePageChange(reason) {
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => {
    lastUrl = location.href;
    chrome.runtime.sendMessage({ type: "SCOUT_JOB_PAGE_CHANGED", url: location.href, reason }, () => void chrome.runtime.lastError);
  }, 350);
}
for (const method of ["pushState", "replaceState"]) {
  const original = history[method];
  history[method] = function (...args) {
    const result = original.apply(this, args);
    if (location.href !== lastUrl) announcePageChange("navigation");
    return result;
  };
}
addEventListener("popstate", () => announcePageChange("navigation"));
new MutationObserver(() => {
  if (location.href !== lastUrl) announcePageChange("navigation");
}).observe(document.documentElement, { childList: true, subtree: true });
