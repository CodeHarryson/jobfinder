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

The discovery pipeline is operational through **Scan now**. It routes configured companies through reusable Greenhouse, Jibe/iCIMS, Ashby, Lever, Eightfold, Workday, Phenom, and Oracle HCM adapters, with a conservative HTML fallback for unknown providers. Results are filtered by role keywords and U.S. location, then deduplicated by canonical URL. A landing page that loads but exposes no job records is reported as a failure and cannot deactivate previously discovered jobs. Targets, sources, opportunities, provider-level scan health, and scan history are persisted in a local SQLite database at `data/jobfinder.sqlite`; existing browser-stored targets are migrated automatically on first load, with browser storage retained as an offline fallback. The latest provider counts and failures are available at `GET /api/discovery/health`.

Neon Serverless Postgres is the durable application database in development and on Render. `DATABASE_URL` is consumed only by server routes. SQLite remains an isolated test and one-time local migration adapter. The protected `GET /api/discovery/scheduled` endpoint evaluates each source's five-field UTC cron expression and scans only sources due in that minute. Set `CRON_SECRET` in production and send it as a bearer token. New and materially updated postings are recorded as notification candidates and exposed by `GET /api/notifications?unread=true`.

Outbound notification delivery, rendered-browser fallback, and event extraction remain upcoming stages.

The in-app notification inbox is available from the dashboard. It shows unread counts and enriched job/company details, and supports marking one or all notifications read and dismissing individual items. Outbound email requires provisioning a messaging integration; this repository does not install an unconfigured provider SDK or store placeholder credentials.

Discord is the primary out-of-app delivery channel. Set `DISCORD_WEBHOOK_URL` on Render to enable queuing, and add the same webhook plus `DATABASE_URL` as GitHub Actions repository secrets so the scheduled workflow can deliver alerts. New and materially updated roles are queued in a durable outbox, sent as rich Discord embeds, deduplicated by notification and channel, and retried with exponential backoff after transient failures.

## Deploy on Render

Connect this GitHub repository to a Render Blueprint using [`render.yaml`](render.yaml). It creates one free Node web service, builds with `npm ci && npm run build`, and starts the Next.js server. The existing Neon database remains the source of truth; no data migration is needed. Enter `DATABASE_URL`, `CRON_SECRET`, `DISCORD_WEBHOOK_URL`, `INNGEST_EVENT_KEY`, and `INNGEST_SIGNING_KEY` when Render prompts for secrets. Use the existing values from the previous host so the app retains its database and notification integrations. If Discord or Inngest is not in use, its corresponding variables can be omitted from the service after creation.

Once the service is live, verify its `/` and `/api/discovery/health` endpoints. The [GitHub Actions discovery workflow](.github/workflows/discovery-scan.yml) calls `https://jobfinder-50iy.onrender.com/api/discovery/scheduled` every 20 minutes (minutes 7, 27, and 47 UTC), then sends queued alerts from the GitHub runner. Add repository Actions secrets named `CRON_SECRET`, `DATABASE_URL`, and `DISCORD_WEBHOOK_URL` with the same values configured on Render. The workflow can also be run manually from the Actions tab. Disable any previous external cron job to avoid duplicate scans.

Each source also has its own UTC scan schedule, checked at request time. The default `* * * * *` is due on every 20-minute invocation; a source with a narrower schedule runs only when it coincides with an invocation. Avoid schedules such as `15 * * * *` with this caller. GitHub may delay or drop scheduled runs during busy periods and automatically disables schedules in public repositories after 60 days without activity; monitor workflow run history.

If Gmail tracking is in use, also configure its Google and Gmail variables from [`.env.example`](.env.example), update `GOOGLE_OAUTH_REDIRECT_URI` and the Google OAuth client's authorized redirect URI to the new `https://YOUR-SERVICE.onrender.com/api/google/callback`, and sync `https://YOUR-SERVICE.onrender.com/api/inngest` in Inngest. The Inngest Gmail sync retains its separate five-minute schedule.

## Gmail application tracking

The Gmail-first application tracker runs independently from job discovery, so existing discovery scans and Discord notifications are unchanged. A durable Inngest function checks Gmail every five minutes, classifies application confirmations, assessments, interview requests, scheduled interviews, rejections, and offers, and deduplicates messages by Gmail message ID. Only metadata, a short Gmail snippet, classification evidence, and scheduling facts are stored; full message bodies and OAuth tokens are not stored in plaintext.

Create a Google Cloud OAuth web client, enable the Gmail API and Google Calendar API, and configure the variables in `.env.example`. Add these authorized redirect URIs:

- `http://localhost:3000/api/google/callback`
- `https://YOUR-SERVICE.onrender.com/api/google/callback`

Then open `/api/google/connect` to authorize the single account named by `GMAIL_ALLOWED_EMAIL`. The requested Gmail scope is read-only. Calendar access is limited to events and free/busy data. The current safety policy creates preparation-block proposals for detected OA/interview dates; it does not write calendar events until a later approval endpoint is added.

Protected operational endpoints use `Authorization: Bearer $CRON_SECRET` in production:

- `GET /api/google/status` returns connection, classification, and proposal counts.
- `POST /api/google/sync` queues an immediate Gmail sync.
- `/api/inngest` serves the durable five-minute sync function.

Validation commands:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```
