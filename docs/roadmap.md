# Delivery roadmap

## Phase 0 — decisions and threat model

- Confirm target users, regions, job families, event categories, notification channels, and career/event-page import format.
- Decide hosted SaaS versus local-first personal tool.
- Define auto-submit policy, data retention, consent, and source-specific terms.
- Create a threat model for resumes, OAuth tokens, browser sessions, and prompt injection.

Exit: agreed product scope, wireframes, data policy, and a representative cross-platform set of target career pages for discovery testing.

## Phase 1 — discovery MVP

- Authentication and onboarding.
- Company CSV import and target management, including optional career, students, and events URLs.
- Candidate profile and versioned resume upload.
- Scheduler and generic page watcher with normalized, deduplicated job and event records.
- Layered extraction for accessible HTML, embedded data, permitted structured sources, and rendered pages.
- Application-destination capture without restricting discovery by ATS/provider.
- Explainable fit scoring and in-app/email notifications.
- Explainable event relevance, registration links, saved events, and deadline/start reminders.
- Canonical apply links and an application board with manual stage updates.

Exit: a user can discover, rank, link out to apply, and track roles and early-career events across a representative mix of company sites. The product performs no form filling or submission.

## Phase 2 — assisted applications

- Approved reusable-answer library.
- Policy engine and application state machine.
- One Greenhouse-hosted prefill adapter in an isolated browser worker, if validation confirms it is suitable.
- Review screen, explicit approval, confirmation capture, retries, and audit trail.
- Gmail/calendar read integrations for milestone suggestions.

Exit: assisted submission works end to end with no duplicate submissions.

## Phase 3 — preparation and calendar

- OA and interview milestone detection.
- Deeper company insights derived from the official events already captured in release one.
- Technical/behavioral preparation plans.
- Coding and system-design practice queues.
- Calendar block proposals, conflict detection, and confirmed writes.

Exit: each active milestone has a realistic, scheduled preparation plan.

## Phase 4 — constrained auto-submit

- Per-company/role allowlists and hard eligibility gates.
- Auto-submit only for fully known forms with approved answers.
- Kill switch, daily caps, anomaly detection, and immediate receipts.
- Outcome analytics and score-calibration research.

Exit: audited pilot shows safe behavior, zero duplicates, and acceptable answer accuracy.

## First engineering slice

Build one vertical path using a varied test set of company career and event pages:

1. Import a target company CSV.
2. Schedule the generic page watcher for each imported or discovered career/event URL.
3. Persist and deduplicate postings and recruiting events.
4. Capture the canonical posting and application URLs without requiring provider detection.
5. Match one resume with an explainable rule-based score.
6. Send job and event email/in-app notifications.
7. Open the canonical apply or registration page and save the item to its tracker.

This slice validates cross-platform discovery and tracking while keeping browser automation, social-source licensing, and AI-generated preparation out of the critical path.

## Decisions needed before scaffolding

- Hosted multi-user SaaS or single-user/local-first application?
- Preferred notification channels for v1: email, SMS, push, Discord, or Slack?
- Which representative company career pages should make up the first cross-platform discovery test set?
- Should Gmail and Google Calendar be the initial integrations?
- Which manual tracking fields are essential beyond stage, date, resume, URL, and notes?
