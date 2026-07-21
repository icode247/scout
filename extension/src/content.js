function extractScoutJob() {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const text = (...selectors) => {
    for (const selector of selectors.flat()) {
      const node = document.querySelector(selector);
      const value = clean(node?.textContent || node?.getAttribute?.("content"));
      if (value) return value;
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

  const ogTitle = clean(document.querySelector('meta[property="og:title"]')?.content);
  if (!title && ogTitle) title = ogTitle.split(/\s+[|–—-]\s+/)[0];
  if (!company) company = clean(document.querySelector('meta[property="og:site_name"]')?.content);
  if (!company && host) company = host.split(".").at(-2) || host.split(".")[0];
  if (company && title.toLowerCase().includes(company.toLowerCase())) {
    const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    title = clean(title.replace(new RegExp(escaped, "i"), "").replace(/^[\s|–—-]+|[\s|–—-]+$/g, ""));
  }
  description = description.slice(0, 50000);

  return {
    title, company, location: jobLocation, employmentType, salary, description,
    url: location.href, host,
    detected: { title: Boolean(title), company: Boolean(company), location: Boolean(jobLocation), employmentType: Boolean(employmentType), salary: Boolean(salary), description: Boolean(description) },
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SCOUT_EXTRACT_ACTIVE_JOB") return;
  try { sendResponse({ ok: true, job: extractScoutJob() }); }
  catch (error) { sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unable to read this job page." }); }
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
