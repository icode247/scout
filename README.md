# Scout — Marketing Site + SEO Blog

Marketing website and SEO blog for **Scout**, the AI job auto-apply mobile app (iOS + Android).
Built with **Astro + Tailwind**, deploys on **Vercel**. Standalone domain (`getscout.app`),
cross-linked from the sister brand `fastapply.co` for authority.

## Run

```bash
npm install        # deps are reused from ../Fastapply-blog if offline
npm run dev        # local dev at http://localhost:4321
npm run build      # static build to ./dist
npm run preview    # preview the build
```

## Architecture

- `src/config/site.ts` — **single source of truth**: domain, store links, nav, footer, pricing tiers, stats. Change these, the whole site updates.
- `src/layouts/` — `Base.astro` (head + header + footer), `Legal.astro` (prose pages).
- `src/components/` — static Astro components (Header, Footer, Button, AppStoreBadges, DownloadQR, FAQ, Section, Container, Logo, BaseHead).
- `src/components/islands/SwipeHero.tsx` — the only React island (drag-to-apply hero deck). Everything else ships ~zero JS.
- `src/content/blog/` — SEO articles (Markdown, content-collection schema in `src/content/config.ts`).
- `src/data/ats.ts` — data for programmatic `/auto-apply/[ats]` pages.
- `src/pages/` — routes (see Site map below).

## Site map

| Path | Purpose |
|---|---|
| `/` | Homepage (install conversion) |
| `/how-it-works`, `/swipe-apply`, `/first-apply` | Product/mode pages |
| `/safety` | Trust hub ("is auto-apply safe?") |
| `/pricing` | Free / Pro / Max (data-driven) |
| `/download` | OS-detect → store + QR |
| `/auto-apply/[ats]` | Programmatic: Workday, Greenhouse, Lever, LinkedIn, Indeed, Glassdoor, ZipRecruiter |
| `/compare` | Comparison hub (Phase 3 expands to full vs-pages) |
| `/blog`, `/blog/[slug]` | SEO content engine + RSS (`/rss.xml`) |
| `/privacy` `/terms` `/support` `/delete-account` | App-store-required pages |

## SEO/ASO strategy (verified)

- **Head terms are NOT targeted** ("auto apply jobs", "best auto apply tool 2026") — saturated by funded incumbents + high-DA review sites; unwinnable for a new domain in year one.
- **Win on**: per-ATS pages (auto-submit, not autofill — strongest cluster), trust/objection content (is it safe / does it work), per-job tailoring long-tail, conversational "app that applies to jobs for you", and "be first to apply".
- **ASO** (verified vs Apple/Google docs): iOS title `Scout: AI Job Apply & Search`, subtitle `Auto-apply with tailored resumes`, 100-char keyword field; Play long description IS indexed. Use Custom Product Pages (limit 70, organically searchable) + English UK/AU/CA locale keyword spillover. "Scout" is trademark-crowded → always pair with a descriptor.

## TODO before launch

- [ ] Confirm final **domain** + drop real **App Store / Play** URLs and IDs in `src/config/site.ts`.
- [ ] Confirm **pricing** numbers in `TIERS`.
- [ ] Replace illustrative **STATS** (applications sent, rating) with real verifiable numbers.
- [ ] Legal review of `/privacy`, `/terms`; set real company entity + contact emails.
- [ ] Generate real **OG images** (PNG 1200×630) and a brand-styled **QR** (drop `api.qrserver.com`).
- [ ] First-party-proxy or self-host analytics + fonts (see note in `BaseHead.astro`).
- [ ] Set `PUBLIC_PLAUSIBLE_DOMAIN`; verify in Google Search Console + Bing Webmaster.
- [ ] Cap free-tier auto-applies + verification to control COGS (~$4.45/profile/mo via FastApply).
