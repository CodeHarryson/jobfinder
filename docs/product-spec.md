# Product specification

## Users and problem

The initial user is a student or early-career candidate targeting a known set of companies. They need to discover openings quickly, decide whether a role is worth applying to, submit accurate applications with minimal repetition, and prepare for each recruiting stage.

## Core workflow

1. The user imports target companies and optional career, students/early-careers, and events-page URLs.
2. The user creates a structured candidate profile and uploads one or more resumes.
3. The scheduler scans enabled sources. The default expression is `* * * * *`, but each source has a minimum interval, backoff, jitter, and rate limit.
4. New postings are normalized, versioned, and deduplicated.
5. The ranking engine chooses the best resume and returns a fit assessment with evidence.
6. The system records the canonical application destination without restricting discovery by application provider.
7. The user receives a notification with open, save, and dismiss actions.
8. The user applies on the company's site and records the application, resume used, and current stage.
9. The application timeline is updated from user actions; permitted email and calendar signals are added in a later release.

## Release boundaries

### Release one

- Discovery by watching every user-defined company career and early-career/event page and following its job and event listings.
- Platform-agnostic extraction, normalization, change detection, and application-link capture.
- Explainable fit scoring, notification, saved jobs, and manual application tracking.
- A direct link to the canonical company application page.
- No form filling, browser automation, or submission.

### Later releases

- Assisted prefill for validated ATS/form versions.
- User-reviewed submission.
- Constrained auto-submit only after the form and all answers pass eligibility checks.
- Email/calendar milestone detection and interview preparation workflows.

## Application capability classification

Application automation is separate from discovery. A posting discovered on any company career page remains fully supported for scoring and tracking, even if its application form can never be automated. When automation is introduced, provider detection alone will not be enough: companies can add custom questions or redirect to a different system, so the classifier must inspect the actual application form.

| Level | Meaning | Release-one behavior |
|---|---|---|
| `NOT_ASSESSED` | Automation support has not been evaluated | Link out and track normally |
| `MANUAL_ONLY` | The application cannot be safely automated | Link out and accept manual status updates |
| `ASSISTED_CANDIDATE` | Provider/form looks suitable for future prefill | Label as a candidate; do not fill |
| `AUTO_CANDIDATE` | Form uses supported fields and no blocker was detected | Label as a candidate; do not submit |
| `AUTOMATION_BLOCKED` | CAPTCHA, login, assessment, redirect, unsupported upload, or unknown/custom question | Explain the blocker and require manual application |

Each classification stores `provider`, `provider_confidence`, `application_url`, `form_signature`, `connector_version`, `support_level`, `blocker_codes`, `checked_at`, and `expires_at`. A form change invalidates the classification.

Future application-automation adapter priority:

1. Greenhouse-hosted forms as an early automation candidate.
2. Other repeatable application platforms after interface and terms validation.
3. Customized portals only after provider-specific research and safety testing.

This priority has no effect on which companies or postings release one can discover.

## Fit assessment

Call this a **fit score**, not a probability of success, until enough labeled outcomes exist to calibrate a real probability. A polished number without calibration would be misleading.

Initial score (0–100):

| Signal | Weight | Notes |
|---|---:|---|
| Required skills and experience | 35% | Hard requirements affect the recommendation |
| Resume-to-description semantic match | 25% | Evidence links to resume and posting text |
| Role, location, visa, compensation preferences | 20% | User-configurable |
| Preferred qualifications | 10% | Bonus, not a hard rejection |
| Posting freshness | 10% | Decays with time; uses deadline when available |

Every assessment stores the model/rules version, input versions, confidence, matched evidence, missing requirements, and recommended action. Later, use observed outcomes to calibrate scores by job family without allowing protected traits or proxies.

## Functional requirements

### Discovery

- CSV import: company name, domain, one or more career/event-page URLs, priority, tags, role and event filters, and scan schedule.
- A generic career-page watcher is the baseline and cannot require a known ATS.
- Per-site extraction strategies may use accessible HTML, linked detail pages, sitemaps, embedded structured data, or permitted structured endpoints, while producing normalized job or event records.
- Site-specific extraction rules are optimizations behind the common discovery interface, not product support boundaries.
- Role filters for internships, new-grad jobs, keywords, locations, remote policy, and date range.
- Change detection for opened, edited, closed, and reopened postings.
- Discover official early-career events including information sessions, campus recruiting, office hours, application workshops, conferences, hackathons, webinars, and networking events.
- Search company-owned career, students/graduate, university recruiting, and events pages linked from the user-provided domain; allow users to add missing event sources manually.
- Event filters for audience/eligibility, school, graduation year, topic, virtual/in-person format, location, registration status, and date range.
- Capture event start/end time, timezone, venue or meeting format, registration URL and deadline, capacity/waitlist status when published, organizer, source evidence, and last-checked time.
- Detect announced, updated, rescheduled, cancelled, registration-open, registration-closing, full, and completed event states.
- Deduplicate the same event appearing on multiple official pages while retaining all source links.

### Event recommendations

- Give each event a separate relevance score based on target-company priority, eligibility, role/career interests, location/format preference, registration urgency, and likely preparation value.
- Explain why an event was recommended and never imply that attendance guarantees recruiting preference.
- Notify immediately for high-relevance events with short registration windows; otherwise include them in a digest.
- Support save, dismiss, open registration, mark registered, and propose-calendar-block actions.
- Track registration state separately from attendance state: discovered, saved, registration_open, registered, waitlisted, attended, missed, cancelled, and completed.

### Candidate materials

- Structured profile with education, experience, skills, work authorization, locations, and approved reusable answers.
- Versioned resumes and cover-letter templates.
- Per-application snapshot so historical submissions remain reproducible.
- Encryption for documents and sensitive profile fields.

### Applications

- Detect the provider and assign a versioned application-capability level.
- Link to the canonical company-hosted application page.
- Let the user mark an application submitted and record the resume version, date, URL, and notes.
- Preserve future requirements: review novel questions, stop on automation blockers, capture confirmation evidence, and prevent duplicate submission.

### Tracking and notifications

- Stages: discovered, saved, preparing, ready_for_review, submitted, assessment, interview, offer, rejected, withdrawn, closed.
- Timeline with source attribution and user correction.
- In-app and email first; SMS/push later.
- Digest and quiet-hour support plus immediate alerts for high-fit fresh roles.
- Event reminders for registration deadlines, start times, reschedules, and cancellations.

### Insights and preparation

- Use discovered official events as source-backed recommendations rather than creating unverified event suggestions.
- Summarize permitted LinkedIn, Reddit, and Glassdoor inputs with source date, link, and confidence; clearly distinguish anecdote from verified fact.
- On OA: propose topic distribution, time-boxed study plan, and company-tagged coding questions.
- On interview: separate technical and behavioral plans; generate STAR prompts from the candidate's real history.
- Include coding and system-design question sets with difficulty, rationale, prerequisites, and completion tracking.

### Calendar

- Read availability and write only after explicit calendar authorization.
- Suggest study blocks based on deadline, readiness gaps, and user constraints.
- Coordinate interview/event options but require confirmation before accepting invitations or sending availability.
- Prevent duplicates through external-event IDs and idempotency keys.

## Guardrails and compliance

- Auto-apply is opt-in and disabled by default.
- Never infer or answer protected-class questions.
- Never fabricate credentials or user history.
- Never bypass CAPTCHAs, bot controls, authentication, or source restrictions.
- Honor deletion/export requests and define retention per data category.
- Use least-privilege OAuth scopes and encrypt tokens separately from application data.
- Maintain a complete audit trail of automated decisions and external actions.

## MVP success measures

- Median official-source discovery delay under five minutes.
- Duplicate posting rate below 1%.
- Zero duplicate tracked applications for the same user and posting.
- At least 95% of notifications explain why the role was recommended.
- User correction rate on extracted hard requirements below 10%.
- Track apply-to-OA and apply-to-interview conversion without claiming causality.

## Deliberately deferred

- A universal browser bot for every ATS.
- Form filling or application submission in release one.
- Automatic email sending or interview acceptance.
- Unlicensed scraping of restricted social/review sites.
- Claims of a calibrated interview probability before sufficient outcome data exists.
