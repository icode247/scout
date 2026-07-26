// sidebar/services/job-extractor.js
// Extract job details from page — fast heuristic path + AI fallback
// Enhanced with full LinkedIn job data extraction

class JobExtractor {
  constructor() {
    this._cache = null;
    this._cacheUrl = null;
  }

  // ──── Proactive Job Data Cache ────
  // Caches job details across page navigations so data extracted on the
  // details page is available when the user reaches the form page.
  // Uses chrome.storage.session (shared across all content scripts/origins).

  /**
   * Derive a stable cache key from a URL. Both the details page and form page
   * for the same job resolve to the same key (e.g. "greenhouse:12345").
   * Returns null if the URL doesn't match a known ATS pattern.
   */
  _deriveJobKey(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      const path = u.pathname.toLowerCase();

      // Greenhouse: boards.greenhouse.io/{company}/jobs/{id}
      if (/greenhouse\.io/.test(host)) {
        const m = path.match(/\/jobs\/(\d+)/);
        return m ? `greenhouse:${m[1]}` : null;
      }
      // Lever: jobs.lever.co/{company}/{uuid}
      if (/lever\.co/.test(host)) {
        const m = path.match(/\/([^/]+)\/([a-f0-9-]{36})/);
        return m ? `lever:${m[2]}` : null;
      }
      // Workday: {company}.myworkdayjobs.com/.../job/{slug}
      if (/myworkdayjobs\.com|myworkday\.com/.test(host)) {
        const m = path.match(/\/job\/([^/?#]+)/);
        return m ? `workday:${m[1]}` : null;
      }
      // Ashby: jobs.ashbyhq.com/{company}/{uuid}
      if (/ashbyhq\.com/.test(host)) {
        const m = path.match(/\/([a-f0-9-]{36})/i);
        return m ? `ashby:${m[1]}` : null;
      }
      // SmartRecruiters: jobs.smartrecruiters.com/{company}/{id}
      if (/smartrecruiters\.com/.test(host)) {
        const m = path.match(/\/[^/]+\/(\d+)/);
        return m ? `smartrecruiters:${m[1]}` : null;
      }
      // Indeed: viewjob?jk=X or smartapply with jk param
      if (/indeed\.com/.test(host)) {
        const jk = u.searchParams.get('jk') || u.searchParams.get('vjk');
        if (jk) return `indeed:${jk}`;
        const m = path.match(/\/rc\/clk\/([^/?]+)/);
        return m ? `indeed:${m[1]}` : null;
      }
      // LinkedIn: /jobs/view/{id} or ?currentJobId={id}
      if (/linkedin\.com/.test(host)) {
        const m = path.match(/\/jobs\/view\/(\d+)/);
        if (m) return `linkedin:${m[1]}`;
        const jid = u.searchParams.get('currentJobId');
        return jid ? `linkedin:${jid}` : null;
      }
      // Rippling: ats.rippling.com/{company}/jobs/{id}
      if (/rippling\.com/.test(host)) {
        const m = path.match(/\/jobs\/([^/?]+)/);
        return m ? `rippling:${m[1]}` : null;
      }
      // iCIMS: *.icims.com/jobs/{id}/...
      if (/icims\.com/.test(host)) {
        const m = path.match(/\/jobs\/(\d+)/);
        return m ? `icims:${m[1]}` : null;
      }
      // Workable: apply.workable.com/{company}/j/{id} or *.workable.com
      if (/workable\.com/.test(host)) {
        const m = path.match(/\/j\/([^/?]+)/);
        return m ? `workable:${m[1]}` : null;
      }
      // BambooHR: *.bamboohr.com/careers/{id}
      if (/bamboohr\.com/.test(host)) {
        const m = path.match(/\/careers\/(\d+)/);
        return m ? `bamboohr:${m[1]}` : null;
      }
      // JazzHR: *.applytojob.com/apply/{slug}/{id}
      if (/applytojob\.com/.test(host)) {
        const m = path.match(/\/apply\/([^/]+)\/([^/?]+)/);
        return m ? `jazzhr:${m[2]}` : null;
      }
      // Personio: *.personio.de|com/job/{id}
      if (/personio\.(de|com)/.test(host)) {
        const m = path.match(/\/job\/(\d+)/);
        return m ? `personio:${m[1]}` : null;
      }
      // Recruitee: *.recruitee.com/o/{slug}
      if (/recruitee\.com/.test(host)) {
        const m = path.match(/\/o\/([^/]+)/);
        return m ? `recruitee:${m[1]}` : null;
      }
      // Jobvite: *.jobvite.com/.../{id}
      if (/jobvite\.com/.test(host)) {
        const m = path.match(/\/([a-zA-Z0-9]+)(?:\/|$)/);
        return m ? `jobvite:${m[1]}` : null;
      }
      // OracleCloud: *.oraclecloud.com/.../job/{id}
      if (/oraclecloud\.com/.test(host)) {
        const m = path.match(/\/job\/([^/?]+)/);
        return m ? `oraclecloud:${m[1]}` : null;
      }
      // ZipRecruiter
      if (/ziprecruiter\.com/.test(host)) {
        const m = path.match(/\/([a-f0-9]{32}|[\w-]+)$/);
        return m ? `ziprecruiter:${m[1]}` : null;
      }
      // Pinpoint: *.pinpointhq.com/.../jobs/{slug}
      if (/pinpointhq\.com/.test(host)) {
        const m = path.match(/\/jobs\/([^/?]+)/);
        return m ? `pinpoint:${m[1]}` : null;
      }
      // BreezyHR: *.breezy.hr/p/{id}
      if (/breezy\.hr/.test(host)) {
        const m = path.match(/\/p\/([^/?]+)/);
        return m ? `breezyhr:${m[1]}` : null;
      }
      // Glassdoor
      if (/glassdoor\.com/.test(host)) {
        const m = path.match(/[_-](\d{6,})\./);
        return m ? `glassdoor:${m[1]}` : null;
      }
    } catch { /* invalid URL */ }
    return null;
  }

  /**
   * Cache job data. Writes to chrome.storage.session (shared across origins)
   * and also stores a "last complete job" as universal fallback.
   */
  async cacheJobData(jobData, url) {
    if (!jobData?.title) return;
    const entry = { ...jobData, _cachedAt: Date.now(), _cachedUrl: url };
    try {
      const writes = { 'fa_last_job': JSON.stringify(entry) };
      const key = this._deriveJobKey(url);
      if (key) {
        writes[`fa_job:${key}`] = JSON.stringify(entry);
      }
      await chrome.storage.session.set(writes);
      console.log(`[JobExtractor] Cached job data${key ? ` (${key})` : ''}: "${jobData.title}"`);
    } catch (e) {
      // Fallback to sessionStorage if chrome.storage.session unavailable
      try {
        sessionStorage.setItem('fa_last_job', JSON.stringify(entry));
        const key = this._deriveJobKey(url);
        if (key) sessionStorage.setItem(`fa_job:${key}`, JSON.stringify(entry));
      } catch { /* ignore */ }
    }
  }

  /**
   * Retrieve cached job data for a URL. Tries platform-specific key first,
   * then falls back to the last complete job.
   */
  async getCachedJobData(url) {
    try {
      const key = this._deriveJobKey(url);
      const keys = ['fa_last_job'];
      if (key) keys.unshift(`fa_job:${key}`);

      const result = await chrome.storage.session.get(keys);
      for (const k of keys) {
        if (result[k]) {
          try {
            const parsed = JSON.parse(result[k]);
            // Expire after 2 hours
            if (Date.now() - (parsed._cachedAt || 0) > 2 * 60 * 60 * 1000) continue;
            console.log(`[JobExtractor] Restored cached job from ${k}: "${parsed.title}"`);
            return parsed;
          } catch { /* parse error */ }
        }
      }
    } catch {
      // Fallback to sessionStorage
      try {
        const key = this._deriveJobKey(url);
        const keys = ['fa_last_job'];
        if (key) keys.unshift(`fa_job:${key}`);
        for (const k of keys) {
          const raw = sessionStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Date.now() - (parsed._cachedAt || 0) > 2 * 60 * 60 * 1000) continue;
            return parsed;
          }
        }
      } catch { /* ignore */ }
    }
    return null;
  }

  /**
   * Extract job details from current page
   * @returns {{ title, company, location, salary, description, status, employmentType, experienceLevel, postedDate, applicantCount, remote, skills, applyUrl }}
   */
  async extract() {
    // Return cached if same URL
    if (this._cache && this._cacheUrl === window.location.href) {
      return this._cache;
    }

    // Detect platform for specialized extraction
    const platform = this.detectPlatform();
    let result;

    if (platform?.name === 'linkedin') {
      result = this._extractLinkedIn();
    } else if (platform?.name === 'ashby') {
      result = this._extractAshby();
    } else if (platform?.name === 'rippling') {
      result = this._extractRippling();
    } else if (platform?.name === 'workday') {
      result = this._extractWorkday();
    } else if (platform?.name === 'icims') {
      result = this._extractIcims();
    } else if (platform?.name === 'workable') {
      result = this._extractWorkable();
    } else if (platform?.name === 'recruitee') {
      result = this._extractRecruitee();
    } else {
      result = this.extractBySelectors();
    }

    // AI fallback if we're missing critical fields
    if (!result.title || !result.company) {
      try {
        const aiResult = await this.extractByAI();
        if (aiResult) {
          // Merge AI results, preferring existing non-null values
          for (const [key, val] of Object.entries(aiResult)) {
            if (val && !result[key]) result[key] = val;
          }
        }
      } catch (e) {
        console.warn('[JobExtractor] AI extraction failed:', e);
      }
    }

    this._cache = result;
    this._cacheUrl = window.location.href;
    return result;
  }

  // ──── LinkedIn-specific extraction ────

  /**
   * Full LinkedIn job data extraction — covers job posting pages,
   * Easy Apply modal context, and job listing cards
   */
  _extractLinkedIn() {
    const result = this._emptyResult();
    const url = window.location.href;

    // Job ID — /jobs/view/{id} or ?currentJobId={id}
    const viewMatch = url.match(/linkedin\.com\/jobs\/view\/(\d+)/);
    if (viewMatch) {
      result.jobId = viewMatch[1];
    } else {
      try {
        const urlObj = new URL(url);
        result.jobId = urlObj.searchParams.get('currentJobId') || null;
      } catch { /* ignore */ }
    }

    // Determine LinkedIn page type
    if (url.includes('/jobs/view/') || url.includes('/jobs/collections/')) {
      this._extractLinkedInJobView(result);
    } else if (url.includes('/jobs/search/')) {
      this._extractLinkedInJobSearch(result);
    } else if (url.includes('/jobs/')) {
      // Generic LinkedIn jobs page
      this._extractLinkedInJobView(result);
    }

    return result;
  }

  /**
   * Extract from LinkedIn job detail view (/jobs/view/ or job detail pane)
   */
  _extractLinkedInJobView(result) {
    // ── Job Title ──
    result.title = this._getText([
      // New LinkedIn UI (2024+)
      '.job-details-jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title a',
      '.job-details-jobs-unified-top-card__job-title',
      // Older LinkedIn UI variants
      '.jobs-unified-top-card__job-title',
      '.t-24.job-details-jobs-unified-top-card__job-title',
      '.top-card-layout__title',
      'h1.topcard__title',
      // Job detail sidebar
      '.jobs-details__main-content h1',
      '.jobs-search__job-details h1',
      // Fallback
      'h1',
    ]);

    // ── Company Name ──
    result.company = this._getText([
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name',
      '.topcard__org-name-link',
      '.top-card-layout__second-subline a',
      '.jobs-details__main-content .jobs-unified-top-card__subtitle-primary-grouping a',
    ]);

    // ── Location ──
    result.location = this._getText([
      '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
      '.job-details-jobs-unified-top-card__bullet',
      '.jobs-unified-top-card__bullet',
      '.topcard__flavor--bullet',
      '.top-card-layout__bullet',
      '.jobs-unified-top-card__workplace-type',
    ]);

    // ── Salary ──
    result.salary = this._getText([
      '.job-details-jobs-unified-top-card__job-insight--highlight span',
      '.salary-main-rail__data-amount',
      '.compensation__salary',
    ]);

    // ── Job insights (employment type, experience level, etc.) ──
    this._extractLinkedInInsights(result);

    // ── Job Description (full text) ──
    result.description = this._getLinkedInDescription();

    // ── Skills ──
    result.skills = this._extractLinkedInSkills();

    // ── Posted date & applicant count ──
    const primaryDesc = this._getText([
      '.job-details-jobs-unified-top-card__primary-description-container',
      '.jobs-unified-top-card__primary-description',
    ]);

    if (primaryDesc) {
      // Extract posted date (e.g., "2 weeks ago", "1 day ago")
      const timeMatch = primaryDesc.match(/(\d+\s+(?:second|minute|hour|day|week|month)s?\s+ago)/i);
      if (timeMatch) result.postedDate = timeMatch[1];

      // Extract applicant count (e.g., "47 applicants", "Over 100 applicants")
      const applicantMatch = primaryDesc.match(/((?:over\s+)?\d+\s+applicants?)/i);
      if (applicantMatch) result.applicantCount = applicantMatch[1];
    }

    // ── Remote/hybrid/on-site ──
    const workplaceText = this._getText([
      '.jobs-unified-top-card__workplace-type',
      '.job-details-jobs-unified-top-card__workplace-type',
    ]);
    if (workplaceText) {
      const lower = workplaceText.toLowerCase();
      if (lower.includes('remote')) result.remote = 'Remote';
      else if (lower.includes('hybrid')) result.remote = 'Hybrid';
      else if (lower.includes('on-site') || lower.includes('onsite')) result.remote = 'On-site';
    }

    // ── Apply URL (direct link or Easy Apply) ──
    const applyButton = document.querySelector(
      '.jobs-apply-button, .jobs-s-apply button, [data-job-id] .jobs-apply-button'
    );
    if (applyButton) {
      const isEasyApply = applyButton.textContent?.toLowerCase().includes('easy apply');
      result.applyType = isEasyApply ? 'easy-apply' : 'external';
      result.applyUrl = applyButton.getAttribute('href') || window.location.href;
    }

    return result;
  }

  /**
   * Extract from LinkedIn job search results page
   */
  _extractLinkedInJobSearch(result) {
    // On search pages, the selected job shows in a detail pane
    // Try the detail pane first
    const detailPane = document.querySelector(
      '.jobs-search__job-details, .jobs-details__main-content'
    );

    if (detailPane) {
      // Use the same job view extraction, scoped to detail pane where possible
      this._extractLinkedInJobView(result);
    } else {
      // Fallback to highlighted search result card
      const activeCard = document.querySelector(
        '.jobs-search-results-list__list-item--active, .job-card-container--clickable.active'
      );
      if (activeCard) {
        result.title = this._getTextFrom(activeCard, [
          '.job-card-list__title', '.artdeco-entity-lockup__title',
        ]);
        result.company = this._getTextFrom(activeCard, [
          '.job-card-container__primary-description', '.artdeco-entity-lockup__subtitle',
        ]);
        result.location = this._getTextFrom(activeCard, [
          '.job-card-container__metadata-item', '.artdeco-entity-lockup__caption',
        ]);
      }
    }
  }

  /**
   * Extract LinkedIn job insights (chips showing employment type, level, etc.)
   */
  _extractLinkedInInsights(result) {
    const insightElements = document.querySelectorAll(
      '.job-details-jobs-unified-top-card__job-insight span, ' +
      '.jobs-unified-top-card__job-insight span'
    );

    for (const el of insightElements) {
      const text = el.textContent?.trim().toLowerCase() || '';

      // Employment type
      if (['full-time', 'part-time', 'contract', 'temporary', 'internship', 'volunteer', 'other'].some(t => text.includes(t))) {
        result.employmentType = el.textContent?.trim();
      }

      // Experience level
      if (['entry level', 'associate', 'mid-senior', 'director', 'executive', 'internship', 'not applicable'].some(t => text.includes(t))) {
        result.experienceLevel = el.textContent?.trim();
      }

      // Company size
      if (text.includes('employees') || text.match(/\d+[\s,]+\d*\s*employees/)) {
        result.companySize = el.textContent?.trim();
      }
    }

    // Also check list items with icons
    const listItems = document.querySelectorAll(
      '.job-details-jobs-unified-top-card__job-insight, ' +
      '.jobs-unified-top-card__job-insight'
    );
    for (const item of listItems) {
      const text = item.textContent?.trim() || '';

      if (text.match(/\d+\s+skill/i)) {
        // "8 of 10 skills match your profile" type text
        result.skillMatchText = text;
      }
    }
  }

  /**
   * Get the full LinkedIn job description, handling "Show more" expansion
   */
  _getLinkedInDescription() {
    // Try the expanded description first
    let desc = this._getText([
      '.jobs-description__content .jobs-box__html-content',
      '.jobs-description-content__text',
      '.jobs-description__content',
      '.jobs-box__html-content',
      '#job-details',
      '.job-details-jobs-unified-top-card__job-description',
    ], true);

    if (desc) return desc;

    // Check for truncated description — read the full content container
    // (avoid clicking "Show more" as it mutates the page)
    const fullContainer = document.querySelector(
      '.jobs-description__content, .jobs-box__html-content, #job-details'
    );
    if (fullContainer) {
      desc = (fullContainer.innerText || '').trim();
    }

    return desc || '';
  }

  /**
   * Extract skills listed on LinkedIn job posting
   */
  _extractLinkedInSkills() {
    const skills = [];

    // Skills section in job details
    const skillElements = document.querySelectorAll(
      '.job-details-how-you-match__skills-item-subtitle, ' +
      '.jobs-unified-top-card__job-insight-text-button span, ' +
      '.job-details-skill-match-status-list__skill'
    );

    for (const el of skillElements) {
      const text = el.textContent?.trim();
      if (text && !skills.includes(text)) skills.push(text);
    }

    // Also extract from description if we can identify a skills section
    const desc = this._cache?.description || '';
    const skillsMatch = desc.match(/(?:required|preferred|desired|key)\s*(?:skills|qualifications|requirements)[:\s]*([^]*?)(?:\n\n|$)/i);
    if (skillsMatch) {
      const bulletItems = skillsMatch[1].match(/[•\-\*]\s*([^\n]+)/g);
      if (bulletItems) {
        for (const item of bulletItems.slice(0, 15)) {
          const cleaned = item.replace(/^[•\-\*]\s*/, '').trim();
          if (cleaned.length < 80 && !skills.includes(cleaned)) {
            skills.push(cleaned);
          }
        }
      }
    }

    return skills.length > 0 ? skills : null;
  }

  // ──── Ashby-specific extraction ────

  _extractAshby() {
    const result = this._emptyResult();

    // Job title — Ashby uses h1 with hashed class + stable class
    // Avoid bare 'h1' fallback which can pick up container text with badges
    result.title = this._getText([
      'h1[class*="_title_"].ashby-job-posting-heading',
      'h1.ashby-job-posting-heading',
      '.ashby-job-posting-title',
      'h1[class*="_title_"]',
    ]);
    // If title still has extra text (badge, company leaking in), try document.title
    if (!result.title || result.title.includes('\n')) {
      const docTitle = document.title || '';
      // Ashby page titles: "Job Title @ Company" or "Job Title - Company | Ashby"
      const titleMatch = docTitle.split(/\s[@\-–|]\s/);
      if (titleMatch[0]?.trim()) {
        result.title = titleMatch[0].trim();
      }
    }

    // Company — extract from URL (Ashby format: jobs.ashbyhq.com/{company}/...)
    const url = window.location.href;
    const companyMatch = url.match(/jobs\.ashbyhq\.com\/([^/]+)/i);
    if (companyMatch) {
      result.company = decodeURIComponent(companyMatch[1])
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    }

    // Job ID — UUID in the URL path
    const uuidMatch = url.match(/\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    if (uuidMatch) {
      result.jobId = uuidMatch[1];
    }

    // Location, Department, Employment Type, Salary — Ashby uses _section_ containers with _heading_ h2
    const sections = document.querySelectorAll('[class*="_section_"]');
    for (const section of sections) {
      const heading = section.querySelector('h2[class*="_heading_"]');
      const headingText = heading?.textContent?.trim() || '';
      // Most sections use <p>, but Compensation uses <ul>/<span>
      const pText = section.querySelector('p')?.textContent?.trim() || '';
      const sectionText = pText || section.textContent?.replace(headingText, '').trim() || '';
      if (!sectionText) continue;

      switch (headingText) {
        case 'Location':
          result.location = pText;
          break;
        case 'Employment Type':
          result.employmentType = pText;
          break;
        case 'Compensation':
        case 'Salary': {
          // Compensation uses <span class="_compensationTierSummary_...">
          const compSpan = section.querySelector('[class*="_compensationTierSummary_"]');
          result.salary = compSpan?.textContent?.trim() || sectionText;
          break;
        }
        case 'Location Type':
          result.remote = pText;
          break;
      }
    }

    // Fallback location from stable class names
    if (!result.location) {
      result.location = this._getText([
        '.ashby-job-posting-location',
        '[class*="_location_"]',
      ]);
    }

    // Job description
    result.description = this._getAshbyDescription();

    return result;
  }

  _getAshbyDescription() {
    // CSS module hashed class selectors
    const cssModuleSelectors = [
      '[class*="_descriptionText_"]',
      '[class*="_descriptionBody_"]',
      '[class*="_description_"][class*="_content_"]',
      '[class*="_richText_"]',
    ];
    for (const sel of cssModuleSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 50) {
          return el.innerText.trim();
        }
      } catch { /* skip */ }
    }

    // Stable Ashby class names
    const stableSelectors = [
      '.ashby-job-posting-brief-description',
      '.ashby-job-posting-description',
      '.ashby-job-posting-overview',
    ];
    for (const sel of stableSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 50) {
        return el.innerText.trim();
      }
    }

    // Section-based: collect non-metadata sections with substantial content
    const sections = document.querySelectorAll('[class*="_section_"]');
    const parts = [];
    for (const section of sections) {
      const heading = section.querySelector('h2[class*="_heading_"]');
      const headingText = heading?.textContent?.trim()?.toLowerCase() || '';
      if (['location', 'department', 'team', 'compensation', 'employment type'].includes(headingText)) {
        continue;
      }
      const content = section.textContent?.trim();
      if (content && content.length > 100) {
        parts.push(content);
      }
    }
    if (parts.length > 0) return parts.join('\n\n');

    // Final fallback
    const main = document.querySelector('main, .ashby-job-posting, #content');
    if (main && main.textContent.trim().length > 100) {
      return main.innerText.trim();
    }

    return '';
  }

  // ──── Rippling-specific extraction ────

  _extractRippling() {
    const result = this._emptyResult();
    const url = window.location.href;

    // Job title — Rippling uses <h4> with "Application: {title}" on the application page
    const h4Title = this._getText([
      'h4.css-19w1hyc',
      'h4[class*="css-"]',
    ]);
    if (h4Title) {
      // Strip "Application: " prefix if present
      result.title = h4Title.replace(/^Application:\s*/i, '').trim();
    }

    // Fallback title from page heading or document title
    if (!result.title) {
      result.title = this._getText([
        'h1', 'h2.job-title', '[data-testid="job-title"]',
      ]);
    }
    if (!result.title) {
      const docTitle = document.title || '';
      // Rippling page titles: "Job Title - Company | Rippling" or similar
      const titleMatch = docTitle.split(/\s[\-–|]\s/);
      if (titleMatch[0]?.trim()) {
        result.title = titleMatch[0].trim().replace(/^Application:\s*/i, '');
      }
    }

    // Company name — extract from URL: ats.rippling.com/{company}/jobs/{jobId}
    const companyMatch = url.match(/ats\.rippling\.com\/([^/]+)/i);
    if (companyMatch) {
      result.company = decodeURIComponent(companyMatch[1])
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    }

    // Job ID from URL
    const jobIdMatch = url.match(/\/jobs\/([^/?]+)/i);
    if (jobIdMatch) {
      result.jobId = jobIdMatch[1];
    }

    // Location
    result.location = this._getText([
      '[data-testid="job-location"]',
      '.job-location',
      '[class*="location"]',
    ]);

    // Job description
    result.description = this._getText([
      '.job-description', '[data-testid="job-description"]',
      'article', '.content-wrapper', 'main',
    ], true);

    result.applyUrl = url;

    return result;
  }

  // ──── Workday-specific extraction ────

  _extractWorkday() {
    const result = this._emptyResult();
    const url = window.location.href;

    // Job title — Workday uses multiple data-automation-id values across pages
    result.title = this._getText([
      '[data-automation-id="jobPostingHeader"]',
      '[data-automation-id="jobTitleHeading"]',
      '[data-automation-id="jobTitle"]',
      'h1',
    ]);

    // If not found or title is generic, try URL path: /job/Software-Engineer_26WD94727
    if (!result.title || result.title === 'Apply') {
      const jobPathMatch = url.match(/\/job\/([^/?#]+)/);
      if (jobPathMatch?.[1]) {
        let slug = jobPathMatch[1].replace(/_[A-Z0-9]+$/i, '').replace(/-/g, ' ');
        result.title = slug.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      }
    }

    // Company — extract from subdomain: {company}.myworkdayjobs.com or wd{N}.myworkday.com/{company}
    const companyMatch = url.match(/([^/.]+)\.myworkdayjobs\.com/i) ||
      url.match(/myworkday\.com\/([^/]+)/i);
    if (companyMatch) {
      result.company = decodeURIComponent(companyMatch[1])
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    }

    // Location — use dd to avoid including the label text
    result.location = this._getText([
      '[data-automation-id="locations"] dd',
      '[data-automation-id="jobPostingLocation"] dd',
      '[data-automation-id="locations"]',
    ]);

    // Salary
    result.salary = this._getText([
      '[data-automation-id="compensation"]',
    ]);

    // Job description
    result.description = this._getText([
      '[data-automation-id="jobPostingDescription"]',
    ], true);

    // Job ID from URL
    const jobIdMatch = url.match(/\/job\/[^_]*_([A-Z0-9]+)/i) ||
      url.match(/\/job\/([^/?#]+)/);
    if (jobIdMatch) {
      result.jobId = jobIdMatch[1];
    }

    result.applyUrl = url;

    return result;
  }

  // ──── iCIMS-specific extraction ────

  _extractIcims() {
    const result = this._emptyResult();
    const url = window.location.href;

    result.title = this._getText([
      "h1.iCIMS_Header",
      "#iCIMS_Header h1",
      ".iCIMS_Header",
      "h1",
    ]);

    // Prefer explicit company metadata, then fall back to the iCIMS tenant.
    result.company = this._getText([
      ".iCIMS_CompanyName",
      ".iCIMS_JobHeaderCompany",
      "[class*=\"CompanyName\"]",
      "[class*=\"companyName\"]",
    ]);
    if (!result.company) {
      result.company = document.querySelector("meta[property=\"og:site_name\"]")
        ?.getAttribute("content")?.trim() || null;
    }
    if (!result.company) {
      const logo = document.querySelector(
        ".iCIMS_Logo img[alt], .iCIMS_TopHeader img[alt], header img[alt]"
      );
      const logoAlt = logo?.getAttribute("alt")?.trim();
      if (logoAlt && !/logo|icims/i.test(logoAlt)) result.company = logoAlt;
    }
    if (!result.company) {
      const companyMatch = window.location.hostname.match(/^([^.]+)\.icims\.com$/i);
      if (companyMatch) {
        const tenant = decodeURIComponent(companyMatch[1])
          .replace(/^(?:us|uk|eu|ca|au)[-_]/i, "")
          .replace(/^careers[-_]?/i, "")
          .replace(/[-_]+/g, " ")
          .trim();
        if (tenant) {
          result.company = tenant.length <= 5
            ? tenant.toUpperCase()
            : tenant.replace(/\b\w/g, c => c.toUpperCase());
        }
      }
    }

    try {
      const headerTags = document.querySelectorAll(".iCIMS_JobHeaderTag");
      for (const tag of headerTags) {
        const dt = tag.querySelector(".iCIMS_JobHeaderField");
        const dd = tag.querySelector(".iCIMS_JobHeaderData span");
        if (!dt || !dd) continue;
        const label = dt.textContent.trim().toLowerCase();
        if (label.includes("location")) result.location = dd.textContent.trim();
      }
    } catch { /* ignore malformed header groups */ }

    if (!result.location) {
      result.location = this._getText([
        ".iCIMS_JobHeaderLocation",
        ".iCIMS_JobLocation",
      ]);
    }

    // Combine Overview, Responsibilities, Qualifications, and any custom sections.
    const descriptionSections = [];
    const sectionBodies = document.querySelectorAll(
      ".iCIMS_InfoMsg_Job .iCIMS_Expandable_Text, .iCIMS_InfoMsg_Job"
    );
    const seenBodies = new Set();
    for (const body of sectionBodies) {
      const preferredBody = body.matches(".iCIMS_Expandable_Text")
        ? body
        : body.querySelector(".iCIMS_Expandable_Text") || body;
      if (seenBodies.has(preferredBody)) continue;
      seenBodies.add(preferredBody);
      const text = preferredBody.innerText?.trim() || preferredBody.textContent?.trim();
      if (!text) continue;

      let heading = "";
      let sibling = body.closest(".iCIMS_InfoMsg_Job")?.previousElementSibling;
      while (sibling && !heading) {
        if (sibling.matches?.("h2.iCIMS_InfoField_Job, h2.iCIMS_InfoMsg")) {
          heading = sibling.textContent?.trim() || "";
          break;
        }
        sibling = sibling.previousElementSibling;
      }
      descriptionSections.push(heading ? heading + "\n" + text : text);
    }
    result.description = descriptionSections.join("\n\n") || this._getText([
      ".iCIMS_JobContent",
      ".iCIMS_Expandable_Container",
    ], true);

    const descriptionLower = String(result.description || "").toLowerCase();
    if (descriptionLower.includes("hybrid")) result.remote = "Hybrid";
    else if (descriptionLower.includes("remote") || descriptionLower.includes("work from home")) result.remote = "Remote";

    const jobIdMatch = url.match(/\/jobs\/(\d+)\//i);
    if (jobIdMatch) result.jobId = jobIdMatch[1];

    result.applyUrl = document.querySelector(
      "a.iCIMS_ApplyOnlineButton[href], a[title*=\"Apply for this job\"][href]"
    )?.href || url;
    return result;
  }

  // ──── Workable-specific extraction ────

  _extractWorkable() {
    const result = this._emptyResult();
    const url = window.location.href;

    // Try JSON-LD structured data first (available on overview pages)
    try {
      const jsonLd = document.querySelector('script[type="application/ld+json"]');
      if (jsonLd) {
        const data = JSON.parse(jsonLd.textContent);
        if (data?.title) result.title = data.title;
        if (data?.jobLocationType === 'TELECOMMUTE') result.remote = 'Remote';
        if (data?.employmentType) result.employmentType = data.employmentType;
        if (data?.datePosted) result.postedDate = data.datePosted;
        if (data?.applicantLocationRequirements) {
          result.location = data.applicantLocationRequirements.map(l => l.name).join(', ');
        }
        if (data?.description) {
          const temp = document.createElement('div');
          temp.innerHTML = data.description;
          result.description = temp.textContent.trim();
        }
      }
    } catch { /* JSON parse failed */ }

    // DOM extraction (overview page selectors from workable.js)
    if (!result.title) {
      result.title = this._getText([
        'h1[data-ui="overview-title"]',
        'h1[data-ui="job-title"]',
        '.posting-header h2',
        'h1',
      ]);
    }

    // Company
    const companyLogo = document.querySelector('a[data-ui="company-logo"] img');
    result.company = this._getText([
      'h2[data-ui="overview-company"] a',
    ]) || companyLogo?.getAttribute('alt')?.trim() || null;
    // Fallback: extract from URL (apply.workable.com/{company}/...)
    if (!result.company) {
      const m = url.match(/workable\.com\/([^/]+)/i);
      if (m) result.company = decodeURIComponent(m[1]).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    if (!result.location) {
      result.location = this._getText([
        'span[data-ui="overview-location"]',
        'div[data-ui="job-location"]',
        '.location',
      ]);
    }

    // Full description from DOM (overview page)
    if (!result.description) {
      const parts = [];
      const desc = document.querySelector('[data-ui="job-breakdown-description-parsed-html"]')
        || document.querySelector('section[data-ui="job-description"] div');
      if (desc) parts.push(desc.textContent.trim());

      const req = document.querySelector('[data-ui="job-breakdown-requirements-parsed-html"]')
        || document.querySelector('section[data-ui="job-requirements"] div');
      if (req) parts.push(req.textContent.trim());

      const benefits = document.querySelector('[data-ui="job-breakdown-benefits-parsed-html"]')
        || document.querySelector('section[data-ui="job-benefits"] div');
      if (benefits) parts.push(benefits.textContent.trim());

      if (parts.length > 0) result.description = parts.join('\n\n');
    }

    result.employmentType = result.employmentType || this._getText([
      'span[data-ui="overview-employment-type"]',
      'span[data-ui="job-employment-type"]',
    ]);

    // Job ID from URL: /j/{id}
    const jobIdMatch = url.match(/\/j\/([^/?]+)/i);
    if (jobIdMatch) result.jobId = jobIdMatch[1];

    result.applyUrl = url;
    return result;
  }

  // ──── Recruitee-specific extraction ────

  _extractRecruitee() {
    const result = this._emptyResult();
    const url = window.location.href;

    // Job title
    result.title = this._getText([
      'h1.sc-crgk9f-2',
      'h1',
      '.job-title',
      '[data-testid="job-title"]',
      '[data-cy="job-title"]',
    ]);

    // Company — from logo/navigation
    const logoImg = document.querySelector('.custom-css-style-navigation-logo img[alt]');
    const logoSpan = document.querySelector('.custom-css-style-navigation-logo span[aria-hidden="true"]');
    result.company = logoSpan?.textContent?.trim()
      || logoImg?.alt?.replace(/ logo$/i, '').trim()
      || null;
    // Fallback: from subdomain
    if (!result.company) {
      const m = url.match(/([^/.]+)\.recruitee\.com/i);
      if (m && m[1] !== 'www') result.company = decodeURIComponent(m[1]).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    // Location
    result.location = this._getText([
      '.custom-css-style-job-location',
      '.sc-qfruxy-6',
      '[data-testid="styled-location-list-item"]',
      '.location',
      '.job-location',
    ]);

    // Description — only extract from the overview page, NOT from the /c/new form page
    if (!url.includes('/c/new')) {
      result.description = this._getText([
        '.sc-1fwbcuw-0',
        '.c-job__description',
        '.job-description',
        '.description',
        '[data-ui="job-description"]',
        '.vacancy-description',
        '#job-details',
      ], true);
    }

    // Salary from meta spans
    try {
      const metaSpans = document.querySelectorAll('.sc-crgk9f-5 span.sc-crgk9f-7');
      for (const span of metaSpans) {
        const text = span.textContent?.trim() || '';
        if (/\$|€|£|salary|per\s+(year|month|hour)/i.test(text)) {
          result.salary = text;
          break;
        }
      }
    } catch { /* ignore */ }

    // Job ID from URL: /o/{slug}
    const slugMatch = url.match(/\/o\/([^/]+)/i);
    if (slugMatch) result.jobId = slugMatch[1];

    result.applyUrl = url;
    return result;
  }

  // ──── Generic extraction (non-LinkedIn) ────

  /**
   * Fast path: extract via well-known DOM selectors (no AI needed)
   */
  extractBySelectors() {
    const result = this._emptyResult();

    // Job title — typically the main heading
    result.title = this._getText([
      'h1.job-title', 'h1.posting-headline', 'h1[data-test="job-title"]',
      '.job-title h1', '.jobTitle h1', 'h1.app-title',
      '[data-automation-id="jobPostingHeader"]',
      'h1.topcard__title', 'h1.top-card-layout__title',
      '.jobs-unified-top-card__job-title',
      'h1',
    ]);

    // Company name
    result.company = this._getText([
      '.company-name', '.posting-categories .sort-by-time',
      '[data-test="company-name"]', '.employer-name',
      '.topcard__org-name-link', '.top-card-layout__second-subline a',
      '.jobs-unified-top-card__company-name',
      '[data-automation-id="company"]',
      'a[data-company-name]',
    ]);

    // Location
    result.location = this._getText([
      '.location', '.job-location', '[data-test="location"]',
      '.posting-categories .sort-by-time + .sort-by-time',
      '.topcard__flavor--bullet', '.top-card-layout__bullet',
      '.jobs-unified-top-card__bullet',
      '[data-automation-id="locations"]',
    ]);

    // Salary
    result.salary = this._getText([
      '.salary', '.compensation', '[data-test="salary"]',
      '.salary-range', '.pay-range',
      '[data-automation-id="compensation"]',
    ]);

    // Job description text (for keyword analysis)
    result.description = this._getText([
      '.job-description', '#job-description', '[data-test="job-description"]',
      '.posting-description', '.job-details',
      '.description__text', '.show-more-less-html__markup',
      '[data-automation-id="jobPostingDescription"]',
      'article', '.content-wrapper',
    ], true);

    return result;
  }

  /**
   * AI fallback: use automation engine's extract command
   */
  async extractByAI() {
    const engine = window.__automationEngine;
    if (!engine || !engine.extract || !engine.isInitialized) {
      return null;
    }

    return engine.extract(
      'Extract the job title, company name, location, and salary range from this job posting page',
      {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Job title' },
          company: { type: 'string', description: 'Company name' },
          location: { type: 'string', description: 'Job location' },
          salary: { type: 'string', description: 'Salary range if shown' },
        },
      }
    );
  }

  /**
   * Extract full job description text (for keyword analysis)
   */
  getJobDescription() {
    if (this._cache?.description) return this._cache.description;

    // Check platform-specific extractors first
    const platform = this.detectPlatform();
    if (platform?.name === 'linkedin') {
      return this._getLinkedInDescription() || '';
    }
    if (platform?.name === 'ashby') {
      return this._getAshbyDescription() || '';
    }

    return this._getText([
      '.job-description', '#job-description', '[data-test="job-description"]',
      '.posting-description', '.job-details',
      '.description__text', '.show-more-less-html__markup',
      '[data-automation-id="jobPostingDescription"]',
      'article', '.content-wrapper', 'main',
    ], true) || '';
  }

  /**
   * Detect the ATS platform from the current page
   */
  detectPlatform() {
    const url = window.location.href.toLowerCase();
    const hostname = window.location.hostname.toLowerCase();

    const patterns = [
      { match: /greenhouse\.io|boards\.greenhouse/, name: 'greenhouse', status: 'supported' },
      { match: /lever\.co|jobs\.lever/, name: 'lever', status: 'supported' },
      { match: /myworkdayjobs\.com|workday\.com/, name: 'workday', status: 'supported' },
      { match: /workable\.com/, name: 'workable', status: 'supported' },
      { match: /icims\.com/, name: 'icims', status: 'supported' },
      { match: /taleo\.net/, name: 'taleo', status: 'supported' },
      { match: /successfactors\.com|successfactors\.eu/, name: 'successfactors', status: 'supported' },
      { match: /bamboohr\.com/, name: 'bamboohr', status: 'supported' },
      { match: /applytojob\.com|jazzthr/, name: 'jazzhr', status: 'supported' },
      { match: /smartrecruiters\.com/, name: 'smartrecruiters', status: 'supported' },
      { match: /ashbyhq\.com/, name: 'ashby', status: 'supported' },
      { match: /oraclecloud\.com/, name: 'oraclecloud', status: 'supported' },
      { match: /ultipro\.com|ukg\.com/, name: 'ultipro', status: 'supported' },
      { match: /adp\.com/, name: 'adp', status: 'supported' },
      { match: /ceridian\.com|dayforcehcm/, name: 'ceridian', status: 'supported' },
      { match: /jobvite\.com/, name: 'jobvite', status: 'supported' },
      { match: /breezy\.hr/, name: 'breezyhr', status: 'supported' },
      { match: /recruitee\.com/, name: 'recruitee', status: 'supported' },
      { match: /rippling\.com/, name: 'rippling', status: 'supported' },
      { match: /personio\.de|personio\.com|jobs\.personio/, name: 'personio', status: 'supported' },
      { match: /glassdoor\.com/, name: 'glassdoor', status: 'supported' },
      { match: /ziprecruiter\.com/, name: 'ziprecruiter', status: 'supported' },
      { match: /wellfound\.com|angel\.co\/company/, name: 'wellfound', status: 'supported' },
      { match: /pinpoint\.com|pinpointhq\.com/, name: 'pinpoint', status: 'supported' },
      { match: /linkedin\.com\/jobs/, name: 'linkedin', status: 'supported' },
      { match: /indeed\.com/, name: 'indeed', status: 'supported' },
      { match: /zohorecruit\.com|recruit\.zoho\.com/, name: 'zoho', status: 'supported' },
    ];

    const combined = hostname + url;
    for (const p of patterns) {
      if (p.match.test(combined)) {
        return { name: p.name, status: p.status };
      }
    }

    // Check for generic job page indicators
    const hasJobIndicators = document.querySelector(
      '[class*="job"], [class*="career"], [class*="apply"], [id*="job"], [id*="career"]'
    );

    if (hasJobIndicators) {
      return { name: 'generic', status: 'generic' };
    }

    return null;
  }

  /**
   * Reset cache (call on navigation)
   */
  resetCache() {
    this._cache = null;
    this._cacheUrl = null;
  }

  // ──── Helpers ────

  _emptyResult() {
    return {
      title: null,
      company: null,
      location: null,
      salary: null,
      description: null,
      status: 'new',
      employmentType: null,
      experienceLevel: null,
      postedDate: null,
      applicantCount: null,
      remote: null,
      skills: null,
      applyUrl: null,
      applyType: null,
      companySize: null,
      skillMatchText: null,
      jobId: null,
    };
  }

  /**
   * Get text content from first matching selector
   */
  _getText(selectors, longText = false) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const text = longText ? el.innerText : el.textContent;
          const trimmed = (text || '').trim();
          if (trimmed) return trimmed;
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }
    return null;
  }

  /**
   * Get text from selector scoped to a parent element
   */
  _getTextFrom(parent, selectors) {
    for (const sel of selectors) {
      try {
        const el = parent.querySelector(sel);
        if (el) {
          const trimmed = (el.textContent || '').trim();
          if (trimmed) return trimmed;
        }
      } catch {
        // Skip
      }
    }
    return null;
  }
}

;globalThis.ScoutJobExtractor = JobExtractor;
