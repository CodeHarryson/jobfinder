# System architecture

## Assumptions

- Start with one deployment and a small user base, while keeping workers independently scalable.
- User-defined company career pages are the authoritative discovery entry points; discovery cannot depend on a known ATS.
- PostgreSQL is the system of record; the queue delivers work at least once.
- Every external side effect uses an idempotency key.

## High-level design

```text
Web / mobile UI
      |
API + policy engine ---------------- Notification adapters
      |                                      |
PostgreSQL ---- outbox ---- durable queue ---+--- email / push / SMS
      |                         |
      |                  scheduler + scanners ---- company career / event pages
      |                         |
      |                  ranking / insight worker ---- AI provider
      |                         |
      +---------------- application orchestrator ---- isolated browser worker
      |
      +---------------- integration worker ---- email / calendar providers
```

Use a modular monolith for API, policy, ranking coordination, and tracking. Run scanners, AI work, integration sync, and browser sessions as queue consumers. This gives clean failure boundaries without premature microservices.

## Modules

| Module | Responsibility |
|---|---|
| Identity & Vault | Accounts, consent, encrypted provider credentials |
| Targets | Companies, sources, filters, schedules, connector health |
| Candidate | Profile, approved answers, resumes, document versions |
| Discovery | Fetch, normalize, deduplicate, version, and close postings/events |
| Events | Classify events, score relevance, track registration/attendance, and issue reminders |
| Capability | Independently assess future form automation support and blockers |
| Ranking | Extract requirements, calculate fit, record evidence and confidence |
| Policy | Decide notify/review/submit and enforce hard safety rules |
| Applications | Prefill, submit, capture confirmation, and maintain timeline |
| Messaging | Templates, channel delivery, quiet hours, digests, retries |
| Insights | Source-backed company/event intelligence and preparation plans |
| Integrations | Calendar and email sync with cursor-based incremental updates |
| Audit | Append-only record of decisions and external side effects |

## Core data model

```text
User 1---* CandidateProfile 1---* ResumeVersion
User 1---* TargetCompany 1---* Source
Source 1---* Posting 1---* PostingVersion
Source 1---* RecruitingEvent 1---* RecruitingEventVersion
Posting 1---* FitAssessment *---1 ResumeVersion
Posting 1---* ApplicationCapability
Posting 1---* Application 1---* ApplicationEvent
Application 1---* SubmissionAttempt
Application 1---* PreparationPlan 1---* StudyTask
User 1---* CalendarConnection 1---* ScheduledBlock
User 1---* Notification
User 1---* SavedEvent *---1 RecruitingEvent
SavedEvent 1---* ScheduledBlock
User 1---* ConsentGrant
User 1---* AuditEvent
```

Important uniqueness constraints:

- `posting(source_id, external_id)`
- `posting(source_id, canonical_detail_url)` when no stable external identifier exists
- `posting(canonical_company_id, canonical_requisition_id)` when requisitions can be resolved across sources
- `application(user_id, posting_id)`
- `recruiting_event(source_id, external_id)`
- `saved_event(user_id, recruiting_event_id)`
- `submission_attempt(application_id, idempotency_key)`
- `scheduled_block(user_id, external_event_id)`

## Posting state flow

```text
scheduled scan -> fetch -> normalize -> fingerprint -> upsert/version
                                               |
                                      new/material change
                                               |
                                      extract -> score
                                               |
                                    notify / save / link out
```

In release one, the flow ends at link-out and tracking. The application orchestrator and browser worker remain future boundaries and are not deployed.

## Platform-agnostic discovery

Each target has one or more user-provided or discovered career and event-page entry URLs. A scanner follows permitted listing and detail-page links and converts results into either a `PostingCandidate` or `EventCandidate` contract. Extraction is layered:

1. Accessible HTML and embedded structured data.
2. Sitemap or permitted structured endpoint discovered from the career page.
3. Rendered-page extraction for sites whose listings require client-side rendering.
4. A versioned, site-specific extraction rule when the generic strategies are insufficient.

All strategies return normalized fields and source evidence. Postings include canonical detail/application URLs, title, locations, description, employment type, and identifiers. Events include canonical detail/registration URLs, type, audience, start/end/timezone, location or virtual format, registration deadline, and status. Both include first-seen time, source timestamps, confidence, and content fingerprints. Provider-specific strategies improve accuracy but never define which target companies the product supports.

The scanner records fetch evidence and extraction confidence. If extraction fails after a page change, it retains existing postings, marks the source degraded, and alerts rather than incorrectly closing every role.

The scheduler stores a user-facing cron expression, resolved timezone, `next_run_at`, and source-specific effective interval. Workers use conditional leases so two schedulers cannot scan the same source concurrently. Failures use exponential backoff with jitter and a dead-letter queue.

## Application state machine

```text
discovered -> saved -> preparing -> ready_for_review -> submitting -> submitted
                               \                       \-> blocked
                                \-> skipped

submitted -> assessment -> interview -> offer
     |             |            |
     +-------------+------------+-> rejected / withdrawn / closed
```

Transitions are commands guarded by expected version. Email-derived transitions are suggestions until confidence passes a configured threshold; contradictions are shown for user resolution rather than silently overwriting state.

## API outline

```text
POST   /v1/targets/import
GET    /v1/targets
PATCH  /v1/targets/{id}
POST   /v1/resumes
GET    /v1/postings?status=&minFit=&company=
GET    /v1/postings/{id}/assessment
POST   /v1/postings/{id}/save
GET    /v1/postings/{id}/application-capability
POST   /v1/postings/{id}/track-application
GET    /v1/applications
POST   /v1/applications/{id}/events
GET    /v1/recruiting-events?company=&from=&to=&minRelevance=
POST   /v1/recruiting-events/{id}/save
POST   /v1/recruiting-events/{id}/registration-status
POST   /v1/recruiting-events/{id}/calendar-proposal
GET    /v1/applications/{id}/preparation-plan
POST   /v1/calendar/blocks/proposals
POST   /v1/calendar/blocks/{id}/confirm
```

Mutation endpoints accept `Idempotency-Key`. Long-running work returns an operation ID and publishes status updates through server-sent events or polling.

Application capability records are conservative and versioned. A future automation-adapter registry maps an application provider and form signature to assisted and automatic support. Discovery does not consult this registry. Unknown signatures fail closed to `NOT_ASSESSED`, `MANUAL_ONLY`, or `AUTOMATION_BLOCKED` without affecting scoring or tracking.

## Security and reliability

- Envelope-encrypt resumes, application answers, and OAuth tokens; rotate keys and redact logs.
- Isolate browser sessions by user and job; use short-lived secrets and destroy session storage afterward.
- Enforce server-side authorization on every user-owned object.
- Use an outbox table so database changes and queued notifications cannot diverge.
- Record prompt/model versions, tool inputs, policy decisions, and user approvals.
- Treat page content, emails, and social posts as untrusted input; never let retrieved text override application policy.
- Alert on scan lag, connector failure rate, duplicate attempts, stuck application states, and notification delivery failures.

## Growth path

Revisit service boundaries when queue lag or team ownership justifies them. Split high-volume discovery strategies from the generic scanner first, then browser automation. Add read replicas/search indexing only after PostgreSQL query and full-text performance becomes a measured constraint. Calibrate outcome probabilities only after collecting enough consented, representative, labeled outcomes.
