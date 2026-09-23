# Leave Management System

A leave management system API — employees submit leave requests against a per-year leave
balance; managers review, approve, or reject them, with a team calendar view. Built as a
proof of concept (Express + Prisma + PostgreSQL).

## Running locally

### 1. Prerequisites

- Node.js (v20+ recommended, for native TypeScript stripping support — see [Runtime model](#runtime-model))
- A running PostgreSQL instance (local install, Docker, or a hosted instance)

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example env file and fill in your own values:

```bash
cp .env.example .env
```

| Variable       | Description                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `PORT`         | Port the API listens on (defaults to `5000` if unset).                                                                   |
| `DATABASE_URL` | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/leave_management`.                             |
| `JWT_SECRET`   | Secret used to sign/verify login JWTs. Any non-empty string works locally; use a long random value in a real deployment. |
| `NODE_ENV`     | `development` \| `production` \| `test`. Controls which env file loads (defaults to `development`).                      |

### 4. Create the database schema

```bash
npx prisma migrate dev
```

This applies all migrations in `prisma/migrations/` to the database pointed at by
`DATABASE_URL`, creating it if it's the first run.

### 5. Seed sample data

```bash
npx prisma db seed
```

This creates one manager and two employees, three leave types, and a starting leave
balance for each employee/leave-type pair for the current year. Credentials (see
`prisma/seed.ts`):

| Role     | Email                 | Password        |
| -------- | --------------------- | --------------- |
| Manager  | `manager@gmail.com`   | `Manager@123`   |
| Employee | `employee@gmail.com`  | `Employee@123`  |
| Employee | `employee2@gmail.com` | `Employee2@123` |

### 6. Start the dev server

```bash
npm run dev
```

The API is served at `http://localhost:<PORT>/api/v1`. `npm run dev` uses `nodemon` to
restart on file changes; there is no separate build step for local development (see
[Runtime model](#runtime-model)).

### Regenerating the Prisma client

If you change `prisma/schema.prisma`, re-run:

```bash
npx prisma generate
```

(`npx prisma migrate dev` also regenerates the client automatically after creating a migration.)

## Runtime model

This project runs TypeScript directly via Node's native TypeScript stripping — there is no
ts-node, tsx, or bundling step for `npm run dev`/`npm start`. `npm run build` (`tsc`) is
type-checking only (`noEmit: true`) and does not currently produce a working `dist/`;
treat this repo as dev-mode-only (`npm run dev`) until a real build step is added.

## API overview

All routes are mounted under `/api/v1`.

| Method | Path                            | Auth                   | Description                                            |
| ------ | ------------------------------- | ---------------------- | ------------------------------------------------------ |
| GET    | `/health`                       | —                      | Liveness check                                         |
| POST   | `/auth/login`                   | —                      | Log in, returns a JWT                                  |
| GET    | `/leave-types`                  | any authenticated      | List leave types                                       |
| POST   | `/leave-requests`               | any authenticated      | Create a leave request                                 |
| GET    | `/leave-requests/me`            | any authenticated      | List the caller's own leave requests (paginated, see below) |
| PATCH  | `/leave-requests/me/:id`        | any authenticated      | Edit one of the caller's own **pending** requests      |
| POST   | `/leave-requests/me/:id/cancel` | any authenticated      | Cancel one of the caller's own **pending** requests    |
| GET    | `/leave-requests/team-on-leave?startDate=&endDate=` | any authenticated | Teammates (same manager) on leave in a date range |
| GET    | `/leave-requests/:id/history`   | owner or their manager | View a request's approve/reject decision history       |
| GET    | `/leave-balances/me?year=`      | any authenticated      | View the caller's own leave balances (default: current year) |
| GET    | `/manager/requests`             | MANAGER                | List pending requests for the manager's direct reports (paginated) |
| GET    | `/manager/requests/:id`         | MANAGER                | View one report's request, plus overlapping team leave |
| POST   | `/manager/requests/:id/approve` | MANAGER                | Approve a pending request                              |
| POST   | `/manager/requests/:id/reject`  | MANAGER                | Reject a pending request (requires a `reason`)         |
| GET    | `/calendar?month=&year=`        | MANAGER                | Team's approved leave for a given month                |

### Pagination, sorting and filtering

`GET /leave-requests/me` and `GET /manager/requests` accept `page` (default `1`),
`limit` (default `20`, max `100`), `sortBy` and `sortOrder` (`asc`|`desc`, default
`desc`) query params, and return `{ data: [...], meta: { page, limit, total,
totalPages } }` instead of a bare array. `sortBy` is restricted to an allowlist
per endpoint (`createdAt`|`startDate`|`status` for `/leave-requests/me`,
`createdAt`|`startDate` for `/manager/requests`) — an out-of-allowlist value is
rejected with 400 rather than being passed through to the database. `/leave-requests/me`
additionally accepts a `status` filter (`PENDING`|`APPROVED`|`REJECTED`|`CANCELLED`).
`GET /calendar` is intentionally not paginated — a single month's results are
already bounded.

**This changed the response shape of `/leave-requests/me` and `/manager/requests`
from a plain array to `{ data, meta }` — a breaking change for any existing
client of those two endpoints.**

### Team-on-leave lookup

`GET /leave-requests/team-on-leave?startDate=&endDate=` is meant to back a leave-request
form's date picker — before submitting, a caller can check who else on their team is
already out for the dates they're considering. It looks up the caller's `managerId` and
returns every other user sharing that same manager whose `APPROVED` or `PENDING` leave
request overlaps `[startDate, endDate]` (inclusive), shaped as `{ startDate, endDate,
teammatesOnLeave: [{ userId, name, email, leaveType, startDate, endDate, status }] }`.
`PENDING` requests are included (not just `APPROVED`) so a caller also sees leave that's
still awaiting a decision, mirroring the overlap check `/manager/requests/:id` already
does for managers. A caller with no manager (or no teammates) gets an empty array, not an
error.

### Request validation

All request bodies, route params, and query params are validated with
[Zod](https://zod.dev) schemas (`src/validators/`) via a `validate(schema, source)`
middleware (`src/middleware/validate.middleware.ts`), rather than hand-rolled
per-field checks. A validation failure returns `400` with
`{ message: "Validation failed", errors: [{ path, message }] }`. `POST /auth/login`
is the one remaining hand-validated endpoint (a trivial two-field check, not
worth a dedicated schema).

## Documented assumptions

These are POC-scope decisions worth calling out explicitly rather than leaving implicit:

- **Balance is reset per year by row, not by a rollover job.** `LeaveBalance` is keyed by
  `(userId, leaveTypeId, year)`. A user only has a usable balance for a given leave type in
  a given year if that row exists — `prisma/seed.ts` creates the current year's rows for
  seeded users. There is no endpoint or scheduled job yet to create/view balances, and no
  "carry unused days into next year" logic; a fresh year requires new balance rows created
  out-of-band (seed script, Prisma Studio, or a future admin endpoint). A request against a
  balance-drawing leave type with no matching row for the current year is rejected with a
  400 ("Leave balance not found for this leave type"), by design — it's treated as "not
  entitled" rather than "entitled to zero".
- **`daysRequested` counts weekdays only, not calendar days.** `calculateLeaveDays`
  (`src/utils/dateUtils.ts`) walks every day from `startDate` to `endDate` inclusive and
  counts Mon–Fri, skipping Sat/Sun. There is no public-holiday calendar — a holiday falling
  on a weekday is still counted as a leave day. (Friday → Monday = 2 days; Monday →
  Wednesday = 3 days.)
- **`LeaveBalance.usedDays` is a running total, updated at approval time — not computed
  live by summing approved requests.** It's incremented by `daysRequested` inside the
  transaction that approves a request (see below), rather than derived on every balance
  check by aggregating `LeaveRequest` rows. This is deliberate:
  - it avoids re-scanning a user's whole request history on every balance check or leave
    request submission;
  - it makes the concurrency guard below possible — a single numeric column can be
    row-locked and atomically incremented, whereas "recompute from all approved requests"
    has no single row to lock against a second concurrent approval;
  - it keeps a balance's value stable and auditable independent of later changes to
    request status history.

  The tradeoff: `usedDays` and the set of `APPROVED` requests can only drift apart through a
  bug (there's no reconciliation job), so any code path that changes a request's status
  to/from `APPROVED` must also update `usedDays` in the same transaction.

## Concurrency guard on approval

`approveLeaveRequest` (`src/controllers/manager.controller.ts`) runs inside a
`prisma.$transaction`, and reads the relevant `LeaveBalance` row with a raw
`SELECT ... FOR UPDATE` instead of `prisma.leaveBalance.findUnique`.

**Why:** balance approval is a classic check-then-act race. Without a lock, two concurrent
approvals of two different pending requests against the same balance (e.g. two rapid clicks,
or two requests approved back-to-back before the first commits) could both:

1. read the same `usedDays`,
2. both compute the same `remaining = allocatedDays - usedDays`,
3. both see enough remaining balance and pass the check,
4. both increment `usedDays` by their own `daysRequested`,

...overdrawing the balance below zero, since neither read saw the other's pending write.

`SELECT ... FOR UPDATE` takes a row-level lock on the matching `LeaveBalance` row for the
duration of the transaction. A second concurrent approval's `FOR UPDATE` query on the same
row blocks until the first transaction commits (or rolls back), then reads the
already-updated `usedDays` and re-checks against the now-current remaining balance — so the
two approvals are serialized around that one row instead of racing. Rejections don't need
this guard since they don't touch `LeaveBalance`.

## Where leave-type rules live

Leave-type-specific behavior is entirely data-driven from the `LeaveType` table
(`prisma/schema.prisma`), not hardcoded per type name or ID:

- `drawsFromBalance` — whether creating/editing a request against this type checks and
  will eventually consume a `LeaveBalance` row (checked in
  `src/controllers/leaveRequest.controller.ts` and `src/services/leaveRequest.service.ts`).
- `defaultAllowanceDays` — the `allocatedDays` a new `LeaveBalance` row is seeded with for
  that type.

Because every place that behaves differently per leave type (`createLeaveRequest`,
`updateLeaveRequest`, `approveLeaveRequest`) branches on `drawsFromBalance` off the
`LeaveType` row looked up by `leaveTypeId` — rather than hardcoding a type name or ID —
adding a new leave type, balance-drawing or not (e.g. "Bereavement Leave" with
`drawsFromBalance: false`), is an `INSERT` into `LeaveType` (or a future admin endpoint),
not a code change or deploy.

Note: `requiresApproval` exists as a column on `LeaveType` and is seeded (`true` for all
current types) but is not yet read by any request/approval code path — every request
currently goes through manager approval regardless of this flag. It's schema groundwork for
an auto-approve path, not an enforced rule yet (see Known gaps).

## Testing

Automated tests use [Vitest](https://vitest.dev) (plus `supertest` for API-level
requests against the exported `src/app.ts`, without starting a real listening
server). Tests run against a **separate** Postgres database — never your dev
database — that gets truncated between tests.

```bash
cp .env.test.example .env.test   # fill in a DATABASE_URL pointing at a *test* database
DATABASE_URL=<your test db url> npx prisma migrate deploy   # one-time, or after new migrations
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # with a coverage report
```

Coverage: unit tests for `calculateLeaveDays` (`tests/unit/`), service-layer tests
for `leaveRequest.service.ts`'s business rules and error codes (`tests/services/`),
and full API tests (`tests/api/`) covering auth, leave-request CRUD/cancel/history,
leave types, leave balances, manager list/get/approve/reject, and the team
calendar — including a dedicated regression test that fires two concurrent
`approve` calls against a balance that can only satisfy one, asserting the
`SELECT ... FOR UPDATE` guard (see below) prevents an overdraw.

## Logging

Logging is plain `console.log`/`console.error` — no logging library. `server.ts` logs
the startup line with `console.log`; every controller's `catch` block and the
top-level `errorHandler` middleware log unexpected errors with `console.error`.
There's no correlation id or structured/JSON log output — kept intentionally
simple for this POC.

## Docker

```bash
docker compose up -d db
docker compose run --rm api npx prisma migrate deploy
docker compose run --rm api npx prisma db seed   # optional, first run only
docker compose up api
```

The API image runs `node src/server.ts` directly against source (there's no
`dist/` build step to bake in — see Runtime model above), with `npx prisma
generate` run at image-build time. `db`'s host port is mapped to `5433` (not the
default `5432`) to avoid colliding with a locally-installed Postgres.

## Known gaps

- No rate limiting on `/auth/login`.
- `npm run build` / `npm start` don't currently produce a runnable `dist/` (`tsc` has
  `noEmit: true`); use `npm run dev` locally (or the Docker image, which runs
  directly against source the same way).
- No endpoint to create or roll over a `LeaveBalance` (viewing one is now supported —
  see `GET /leave-balances/me` above) — new balance rows still only come from
  `prisma/seed.ts` or manual DB access.
- `LeaveType.requiresApproval` is not read anywhere yet — all leave types currently require
  manager approval in practice, regardless of this flag's value.
- No CI pipeline runs the test suite automatically yet — `npm test` is documented but
  manual.
