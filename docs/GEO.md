# Scout geo landing-page roadmap

## Purpose

Scout's geo pages target people who want application work delegated: “someone to apply for jobs for me,” “job application service,” “pay someone to apply for jobs,” and local-language equivalents. FastApply targets the automation layer; Scout should lead with the choice between a dedicated Human Assistant and a lower-cost AI Assistant.

## Published first wave

The reusable route is `/job-application-service/[country]`. Published markets:

- United States (`en-US`)
- United Kingdom (`en-GB`)
- Canada (`en-CA`)
- Australia (`en-AU`)
- Nigeria (`en-NG`)
- India (`en-IN`)

Country content lives in `src/data/countries.ts`. Each page must remain materially local: terminology, work-authorization questions, compensation conventions, geography, search types, Human-versus-AI guidance, and FAQs. Do not reduce a page to country-name substitution.

## Remaining market backlog

| Market | Suggested locale(s) | Primary localization work |
|---|---|---|
| Portugal | `pt-PT`, consider `en-PT` only with demonstrated demand | Portuguese CV conventions, EU work rights, salary format, Portuguese and English role targeting |
| Philippines | `en-PH` | Local versus overseas/remote searches, shifts and time zones, relocation, locally relevant payment context |
| Pakistan | `en-PK` | Local, worldwide-remote, and relocation campaigns; timezone and work-eligibility boundaries |
| United Arab Emirates | `en-AE`, later `ar-AE` | Visa status, sponsorship, notice period, relocation, Dubai/Abu Dhabi, salary in AED |
| France | `fr-FR`, optionally `en-FR` | Native French copy, CV and lettre de motivation, EU work rights, salary conventions |
| Spain | `es-ES`, optionally `en-ES` | Native Spanish copy, CV conventions, EU work rights, salary conventions |
| South Africa | `en-ZA` | Local and international remote targeting, cities, work eligibility, employment-equity questions |
| Saudi Arabia | `ar-SA` and/or `en-SA` based on research | Arabic/English application materials, sponsorship, relocation, notice period, salary in SAR |
| Singapore | `en-SG` | Work-pass eligibility, local versus regional roles, notice period, salary in SGD |
| Malaysia | `en-MY`, consider `ms-MY` after demand validation | Local/regional searches, work authorization, language requirements, salary in MYR |
| Germany | `de-DE`, optionally `en-DE` | Native German copy, Lebenslauf/Anschreiben, notice periods, EU/Blue Card eligibility |

FastApply also lists these markets, but that alone is not evidence that every local job board supports end-to-end Scout submission. Verify the actual Scout/FastApply workflow before naming a board as supported.

## Page acceptance checklist

Before a new country page is indexable, confirm:

1. Search demand and target phrases in the local language.
2. A native or expert editorial review for non-English copy.
3. Country-specific CV/resume and cover-letter terminology.
4. Work authorization, sponsorship, notice-period, compensation, and location conventions.
5. Verified platform/ATS coverage; do not imply unsupported job-board coverage.
6. At least three substantive local sections and four unique FAQs.
7. Accurate current Scout pricing. Scout currently charges in USD; do not promise local billing or payment methods without support.
8. Self-referencing canonical plus complete reciprocal `hreflang` annotations, including `x-default`.
9. Country `areaServed` in Service structured data and a valid breadcrumb.
10. Links from the main job-application-service hub and relevant editorial pages.
11. No invented local statistics, testimonials, success rates, employer logos, or guarantees.
12. A rendered-page review on mobile and desktop, followed by build, link, metadata, and structured-data checks.

## Recommended release order

After the first wave has enough Search Console and conversion data, prioritize:

1. Philippines and South Africa for English-language expansion.
2. UAE and Singapore for international/relocation intent.
3. Germany, France, Spain, and Portugal only with native-language editorial capacity.
4. Pakistan, Saudi Arabia, and Malaysia after keyword and payment-friction research.

Measure impressions, qualified visits, AI registrations, booked Human calls, checkout starts, and paid conversion by landing country. A country page should stay published because it answers a real local need, not simply because a country token exists.
