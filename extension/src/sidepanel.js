const $ = (selector) => document.querySelector(selector);
const views = ["loading-state", "connect-state", "error-state", "success-state", "job-form"];
let profiles = [];
let currentJob = null;
let currentTab = null;
let profileData = null;
let detectionGeneration = 0;
let navigationTimer;
let lastDetectedUrl = "";

const REQUEST_TIMEOUT_MS = 12000;
function show(id) {
  views.forEach((name) => $("#" + name).classList.toggle("hidden", name !== id));
  $("#app").dataset.view = id;
}
function message(type, payload) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (callback, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => finish(reject, Object.assign(new Error("Scout took too long to respond. Please try again."), { code: "request_timeout" })), REQUEST_TIMEOUT_MS);
    try {
      chrome.runtime.sendMessage({ type, ...payload }, (response) => {
        if (chrome.runtime.lastError) return finish(reject, new Error(chrome.runtime.lastError.message));
        if (response?.ok) return finish(resolve, response.data);
        finish(reject, Object.assign(new Error(response?.error || "Scout did not respond."), { status: response?.status, code: response?.code }));
      });
    } catch (error) {
      finish(reject, error);
    }
  });
}

function extractionScript() {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const cleanLocation = (value) => [...new Set(clean(value).split(/\s*[,|•]\s*/).map(clean).filter((part) => part && !/^(?:unavailable|unknown|not available|not specified|n\/a|null|undefined|-)$/i.test(part)).map((part) => part.toUpperCase() === "USA" ? "US" : part))].join(", ");
  const cleanEmploymentType = (value) => {
    const raw = clean(value);
    const key = raw.toLowerCase().replace(/[\s_]+/g, "-");
    return ({ "full-time": "Full-time", "part-time": "Part-time", contract: "Contract", contractor: "Contract", temporary: "Temporary", intern: "Internship", internship: "Internship", volunteer: "Volunteer", "per-diem": "Per diem", other: "Other" })[key] || raw.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  };
  const firstText = (selectors) => { for (const selector of selectors) { const node = document.querySelector(selector); const value = clean(node?.textContent || node?.getAttribute?.("content")); if (value) return value; } return ""; };
  const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((node) => {
    try { const data = JSON.parse(node.textContent || "null"); return Array.isArray(data) ? data : data?.["@graph"] || [data]; } catch { return []; }
  }).find((item) => item?.["@type"] === "JobPosting" || (Array.isArray(item?.["@type"]) && item["@type"].includes("JobPosting")));
  const address = jsonLd?.jobLocation?.address || jsonLd?.jobLocation?.[0]?.address;
  const remote = String(jsonLd?.jobLocationType || "").toUpperCase().includes("TELECOMMUTE");
  const host = location.hostname.replace(/^www\./, "");
  let title = clean(jsonLd?.title) || firstText(["h1.iCIMS_Header","#iCIMS_Header h1","[data-testid='job-title']",".posting-headline h2",".app-title",".job-title","h1"]);
  let company = clean(jsonLd?.hiringOrganization?.name) || firstText([".iCIMS_CompanyName",".iCIMS_JobHeaderCompany","[data-testid='company-name']",".posting-headline .company",".company-name",".employer","[class*='company']"]);
  let jobLocation = remote ? "Remote" : clean([address?.addressLocality, address?.addressRegion, address?.addressCountry].filter(Boolean).join(", ")) || firstText([".iCIMS_JobHeaderTag .iCIMS_JobHeaderData span","[data-testid='inlineHeader-companyLocation']","[data-testid='jobsearch-JobInfoHeader-companyLocation']","#jobLocationText","[data-testid='job-location']",".posting-categories .location",".location","[class*='location']"]);
  let description = clean(jsonLd?.description ? new DOMParser().parseFromString(jsonLd.description, "text/html").body.textContent : "") || firstText([".iCIMS_JobContent","[data-testid='job-description']","#content",".posting-page .content",".job-description","[class*='jobDescription']","[class*='job-description']","main"]);
  if (!company) company = clean(document.querySelector('meta[property="og:site_name"]')?.content);
  if (!company && host.includes(".icims.com")) {
    const tenant = host.split(".")[0].replace(/^(?:us|uk|eu|ca|au)[-_]/i, "").replace(/^careers[-_]?/i, "").replace(/[-_]+/g, " ");
    company = tenant.length <= 5 ? tenant.toUpperCase() : tenant.replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  if (!company) company = host.split(".")[0];
  const ogTitle = clean(document.querySelector('meta[property="og:title"]')?.content);
  if (!title && ogTitle) title = ogTitle.split(/\s+[|–—-]\s+/)[0];
  if (company && title.toLowerCase().includes(company.toLowerCase())) title = clean(title.replace(new RegExp(company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "").replace(/^[\s|–—-]+|[\s|–—-]+$/g, ""));
  if (description.length > 50000) description = description.slice(0, 50000);
  const employmentType = cleanEmploymentType(jsonLd?.employmentType);
  jobLocation = cleanLocation(jobLocation);
  return { title, company, location: jobLocation, employmentType, description, platform: host.includes("icims.com") ? "icims" : "generic", url: location.href, host, detected: { title: Boolean(title), company: Boolean(company), location: Boolean(jobLocation), employmentType: Boolean(employmentType), description: Boolean(description) } };
}

function hasJobValue(value) {
  const text = String(value || "").trim();
  return Boolean(text) && !/^(?:unavailable|unknown|not available|not specified|n\/a|null|undefined)$/i.test(text);
}

function jobQuality(job) {
  if (!job) return -1;
  let score = 0;
  if (hasJobValue(job.title)) score += 5;
  if (hasJobValue(job.company)) score += 3;
  if (hasJobValue(job.location)) score += 2;
  if (hasJobValue(job.employmentType)) score += 1;
  if (hasJobValue(job.salary)) score += 1;
  const descriptionLength = String(job.description || "").trim().length;
  if (descriptionLength >= 120) score += 4;
  if (descriptionLength >= 800) score += 3;
  if (job.platform && job.platform !== "generic") score += 2;
  return score;
}

function selectBestJob(candidates) {
  const jobs = candidates.filter(Boolean).sort((a, b) => jobQuality(b) - jobQuality(a));
  if (!jobs.length) return null;
  const best = { ...jobs[0] };
  for (const key of ["title", "company", "location", "employmentType", "salary", "description", "postedDate", "experienceLevel"]) {
    if (!hasJobValue(best[key])) {
      const source = jobs.find((job) => hasJobValue(job[key]));
      if (source) best[key] = source[key];
    }
  }
  best.detected = Object.fromEntries(
    ["title", "company", "location", "employmentType", "salary", "description"]
      .map((key) => [key, hasJobValue(best[key])])
  );
  return best;
}

function requestFrameJob(tabId, frameId) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      finished = true;
      reject(new Error("The job frame took too long to respond."));
    }, 6500);
    chrome.tabs.sendMessage(tabId, { type: "SCOUT_EXTRACT_ACTIVE_JOB" }, { frameId }, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (runtimeError) reject(new Error(runtimeError.message));
      else if (!response?.ok) reject(new Error(response?.error || "The frame did not return job details."));
      else resolve(response.job);
    });
  });
}

async function detectJob() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];
  if (!currentTab?.id || !/^https?:/i.test(currentTab.url || "")) {
    throw Object.assign(new Error("Open a public job page, then try again."), { kind: "unsupported" });
  }

  const candidates = [];
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId: currentTab.id });
    const frameIds = [...new Set((frames || []).map((frame) => frame.frameId))];
    const responses = await Promise.allSettled(frameIds.map((frameId) => requestFrameJob(currentTab.id, frameId)));
    for (const response of responses) {
      if (response.status === "fulfilled" && response.value) candidates.push(response.value);
    }
  } catch { /* fall through to one-time frame injection */ }

  if (!candidates.length) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: currentTab.id, allFrames: true },
        func: extractionScript,
      });
      for (const result of results || []) {
        if (result?.result) candidates.push(result.result);
      }
    } catch { /* handled below */ }
  }

  const job = selectBestJob(candidates);
  if (job) return job;
  throw Object.assign(
    new Error("Scout cannot read this page yet. Refresh the job page once, then open Scout again."),
    { kind: "blocked" }
  );
}

function renderAssistant(account) {
  if (!account) return;
  $("#assistant").classList.remove("hidden");
  $("#assistant-name").textContent = account.assistant_name || "Your Human Assistant";
  const avatar = $("#assistant-avatar"), fallback = $("#assistant-fallback");
  if (account.assistant_avatar) { avatar.src = account.assistant_avatar; avatar.classList.remove("hidden"); fallback.classList.add("hidden"); }
}

async function renderForm(job, data) {
  currentJob = job || { title: "", company: "", location: "", employmentType: "", salary: "", description: "", url: currentTab?.url || "", host: new URL(currentTab.url).hostname, detected: {} };
  lastDetectedUrl = currentJob.url || currentTab?.url || "";
  profileData = data;
  renderAssistant(data.account);
  profiles = data.profiles || [];
  if (!profiles.length) throw Object.assign(new Error("Create an active Human Assistant job profile with a resume before sending jobs."), { kind: "no_profiles" });
  $("#title").value = currentJob.title || ""; $("#company").value = currentJob.company || ""; $("#location").value = currentJob.location || ""; $("#employment-type").value = currentJob.employmentType || ""; $("#salary").value = currentJob.salary || ""; $("#description").value = currentJob.description || "";
  const foundCount = Object.values(currentJob.detected || {}).filter(Boolean).length;
  $("#detection-label").textContent = foundCount >= 2 ? "Job detected" : "Review job details";
  $("#detection-checks").innerHTML = [["title","Title"],["company","Company"],["location","Location"],["employmentType","Job type"],["salary","Salary"],["description","Description"]].map(([key,label]) => `<span class="check ${currentJob.detected?.[key] ? "" : "missing"}"><i>${currentJob.detected?.[key] ? "✓" : "·"}</i>${label} ${currentJob.detected?.[key] ? "found" : "needed"}</span>`).join("");
  const select = $("#profile"); select.innerHTML = profiles.map((profile) => `<option value="${profile.id}">${profile.name}</option>`).join("");
  $("#remembered").classList.add("hidden");
  const key = `profileFor:${currentJob.host}`; const stored = await chrome.storage.local.get(key); const remembered = profiles.find((profile) => profile.id === stored[key]);
  if (remembered) { select.value = remembered.id; $("#remembered").classList.remove("hidden"); $("#remembered-copy").textContent = `${remembered.name} is selected for ${currentJob.host}.`; }
  updateResumeBehavior(); show("job-form");
}

function updateResumeBehavior() {
  const profile = profiles.find((item) => item.id === $("#profile").value);
  $("#resume-behavior").textContent = profile?.resume_behavior === "original" ? "Use profile resume" : "Tailor resume for this job";
}

function showError(error, action = "retry") {
  $("#error-title").textContent = error.status === 403 ? "Available with Human Assistant" : error.kind === "no_profiles" ? "A profile is required" : "Scout could not continue";
  $("#error-message").textContent = error.message;
  $("#error-action").textContent = action === "connect" ? "Connect again" : "Try again";
  $("#error-action").dataset.action = action; show("error-state");
}

async function start({ reuseProfiles = false } = {}) {
  const generation = ++detectionGeneration;
  show("loading-state");
  try {
    const status = await message("SCOUT_AUTH_STATUS");
    if (!status.connected) return show("connect-state");
    const [job, data] = await Promise.all([detectJob(), reuseProfiles && profileData ? Promise.resolve(profileData) : message("SCOUT_GET_PROFILES")]);
    if (generation !== detectionGeneration) return;
    await renderForm(job, data);
  } catch (error) {
    if (error.status === 401 || error.code === "not_connected") return show("connect-state");
    if (error.kind === "blocked" || error.kind === "unsupported") {
      try { const data = await message("SCOUT_GET_PROFILES"); await renderForm(null, data); return; } catch (next) { return showError(next, next.status === 401 ? "connect" : "retry"); }
    }
    showError(error, error.status === 401 ? "connect" : "retry");
  }
}

$("#connect").addEventListener("click", async () => { $("#connect").disabled = true; $("#connect").textContent = "Connecting…"; try { await message("SCOUT_CONNECT"); await start(); } catch (error) { showError(error, "connect"); } finally { $("#connect").disabled = false; $("#connect").textContent = "Connect Scout"; } });
$("#profile").addEventListener("change", async () => { updateResumeBehavior(); if (currentJob?.host) { const key = `profileFor:${currentJob.host}`; await chrome.storage.local.set({ [key]: $("#profile").value }); $("#remembered").classList.remove("hidden"); const profile = profiles.find((item) => item.id === $("#profile").value); $("#remembered-copy").textContent = `${profile?.name || "This profile"} is selected for ${currentJob.host}.`; } });
$("#job-form").addEventListener("submit", async (event) => { event.preventDefault(); const button = $("#submit"), errorNode = $("#form-error"); errorNode.classList.add("hidden"); button.disabled = true; button.querySelector("span:last-child").textContent = "Sending to your assistant…"; try { const form = new FormData(event.currentTarget); const result = await message("SCOUT_SEND_JOB", { payload: { job_profile_id: form.get("profile"), title: form.get("title"), company: form.get("company"), location: form.get("location"), employment_type: form.get("employment_type"), salary: form.get("salary"), description: form.get("description"), external_url: currentJob?.url || currentTab?.url || "" } }); $("#success-title").textContent = `${result.job?.title || form.get("title")} was received.`; show("success-state"); } catch (error) { errorNode.textContent = error.message; errorNode.classList.remove("hidden"); } finally { button.disabled = false; button.querySelector("span:last-child").textContent = "Send this job"; } });
$("#send-another").addEventListener("click", start); $("#refresh-page").addEventListener("click", () => { $("#menu").classList.add("hidden"); start(); });
$("#error-action").addEventListener("click", () => $("#error-action").dataset.action === "connect" ? $("#connect").click() : start());
$("#menu-button").addEventListener("click", () => { const menu = $("#menu"); menu.classList.toggle("hidden"); $("#menu-button").setAttribute("aria-expanded", String(!menu.classList.contains("hidden"))); });
$("#disconnect").addEventListener("click", async () => { await message("SCOUT_DISCONNECT"); $("#menu").classList.add("hidden"); show("connect-state"); });
$("#save-site").addEventListener("click", async () => { try { await message("SCOUT_SET_SITE", { siteUrl: $("#site-url").value }); $("#menu").classList.add("hidden"); show("connect-state"); } catch (error) { showError(error); } });
document.addEventListener("click", (event) => { if (!event.target.closest("#menu") && !event.target.closest("#menu-button")) $("#menu").classList.add("hidden"); });
message("SCOUT_GET_SETTINGS").then((settings) => { $("#site-url").value = settings.siteUrl; }).catch(() => {});
function scheduleLiveDetection({ force = false } = {}) {
  clearTimeout(navigationTimer);
  navigationTimer = setTimeout(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || (!force && tab.url === lastDetectedUrl)) return;
    start({ reuseProfiles: true });
  }, 500);
}
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) scheduleLiveDetection({ force: true });
});
chrome.tabs.onActivated.addListener(() => scheduleLiveDetection());
chrome.runtime.onMessage.addListener((event, sender) => {
  if (event?.type === "SCOUT_JOB_PAGE_CHANGED" && sender.tab?.active && event.url !== lastDetectedUrl) scheduleLiveDetection();
});
start();
