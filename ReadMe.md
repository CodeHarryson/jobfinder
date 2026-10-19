# JobFinder

JobFinder is a personal job-search radar for monitoring selected employers. It scans company career sites, normalizes U.S.-based openings across many applicant-tracking systems, records meaningful posting changes, and surfaces alerts in a web dashboard and Discord. An optional Gmail integration recognizes application milestones such as confirmations, assessments, interviews, rejections, and offers.

The project is intentionally discovery-first: it helps a candidate find and track opportunities without submitting applications or inventing answers on the candidate's behalf.

## What it does today

- Maintains a configurable watchlist of companies, career sources, role keywords, priorities, and UTC cron constraints.
- Includes starter watchlists for Summer 2027 software engineering, finance, and consulting searches.
- Scans up to 25 sources per scheduled run with bounded concurrency, source leases, and failure backoff.
- Uses dedicated adapters for Greenhouse, Jibe/iCIMS, Ashby, Lever, Eightfold, Workday, Phenom, Oracle HCM, Amazon Jobs, Salesforce Careers, Google Careers, Rippling, and Meta Careers.
- Falls back to structured data and accessible HTML extraction for unknown providers.
- Filters results to U.S. locations and deduplicates postings by company and canonical URL.
- Preserves first-seen timestamps, fingerprints content, and distinguishes new roles from material updates.
- Deactivates a missing posting only after two successful scans omit it, reducing false closures caused by transient source changes.
- Stores targets, jobs, events, scan history, schedules, notifications, and delivery state in PostgreSQL.
- Provides an in-app notification inbox with read, mark-all-read, and dismiss actions.
- Queues Discord alerts in a durable outbox and retries transient delivery failures with backoff.
- Imports direct `rsvp.withgoogle.com/events/...` event pages and can send an immediate Discord event alert.
- Optionally reads Gmail metadata and snippets to infer application status and create preparation-block proposals.

## Current boundaries

JobFinder does **not** currently rank roles against a resume, fill forms, submit applications, write calendar events, or automatically discover events from every configured events page. The Applications view and broader ranking/application automation described in the product documents are future work.

## Architecture

```text
                         +----------------------+
                         |  Next.js dashboard   |
                         +----------+-----------+
                                    |
                         Route handlers under /api
                                    |
            +-----------------------+-----------------------+
            |                       |                       |
     target management       discovery pipeline      Gmail integration
            |                       |                       |
            |              provider adapters +       Google OAuth/API
            |               generic extractor              |
            |                       |                message classifier
            +-----------------------+-----------------------+
                                    |
                              PostgreSQL
                         (schema created lazily)
                                    |
                      notification delivery outbox
                                    |
                              Discord webhook

Inngest cron (every 5 minutes)
  ├─ claims due discovery sources → scans → records changes → drains Discord outbox
  └─ performs incremental Gmail synchronization
```

The application is a modular Next.js monolith. HTTP routes, scheduled functions, provider adapters, domain types, and persistence interfaces remain separated so background workloads can be split out later without changing the core domain model.

### Discovery lifecycle

1. The scheduler atomically claims due sources with PostgreSQL row locks and a four-minute lease.
2. The scanner identifies a supported provider or uses the generic HTML extractor.
3. Fetches are limited to public HTTP(S) addresses, time out after 15 seconds, and reject responses larger than 5 MB.
4. Provider results are normalized into the common `JobPosting` model.
5. Non-U.S. roles are filtered out, and duplicates are resolved in favor of the higher-confidence extraction.
6. PostgreSQL upserts the active jobs and records new or materially changed postings.
7. When Discord is configured, changes are inserted into a durable, idempotent delivery queue.
8. Scan history and per-source health are retained for the health endpoint and failure alerts.

Structured providers run more frequently than generic HTML sources. Consecutive failures use exponential backoff up to six hours, and cron expressions remain constraints on the computed next-run time. Sources with repeated failures generate a rate-limited Discord health alert.

## Technology stack

| Area | Technology |
|---|---|
| Web application | Next.js 16 App Router, React 19, TypeScript 5.9 |
| Database | PostgreSQL via `@neondatabase/serverless` |
| Scheduling | Inngest 4 |
| Extraction | Provider APIs, Cheerio, JSON-LD/HTML fallback |
| Notifications | In-app inbox and Discord webhooks |
| Email integration | Google OAuth, Gmail API, Google Calendar API scopes |
| Tests | Node test runner, Vitest, Testing Library, jsdom |
| Deployment | Render Blueprint plus an external PostgreSQL database |

## Repository layout

```text
src/
  app/                   Next.js pages, styling, and API route handlers
  components/            Dashboard UI and browser tests
  discovery/             Scheduling, scanning, extraction, and ATS adapters
  domain/                Opportunity models and starter company presets
  email/                 Google OAuth, Gmail sync, classification, encryption
  inngest/               Scheduled discovery and Gmail functions
  notifications/         Discord payloads, delivery, retry, and health alerts
  storage/               Repository contract and PostgreSQL implementation
scripts/                  Operational and watchlist synchronization scripts
docs/                     Product specification, architecture, and roadmap
.github/workflows/        Manual discovery/Discord fallback workflow
render.yaml               Render Blueprint configuration
```

## Prerequisites

- Node.js 24 (the deployed service is pinned to Node `24.21.0`)
- npm
- A PostgreSQL connection string; Neon works well, but the code only requires compatible PostgreSQL
- Optional: Inngest for durable schedules
- Optional: a Discord webhook for external alerts
- Optional: a Google Cloud OAuth client for Gmail tracking

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create the local environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Set at least `DATABASE_URL` in `.env.local`:

   ```dotenv
   DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
   ```

   The repository creates and evolves its tables on first use; there is no separate migration command at present.

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000), add a company or starter watchlist, and select **Scan now**.

The server cannot persist data without `DATABASE_URL`. Discord, Inngest, and Google settings are optional unless you use those features.

## Configuration

| Variable | Required | Purpose |
|---|---:|---|
| `DATABASE_URL` | Yes | Server-side PostgreSQL connection string. |
| `CRON_SECRET` | Production automation | Bearer token for scheduled, retry, and Google operational routes. Production routes fail closed when it is absent. |
| `DISCORD_WEBHOOK_URL` | No | Enables durable job alerts, source-health alerts, and event notifications. |
| `INNGEST_EVENT_KEY` | For hosted Inngest | Authenticates events sent to Inngest. |
| `INNGEST_SIGNING_KEY` | For hosted Inngest | Verifies calls from Inngest to the application. |
| `GOOGLE_CLIENT_ID` | Gmail only | Google OAuth web-client ID. |
| `GOOGLE_CLIENT_SECRET` | Gmail only | Google OAuth web-client secret. |
| `GOOGLE_OAUTH_REDIRECT_URI` | Gmail only | OAuth callback; defaults to `<origin>/api/google/callback`. |
| `GMAIL_ALLOWED_EMAIL` | Gmail only | Restricts this personal instance to one Google account. |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Gmail only | Encrypts OAuth tokens and signs OAuth state. Generate with `openssl rand -base64 32`. |

Never expose these variables through client-side `NEXT_PUBLIC_` names or commit a populated environment file.

## Using the dashboard

### Target companies

A target contains a company name and domain, priority, role and event keywords, and one or more sources:

- `CAREERS` — the primary jobs page and the only required source.
- `EARLY_CAREERS` — an optional student or university jobs source.
- `EVENTS` — an optional event source retained for the expanding event pipeline; normal job scans skip it.

The UI supports creating, editing, and removing targets. It also offers curated starter cohorts. Cron values use five-field UTC syntax. The scheduler still applies provider-aware minimum intervals and failure backoff, so a `* * * * *` constraint does not imply a fetch every minute.

### Opportunity discovery

**Scan now** calls the on-demand discovery endpoint. Large watchlists are processed in rotating batches so repeated scans cover every target. Results show the normalized title, company, locations, employment type, application link, and extraction confidence.

Role keywords are applied by provider/extraction logic to focus results on the configured search. Location filtering is intentionally conservative; ambiguous two-letter country/location values are not assumed to be U.S. states.

### Notifications and Discord

Every new or materially updated posting creates an in-app notification. When `DISCORD_WEBHOOK_URL` is set, the same change is queued once per channel. The scheduled Inngest function drains the outbox, respects Discord rate limits, and retries failures. A protected retry route and a command-line delivery script are also available for operations.

### Event import

The Events view currently accepts direct WithGoogle RSVP URLs. Choose an existing watched company and paste a URL matching:

```text
https://rsvp.withgoogle.com/events/...
```

The server fetches and extracts the event, saves it by canonical URL, and reports whether it was new or updated. Other event hosts and automatic event-source scanning are not implemented yet.

## Gmail application tracking

Gmail tracking is independent of discovery and can be omitted entirely.

1. In Google Cloud, enable the Gmail API and Google Calendar API.
2. Create an OAuth web application.
3. Add the appropriate callback URI:

   ```text
   http://localhost:3000/api/google/callback
   https://YOUR_HOST/api/google/callback
   ```

4. Configure all `GOOGLE_*` variables and `GMAIL_ALLOWED_EMAIL`.
5. Visit `/api/google/connect` and authorize the configured account.
6. Configure Inngest, or invoke `POST /api/google/sync` with the automation bearer token.

The Gmail scope is read-only. JobFinder stores message IDs, headers/metadata, a short snippet, classification evidence, and extracted scheduling facts rather than complete message bodies. OAuth access and refresh tokens are encrypted before persistence. Calendar access is currently used to support scheduling context and preparation proposals; JobFinder does not create calendar events.

Recognized categories include application confirmations, online assessments, interview requests, scheduled interviews, rejections, and offers. Message IDs make synchronization idempotent.

## API reference

All bodies and responses are JSON unless noted otherwise.

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/targets` | List watched companies and sources. |
| `POST` | `/api/targets` | Create one target or `{ "targets": [...] }` containing up to 50 targets. |
| `PUT` | `/api/targets/:id` | Replace a target whose body ID matches the route ID. |
| `DELETE` | `/api/targets/:id` | Remove a target. |
| `GET` | `/api/opportunities` | List active normalized jobs. |
| `GET` | `/api/events` | List active recruiting events. |
| `POST` | `/api/events` | Import a WithGoogle event with `{ "url", "companyId" }`. |
| `POST` | `/api/discovery/scan` | Run an on-demand rotating batch; optionally accepts `{ "targets": [...] }`. |
| `GET` | `/api/discovery/scheduled` | Claim and scan due sources; protected in production. |
| `GET` | `/api/discovery/health` | Return the latest scan, failures, source results, and company health. |
| `GET` | `/api/notifications?unread=true` | List all or unread in-app notifications. |
| `PATCH` | `/api/notifications` | Mark every notification read. |
| `PATCH` | `/api/notifications/:id` | Mark one notification read. |
| `DELETE` | `/api/notifications/:id` | Dismiss one notification. |
| `POST` | `/api/notifications/discord/retry` | Drain queued Discord deliveries; protected in production. |
| `GET` | `/api/google/connect` | Begin Google OAuth. |
| `GET` | `/api/google/callback` | Complete Google OAuth. |
| `GET` | `/api/google/status` | Return Gmail connection and classification counts; protected. |
| `POST` | `/api/google/sync` | Queue an immediate Gmail sync; protected. |
| `GET/POST/PUT` | `/api/inngest` | Inngest serve endpoint. |

Protected routes expect:

```http
Authorization: Bearer YOUR_CRON_SECRET
```

Example health request:

```bash
curl http://localhost:3000/api/discovery/health
```

Example scheduled scan:

```bash
curl --fail \
  --header "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/discovery/scheduled
```

## Scheduled operation

The recommended production scheduler is Inngest. After deployment, sync:

```text
https://YOUR_HOST/api/inngest
```

Two functions run every five minutes:

- `scheduled-job-discovery` claims due sources, scans them, drains Discord job alerts, and evaluates source-health alerts.
- `gmail-application-status-sync` incrementally syncs all connected Gmail accounts.

Both functions have concurrency limited to one. Discovery retries twice; Gmail sync retries three times.

The workflow in `.github/workflows/discovery-scan.yml` is a manual operational fallback. It invokes the protected scheduled endpoint and then drains the Discord outbox using repository secrets. It is not the primary scheduler.

## Deploying on Render

[`render.yaml`](render.yaml) defines a free Node web service:

- build: `npm ci && npm run build`
- start: `npm run start -- --hostname 0.0.0.0`
- health check: `/`
- Node: `24.21.0`

To deploy:

1. Connect the repository to a Render Blueprint.
2. Supply `DATABASE_URL` and `CRON_SECRET` when prompted.
3. Add Discord, Inngest, and Google variables for the integrations you use.
4. Deploy and verify `/` and `/api/discovery/health`.
5. Sync `https://YOUR_HOST/api/inngest` in Inngest.
6. If Gmail is enabled, update both `GOOGLE_OAUTH_REDIRECT_URI` and the authorized URI in Google Cloud.

The deployment uses the external PostgreSQL database as its source of truth, so redeploying the web service does not discard application data.

## Development commands

```bash
npm run dev       # start the Next.js development server
npm run build     # create a production build
npm run start     # run the production server after a build
npm test          # run Node unit tests and browser-component tests
npm run test:ui   # run Vitest/jsdom component tests only
npm run typecheck # run TypeScript without emitting files
npm run lint      # run ESLint across the repository
```

Before opening a change, run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Tests cover domain validation, company presets, extraction, provider adapters, batching, cron and schedule behavior, source health, Discord delivery, Gmail classification/encryption, repository behavior, and dashboard interactions.

## Adding or repairing a provider adapter

Provider selection is centralized in `src/discovery/scan-targets.ts`. An adapter should:

1. Detect only the provider configuration it understands.
2. Fetch through the guarded public fetch helpers where possible.
3. Return normalized `JobPosting` records with stable canonical and application URLs.
4. Preserve source evidence and use an honest extraction-confidence value.
5. Avoid treating an empty landing page as a successful zero-result scan when listings were not actually extractable.
6. Add fixtures or mocked API responses and focused tests.

Discovery must remain safe and respectful: do not bypass authentication, CAPTCHAs, access controls, or site terms.

## Reliability and security decisions

- Source URLs are checked against loopback, link-local, and private network targets to reduce SSRF risk.
- External fetches have protocol, timeout, content-type, and response-size checks.
- Scheduled routes fail closed in production without `CRON_SECRET`.
- PostgreSQL leases and `SKIP LOCKED` prevent two scheduler instances from claiming the same source.
- Job changes and Discord deliveries use uniqueness constraints for idempotency.
- Existing jobs survive failed extraction; only successful omissions contribute to deactivation.
- Discord delivery uses an outbox, rate-limit handling, and exponential retries.
- Google OAuth state is signed and short-lived; tokens are encrypted at rest.
- The Gmail connection is restricted to the explicitly configured email address.
- Retrieved web pages and emails are treated as untrusted data, not instructions.

This remains a personal-instance application and does not yet include end-user authentication or multi-tenant authorization. Do not expose it publicly without an appropriate access-control layer.

## Product documentation

- [Product specification](docs/product-spec.md) — goals, user journeys, policy, and planned capabilities.
- [System architecture](docs/architecture.md) — the longer-term module and data-model design.
- [Delivery roadmap](docs/roadmap.md) — staged implementation plan beyond the current release.

These documents describe both implemented and planned behavior. This README is the source of truth for running the repository as it exists today.

## Contributing

Keep changes small, typed, tested, and provider-neutral where possible. Preserve user control, explainability, idempotency, and responsible collection as design constraints. When behavior or configuration changes, update this README and the relevant document under `docs/` in the same pull request.

No license file is currently included, so the repository should be treated as all rights reserved unless the owner adds a license.
