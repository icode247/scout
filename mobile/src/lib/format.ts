import type { Application, Job } from './types';

export function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'SC';
}

export function relativeDate(value?: string | null) {
  if (!value) return 'Recently';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Recently';
  const days = Math.round((timestamp - Date.now()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === -1) return 'Yesterday';
  if (days > -7) return `${Math.abs(days)}d ago`;
  const weeks = Math.round(Math.abs(days) / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(timestamp);
}

export function compactDate(value?: string | null) {
  if (!value) return 'Not submitted yet';
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'Not submitted yet';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: timestamp.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(timestamp);
}

export function titleCase(value: string) {
  return value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function jobPostedAt(job: Job) {
  const analysisDate = job.fit_analysis?.date_posted;
  return job.posted_at || (typeof analysisDate === 'string' ? analysisDate : null) || job.created_at;
}

export function salaryLabel(job: Job) {
  const salary = String(job.salary || '').trim();
  return salary || 'Compensation not listed';
}

export function jobSignals(job: Job) {
  const signals: string[] = [];
  const workplace = job.fit_analysis?.workplace_type;
  if (typeof workplace === 'string' && workplace) signals.push(titleCase(workplace));
  else if (/remote/i.test(job.location)) signals.push('Remote');
  if (job.employment_type) signals.push(titleCase(job.employment_type));
  const skills = job.fit_analysis?.matched_skills;
  if (Array.isArray(skills)) signals.push(...skills.slice(0, 2));
  return [...new Set(signals)].slice(0, 3);
}

export function applicationStatus(status: string) {
  const labels: Record<string, string> = {
    preparing: 'Preparing',
    needs_input: 'Needs your input',
    submitted: 'Submitted',
    evidence_ready: 'Proof ready',
    interview: 'Interview',
    rejected: 'Closed',
    withdrawn: 'Withdrawn',
  };
  return labels[status] || titleCase(status);
}

export function applicationProgress(application: Application) {
  if (application.status === 'interview') return 4;
  if (['submitted', 'evidence_ready', 'rejected'].includes(application.status)) return 3;
  if (application.status === 'needs_input') return 2;
  if (application.status === 'withdrawn') return 1;
  return 1;
}

export function profileFirstName(name?: string | null) {
  return String(name || 'there').trim().split(/\s+/)[0] || 'there';
}

