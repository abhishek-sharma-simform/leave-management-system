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
| GET    | `/leave-requests/me`            | any authenticated      | List the caller's own leave requests                   |
| PATCH  | `/leave-requests/me/:id`        | any authenticated      | Edit one of the caller's own **pending** requests      |
| POST   | `/leave-requests/me/:id/cancel` | any authenticated      | Cancel one of the caller's own **pending** requests    |
| GET    | `/leave-requests/:id/history`   | owner or their manager | View a request's approve/reject decision history       |
| GET    | `/manager/requests`             | MANAGER                | List pending requests for the manager's direct reports |
| GET    | `/manager/requests/:id`         | MANAGER                | View one report's request, plus overlapping team leave |
| POST   | `/manager/requests/:id/approve` | MANAGER                | Approve a pending request                              |
| POST   | `/manager/requests/:id/reject`  | MANAGER                | Reject a pending request (requires a `reason`)         |
| GET    | `/calendar?month=&year=`        | MANAGER                | Team's approved leave for a given month                |

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

## Known gaps

- No input validation library (zod, etc.) — controllers validate manually, field by field.
- No rate limiting on `/auth/login`.
- `npm run build` / `npm start` don't currently produce a runnable `dist/` (`tsc` has
  `noEmit: true`); use `npm run dev` locally.
- No endpoint to view, create, or roll over a `LeaveBalance` — balances only exist for
  whatever `prisma/seed.ts` (or manual DB access) has created.
- `LeaveType.requiresApproval` is not read anywhere yet — all leave types currently require
  manager approval in practice, regardless of this flag's value.
