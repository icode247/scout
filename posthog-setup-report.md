# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into Scout (scout-web), an Astro SSR job application service. Changes include: a client-side PostHog JS snippet component added to the shared `BaseHead.astro`, a server-side `posthog-node` singleton at `src/lib/posthog-server.ts`, user identification wired into the App layout for all authenticated pages, server-side event capture in 8 API route files covering the full user lifecycle from sign-in through account deletion, and a PostHog dashboard with 5 insights.

| Event | Description | File |
|-------|-------------|------|
| `user_signed_in` | User successfully completed authentication via magic link or Google OAuth | `src/pages/auth/callback.ts` |
| `user_signed_out` | User signed out of their Scout account | `src/pages/api/auth/logout.ts` |
| `onboarding_completed` | User finished the onboarding flow and created their first job profile | `src/pages/api/app/onboarding.ts` |
| `resume_uploaded` | User uploaded a new resume for parsing and storage | `src/pages/api/app/resumes.ts` |
| `resume_deleted` | User deleted a resume from their account | `src/pages/api/app/resumes.ts` |
| `job_profile_created` | User created a new job profile with target roles and resume preferences | `src/pages/api/app/profiles.ts` |
| `job_profile_updated` | User updated an existing job profile's settings or resumes | `src/pages/api/app/profiles.ts` |
| `job_profile_deleted` | User deleted a job profile from their account | `src/pages/api/app/profiles.ts` |
| `ai_agent_activated` | User activated the Scout AI agent for automated job applications | `src/pages/api/app/ai-agent.ts` |
| `ai_agent_paused` | User paused the Scout AI agent | `src/pages/api/app/ai-agent.ts` |
| `job_applied_via_ai` | AI agent submitted a job application on behalf of the user | `src/pages/api/app/ai-jobs.ts` |
| `application_withdrawn` | User withdrew a pending job application from the preparation queue | `src/pages/api/app/applications.ts` |
| `account_deleted` | User permanently deleted their Scout account and all associated data | `src/pages/api/app/account.ts` |

## Next steps

We've built a dashboard and 5 insights to monitor user behavior from day one:

- [Analytics basics (wizard) — Dashboard](https://us.posthog.com/project/526827/dashboard/1900365)
- [Sign-ins over time (wizard)](https://us.posthog.com/project/526827/insights/hoNMB6Oi)
- [Onboarding conversion funnel (wizard)](https://us.posthog.com/project/526827/insights/GNffwFMc)
- [AI agent activations (wizard)](https://us.posthog.com/project/526827/insights/sKcFssNm)
- [Jobs applied via AI (wizard)](https://us.posthog.com/project/526827/insights/U4vnQVrM)
- [Key user actions (wizard)](https://us.posthog.com/project/526827/insights/TotOJyO0)

## Verify before merging

- [ ] Run a full production build (the wizard only verified the files it touched) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add the PostHog env var names (`PUBLIC_POSTHOG_PROJECT_TOKEN`, `PUBLIC_POSTHOG_HOST`, `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST`) to any deployment platform secrets (Vercel, Netlify, etc.) and CI env configuration.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify.
- [ ] Confirm the returning-visitor path also calls `identify` — the App layout identifies on every authenticated page load, which covers returning sessions, but verify this holds after a session cookie refresh.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
