# JobFinder

JobFinder is a personal job-search copilot that watches selected companies, ranks new internships and recruiting events, and helps the user track applications. Later releases may submit eligible applications using approved profile data.

The product also tracks applications, detects recruiting milestones, recommends preparation material, and coordinates study, interview, and event time with the user's calendar.

## Product principles

- **User control:** `review`, `assisted`, and `auto-submit` modes are configured per company or job filter.
- **No fabricated answers:** uncertain, sensitive, legal, demographic, sponsorship, salary, or novel free-text questions always require review.
- **Explainable matching:** every fit score includes evidence, missing qualifications, freshness, and confidence—not just a percentage.
- **Responsible collection:** prefer company career feeds and permitted APIs. Do not bypass access controls, CAPTCHAs, or site terms.
- **Idempotent automation:** a posting can never produce duplicate applications or duplicate calendar events.

## Release-one scope: discovery and tracking

1. Import target companies by CSV and manage a candidate profile plus versioned resumes.
2. Poll company career and early-career/event sources on a user schedule (default every minute, subject to source rate limits).
3. Normalize and deduplicate internships, early-career roles, and recruiting events as distinct opportunity types.
4. Rank opportunities by resume match, preferences, hard requirements, freshness, and deadline risk.
5. Notify the user with an explanation and an open/save/dismiss action; events also offer registration and calendar actions.
6. Open the company's application page for user-completed applications.
7. Track application stages manually and preserve an auditable timeline.
8. Record the application destination so a future release can assess assisted or automatic application support independently from discovery.

Release one does **not** fill or submit applications. Discovery is application-platform agnostic: it watches the career and early-career pages supplied or discovered for every target company, follows job and event listings, and detects matching changes regardless of where an application or event registration is hosted. Greenhouse and other provider-specific adapters are considered later for application automation only.

## Documents

- [Product specification](docs/product-spec.md)
- [System architecture](docs/architecture.md)
- [Delivery roadmap](docs/roadmap.md)

## Recommended implementation stack

- Web: Next.js + TypeScript
- API/workers: TypeScript with PostgreSQL, Redis, and a durable job queue
- Future browser-assisted applications: Playwright workers isolated per user
- AI: provider-independent structured-output adapter with embeddings for retrieval
- Auth: OIDC provider; encrypted OAuth token vault for Gmail/calendar connections
- Observability: OpenTelemetry, structured logs, error tracking, and immutable audit events

The architecture keeps the scheduler and browser automation outside the web request path so the product can begin as a modular monolith and split into services only when load requires it.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The current foundation includes the release-one dashboard, target-company onboarding, three starter watchlists, separate career/early-career/event sources, role and event filters, normalized job/event domain types, and the provider-neutral discovery strategy interface.

The first discovery pipeline is operational through **Scan now**. It fetches configured career and early-career pages server-side, extracts schema.org job postings, ordinary job links, and common embedded application-state records, filters them by the company role keywords, and deduplicates canonical URLs. Targets, sources, opportunities, and scan history are persisted in a local SQLite database at `data/jobfinder.sqlite`; existing browser-stored targets are migrated automatically on first load, with browser storage retained as an offline fallback.

SQLite is the local-development persistence adapter. A production deployment should point the same repository boundary at a durable hosted database. The protected `GET /api/discovery/scheduled` endpoint is designed for a one-minute scheduler heartbeat; it evaluates each source's five-field UTC cron expression and scans only sources due in that minute. Set `CRON_SECRET` in production and send it as a bearer token. New and materially updated postings are recorded as notification candidates and exposed by `GET /api/notifications?unread=true`.

Outbound notification delivery, rendered-browser fallback, and event extraction remain upcoming stages.

The in-app notification inbox is available from the dashboard. It shows unread counts and enriched job/company details, and supports marking one or all notifications read and dismissing individual items. Outbound email requires provisioning a messaging integration; this repository does not install an unconfigured provider SDK or store placeholder credentials.

Discord is the primary out-of-app delivery channel. Set `DISCORD_WEBHOOK_URL` as a server-only Vercel environment variable. New and materially updated roles are queued in a durable outbox, sent as rich Discord embeds, deduplicated by notification and channel, and retried with exponential backoff after transient failures. The Vercel Hobby-compatible cron runs daily at 13:00 UTC; Pro deployments can change `vercel.json` to `* * * * *` for one-minute discovery.

Validation commands:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```
