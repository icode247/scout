# Scout Design System

## Product position

Scout is the application operations desk for job seekers. It combines affordable AI throughput with optional human judgment. Every surface must make three ideas tangible: work is handled, users remain in control, and every submission leaves proof.

## Brand scene

A focused application desk at 9:00 AM: packets are moving, status lights are clear, a human reviewer is available, and the job seeker has time to prepare for interviews.

Voice: precise, service-minded, grounded.

## Visual system

- Primary identity: Scout lime `#7fc92b` and deep forest `#10210d`.
- AI lane: lime and signal green.
- Human lane: amber `#d88a24` and warm amber surfaces.
- Neutral surfaces: true white plus green-tinted operational surface `#f4ffeb`.
- Marketing imagery uses real people, tactile desks, paper packets, and natural light.
- Product visuals are rendered in code so UI labels remain accurate and reusable.

## Typography

Marketing keeps the committed Space Grotesk/Manrope stack. Product mockups use the body stack only. Display letter spacing never goes below `-0.04em`; body copy stays within 70 characters where practical.

## Shape and depth

- Marketing panels: 16px radius maximum.
- Pills are reserved for statuses, tags, and actions.
- Product surfaces use either a subtle border or a compact shadow, never both as decoration.
- Inner cards represent real applications, packets, receipts, or messages.

## Product visual grammar

`ProductVisual.astro` is the canonical dashboard representation across the site.

- Queue: matched jobs, AI/human routing, readiness.
- Tracker: applications, review state, interviews.
- Documents: tailored resume and cover note.
- Human review: assistant note and approval action.

Do not create one-off fake dashboards on individual pages. Extend this component for new capabilities.

## Page architecture

- Homepage: outcome hero, assistant choice, how Scout gets users hired, two-minute tour, workflow, safety, outcome, comparison, pricing, FAQ, CTA.
- How It Works: process overview, two-minute tour, detailed handoffs, receipt, CTA.
- AI Assistant: affordable throughput, queue, documents, pacing, tracker, CTA.
- Human Assistant: reviewer hero, judgment use cases, workflow, approval, CTA.
- Safety: guardrails, approval modes, pacing, receipts, escalation, privacy.
- Pricing: assistant choice, plan matrix, scenario guidance, FAQ, CTA.
- Compare: service-model comparison first; qualified competitor summaries second.
- Auto Apply / Download: coverage and mobile control as extensions of the same queue.

## Motion

- Marketing reveals: 700ms ease-out, visible by default.
- Product feedback: 150-250ms.
- Queue motion communicates state only.
- Reduced motion always shows complete content.

## Copy rules

- Say “AI assistant” and “human assistant,” not “AI magic” or “career coach.”
- Lead with done-for-you applications and visible control.
- Never invent customer counts, ratings, interviews, or success rates.
- Comparison copy describes typical service models unless verified data is available.
- Avoid hostile claims about AI competitors; Scout should explain where AI works and where humans help.

## Asset library

- `scout-operations-desk.webp`: operations hero.
- `interview-ready.webp`: job-seeker outcome.
- `scout-profile-step.webp`: onboarding process.
- `scout-swipe-review.webp`: mobile queue review.
- `scout-human-review.webp`: human-assistant service.

Generated imagery contains no embedded brand names or UI copy. Overlay product copy in HTML for accessibility, accuracy, and responsive behavior.
