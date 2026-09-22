# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A leave management system API (Express + Prisma + PostgreSQL). Employees submit leave requests against a per-year leave balance; managers review, approve, or reject them, and can see a team calendar of approved leave. Currently implemented: auth, health, read-only leave types (`GET /api/v1/leave-types`), leave request create/list/edit/cancel/history (see Leave Requests below), read-only leave balances (see Leave Balances below), manager approve/reject with a concurrency-safe balance guard (see Manager Decisions below), and a manager-only team calendar (see Calendar below). See `README.md` for the full endpoint table, setup instructions, and documented POC assumptions (balance-reset-per-year, weekday-only day counting, `usedDays` as a running total).

## Commands

```bash
npm run dev                    # start dev server (nodemon, restarts on change)
npm run build                  # type-check only (tsc, noEmit: true — no JS is emitted)
npm start                      # run dist/server.js (requires a real build step first — see Known gaps)

npx prisma migrate dev         # create/apply a migration from schema.prisma changes
npx prisma generate            # regenerate the Prisma client into generated/prisma
npx prisma db seed             # seed manager@gmail.com / employee@gmail.com / employee2@gmail.com (see prisma/seed.ts for passwords) — reads the seed command from prisma7.config.ts

npm test                       # run the Vitest suite once (needs a separate test DATABASE_URL — see .env.test.example / README Testing section)
npm run test:watch             # Vitest watch mode
npm run test:coverage          # Vitest with a v8 coverage report

docker compose up -d db        # start a local Postgres for Docker-based dev (see README Docker section)
```

## Runtime model — read this first

- `"type": "module"` in package.json + Node's native TypeScript stripping. There is **no transpiler** (no ts-node, no tsx) — `node src/server.ts` runs directly.
- Because of this, **every relative import must include the `.ts` extension** (e.g. `import app from "./app.ts"`), and type-only imports from CommonJS packages (like `express`) **must** use `import type { ... }`, not `import { ... }`. A plain `import { Request } from "express"` will crash at runtime with "Named export not found" because Node's stripper only erases imports explicitly marked `import type`; it can't tell a type-only symbol apart from a value otherwise. Missing a `.ts` extension crashes with `ERR_MODULE_NOT_FOUND` instead.
  These two mistakes have already caused crashes twice across separate files (`middleware/auth.middleware.ts`, `middleware/role.middleware.ts`, and the entire `leave-type` route/controller/service trio) — when adding or reviewing **any** new file that imports from `express` or from another local file, check both rules before running. Quick sanity check for missing `.ts` extensions: `grep -rn 'from "\.\.\?/' src --include=*.ts | grep -v '\.ts"'`.
- `tsconfig.json` has `noEmit: true` — `tsc` is used for type-checking only, not building. `npm run build` / `npm start` currently don't produce a working `dist/`; treat this repo as dev-mode (`npm run dev`) only until a real build step is added.
- The Prisma client is generated to `generated/prisma` (not `node_modules/@prisma/client`) and imported from there, e.g. `import { PrismaClient } from "../../generated/prisma/client.ts"`. Re-run `npx prisma generate` after any schema change.

## Architecture

Request flow: `server.ts` → `app.ts` → `routes/index.ts` (mounted at `/api/v1`) → per-feature router → middleware chain → controller → service → Prisma.

- **routes/** wire URLs to controllers and declare the middleware chain per route (e.g. `authMiddleware` then `requireRole("MANAGER")` then `validate(schema, source)` for validated routes). Keep route files thin — no logic beyond wiring.
- **controllers/** parse/validate `req`, call a service, and shape the HTTP response. No Prisma calls or business logic here (except the two documented exceptions below).
- **services/** hold business logic and are the only layer that talks to Prisma (`config/prisma.ts`). Errors are thrown as plain `Error`s and caught by the calling controller.
- **validators/** holds Zod schemas, one file per resource (`leaveRequest.validator.ts`, `manager.validator.ts`, `leaveBalance.validator.ts`) plus a shared `pagination.validator.ts` (`paginationQuerySchema`, `sortSchema(allowedFields, defaultField)`). Applied via `middleware/validate.middleware.ts`'s `validate(schema, "body"|"query"|"params")` factory, mounted per-route before the controller. On success it overwrites `req[source]` with the parsed/coerced data (numbers and dates arrive already coerced — controllers no longer re-parse them); `req.query` specifically requires `Object.defineProperty` to overwrite since Express only defines a getter for it, not a setter. On failure it responds 400 with `{ message: "Validation failed", errors: [{ path, message }] }` directly, without calling `next()`. `POST /auth/login` remains hand-validated (trivial, out of scope).
- **middleware/auth.middleware.ts** verifies the JWT and attaches `req.user = { id, role }`. **middleware/role.middleware.ts**'s `requireRole(role)` must run after `authMiddleware` and checks `req.user.role` against the Prisma `Role` enum value. `types/express.d.ts` augments Express's `Request.user` type globally — update it if the JWT payload shape changes.
- **config/env.ts** loads and validates env vars — `DATABASE_URL` is validated at startup; `JWT_SECRET` currently is not (see Known gaps). Also exports `NODE_ENV` (default `development`), and loads `.env.test` instead of `.env` when `NODE_ENV === "test"` (Vitest sets this automatically).
- **config/prisma.ts** builds the Prisma client using the `@prisma/adapter-pg` driver adapter over `pg`, not the default connector — this is required by the Prisma 7 setup in this project. The Prisma config file is `prisma7.config.ts` at the repo root (not the conventional `prisma.config.ts` name) — the CLI auto-discovers it, so `npx prisma <command>` works without a `--config` flag, but a new contributor grepping for `prisma.config.ts` won't find it.
- `notFoundHandler` and `errorHandler` are mounted last, in that order, in `app.ts`. Any new router must be mounted in `routes/index.ts` *before* these two.
- `leave-type.routes.ts` / `.controller.ts` / `.service.ts` is the simplest example of the full route→controller→service→Prisma pattern (a single read-only `findMany`) — use it as the template for new resources rather than `auth`, which is a special case. `leaveBalance.routes.ts` / `.controller.ts` / `.service.ts` follows the same template, camelCase-named to match `leaveRequest.*` rather than `leave-type.*` (a deliberate, documented inconsistency — see Leave Balances below).
- `leaveRequest.routes.ts` / `.controller.ts` / `.service.ts` (mounted at `/leave-requests`) now follows the standard pattern for its edit/cancel/history/list logic: `leaveRequest.service.ts` holds `updateLeaveRequest`, `cancelLeaveRequest`, `getLeaveRequestHistory`, `findOverlappingRequests` (used by the manager endpoints below), and `getMyLeaveRequests` (paginated list, see Leave Requests below), throwing plain `Error`s with short codes (`NOT_FOUND`, `FORBIDDEN`, `ALREADY_APPROVED`, `NOT_PENDING`, `INVALID_DATE_RANGE`, `LEAVE_TYPE_NOT_FOUND`, `BALANCE_NOT_FOUND`, `INSUFFICIENT_BALANCE`) that the controller maps to HTTP status codes via a `switch`. The one remaining exception: `createLeaveRequest` in `leaveRequest.controller.ts` still calls Prisma directly and holds its own balance-check logic rather than delegating to the service (Zod now handles its shape validation at the route layer, but the DB-dependent business checks stay in the controller) — if you touch it again, consider folding it into `leaveRequest.service.ts` to match the other handlers.
- `manager.routes.ts` / `.controller.ts` (mounted at `/manager`) is the same kind of exception: there is no `manager.service.ts` — `manager.controller.ts` calls Prisma directly (including a raw `$queryRaw` for the row-lock in `approveLeaveRequest`, see Manager Decisions below) and holds the approve/reject business logic itself, including its own paginated `findMany`/`count` for `getManagerRequests`. Don't copy this shape for new resources — follow `leave-type` instead.
- **utils/** holds framework-agnostic pure helpers shared across services/controllers (currently just `dateUtils.ts`'s `calculateLeaveDays`, which counts weekdays only). New date/calculation logic that isn't Prisma-specific belongs here rather than inline in a controller.

## Auth

JWT-based. `POST /api/v1/auth/login` verifies bcrypt password hash, signs a 1-day JWT containing `{ userId, role }`. Protected routes use `authMiddleware` (verifies token, sets `req.user`) followed by `requireRole("MANAGER" | "EMPLOYEE")` where role-gating is needed. `Role` enum lives in `prisma/schema.prisma` (`EMPLOYEE`, `MANAGER`) — keep `requireRole` call sites and JWT payload roles in sync with it.

## Leave Requests

- `POST /api/v1/leave-requests` (auth required) — body: `{ leaveTypeId, startDate, endDate, reason? }`, validated by `createLeaveRequestBodySchema` (Zod, `src/validators/leaveRequest.validator.ts`) at the route layer before the controller runs. `reason` is stored on the `note` column of `LeaveRequest` (field names differ — don't assume the request body matches the Prisma model 1:1). Controller still checks `leaveTypeId` exists (DB-dependent, not shape validation) and — only when the leave type's `drawsFromBalance` is true — the caller's `LeaveBalance` row for the current year (`allocatedDays - usedDays`) before creating the request with `status: PENDING`. `daysRequested` is computed via `calculateLeaveDays` (weekdays only, weekends excluded — see `README.md`'s documented assumptions).
- `GET /api/v1/leave-requests/me` (auth required) — lists the authenticated user's own leave requests via `getMyLeaveRequests` in `leaveRequest.service.ts`, paginated: `{ data: [...], meta: { page, limit, total, totalPages } }`. Query params (`listMyRequestsQuerySchema`): `page` (default 1), `limit` (default 20, max 100), `sortBy` (`createdAt`|`startDate`|`status`, default `createdAt`, Zod-enum-restricted — never pass raw query input into Prisma's `orderBy` key), `sortOrder` (`asc`|`desc`, default `desc`), and an optional `status` filter.
- `PATCH /api/v1/leave-requests/me/:id` (auth required) — edits one of the caller's own requests via `updateLeaveRequest` in `leaveRequest.service.ts`. Body validated by `updateLeaveRequestBodySchema`, `:id` by `leaveRequestIdParamsSchema`. Only the request's own owner may edit it, and only while it's `PENDING` (an `APPROVED` request gets a distinct 409 telling the caller to cancel instead of edit; any other non-`PENDING` status gets a generic "only pending requests can be edited" 409). Re-runs the balance check against the (possibly changed) `leaveTypeId`/dates.
- `POST /api/v1/leave-requests/me/:id/cancel` (auth required) — cancels one of the caller's own `PENDING` requests (`cancelLeaveRequest`), setting `status: CANCELLED`. Same owner/pending rules as edit; does not touch `LeaveBalance` since a pending request never incremented `usedDays`.
- `GET /api/v1/leave-requests/:id/history` (auth required) — returns a request plus its `LeaveDecision` history (`getLeaveRequestHistory`), ordered oldest-first. Viewable by the request's owner or by the requester's manager (`request.user.managerId === requesterId`); anyone else gets 403.

## Leave Balances

- `GET /api/v1/leave-balances/me?year=` (auth required, self-service — no role restriction) — `getMyLeaveBalances` in `leaveBalance.service.ts` returns the caller's `LeaveBalance` rows for a year (default: current year, validated 1970–2100 by `leaveBalanceQuerySchema`, same bounds as `/calendar`), reshaped per leave type as `{ leaveTypeId, leaveTypeName, allocatedDays, usedDays, remainingDays }`. A manager with no seeded balance rows legitimately gets `{ year, balances: [] }` — that's a valid empty state, not an error. There is no manager-viewing-a-report's-balance variant yet (no current caller needs it — the approve/reject flow reads `LeaveBalance` directly via raw SQL, not through an endpoint); if added later, follow the same ownership-check pattern as `getLeaveRequestHistory`.

## Manager Decisions

- `GET /api/v1/manager/requests` (MANAGER) — lists `PENDING` requests for the manager's direct reports (`user.managerId === managerId`), paginated the same way as `/leave-requests/me` (`{ data, meta }`, `page`/`limit`/`sortBy`/`sortOrder` via `managerListQuerySchema`) but with a `createdAt`|`startDate` `sortBy` allowlist and **no** `status` filter — it's hardcoded to `PENDING` by design, don't add a filter that lets it drift from that.
- `GET /api/v1/manager/requests/:id` (MANAGER) — one report's request plus `overlappingRequests`: other `APPROVED`/`PENDING` requests from teammates (same `managerId`, excluding the requester) whose date range overlaps this request's, via `findOverlappingRequests` in `leaveRequest.service.ts`.
- `POST /api/v1/manager/requests/:id/approve` (MANAGER) — only for a direct report's `PENDING` request (403 if the caller isn't that user's manager, 403 if the caller is somehow the requester). Runs in a `prisma.$transaction`; if `leaveType.drawsFromBalance` is true, it row-locks the report's `LeaveBalance` for that leave type/year with a raw `SELECT ... FOR UPDATE` (`tx.$queryRaw`, not `tx.leaveBalance.findUnique` — Prisma has no query-builder API for row locks), re-checks `allocatedDays - usedDays >= daysRequested` inside the lock, and increments `usedDays` — all before flipping `status` to `APPROVED` and writing a `LeaveDecision` row. The lock exists specifically so two concurrent approvals against the same balance can't both pass the remaining-balance check and overdraw it (see `README.md`'s Concurrency guard section for the full walkthrough). If `drawsFromBalance` is false, the transaction skips the balance step entirely and just updates status + writes the decision.
- `POST /api/v1/manager/requests/:id/reject` (MANAGER) — same ownership/pending checks as approve. Requires a non-empty string `reason` in the body (400 otherwise); writes `status: REJECTED` and a `LeaveDecision` row with that reason. Never touches `LeaveBalance` — nothing was reserved to release.
- Every decision (approve or reject) is recorded as a row in `LeaveDecision` (`requestId`, `actorId`, `action`, `reason?`, `decidedAt`), which is what `GET /leave-requests/:id/history` reads back.

## Calendar

- `GET /api/v1/calendar?month=&year=` (MANAGER) — `getTeamCalendar` in `calendar.service.ts` returns the manager's team's `APPROVED` requests overlapping the given month (`startDate < startOfNextMonth AND endDate >= startOfMonth`, both computed in UTC). `month`/`year` are required query params, validated as integers in range (`1–12`, `1970–2100`) before being passed to the service.

## Testing

Vitest + `supertest` (against the exported `src/app.ts`, no real listening server needed). Tests run against a **separate** Postgres database (`.env.test`, loaded when `NODE_ENV === "test"` — Vitest sets this automatically) that gets truncated (`tests/helpers/testDb.ts`'s `resetDb()`) in a `beforeEach`, not wrapped in a rolled-back transaction — the concurrency test below needs genuinely concurrent real row locks, which an outer transaction would defeat. `vitest.config.ts` sets `fileParallelism: false` since all test files share that one database. Layout: `tests/unit/` (pure functions), `tests/services/` (business rules via `leaveRequest.service.ts` directly), `tests/api/` (full HTTP via supertest, including `manager.approve.concurrency.test.ts` — two concurrent `approve` calls against a balance that can only satisfy one, asserting the `SELECT ... FOR UPDATE` guard holds). `tests/helpers/factories.ts`/`authToken.ts` build fixtures and sign JWTs directly rather than going through `/auth/login` for speed. See `README.md`'s Testing section for the `.env.test` setup steps.

## Logging

Logging is plain `console.log`/`console.error` — no logging library, no correlation id, no structured output. `server.ts` logs the startup line with `console.log`; every controller's `catch` block and the top-level `errorHandler` middleware log unexpected errors with `console.error`. Kept intentionally simple for this POC.

## Known gaps (worth checking before assuming otherwise)

- `JWT_SECRET` is read via `process.env.JWT_SECRET!` directly in `auth.service.ts` and `auth.middleware.ts` instead of being validated/exported from `config/env.ts` like `DATABASE_URL` is.
- No rate limiting on `/auth/login`.
- `npm run build` / `npm start` don't currently produce a runnable `dist/` (tsc has `noEmit: true`); the Docker image runs `node src/server.ts` directly against source for the same reason.
- `createLeaveRequest` in `leaveRequest.controller.ts` still calls Prisma directly and holds its own balance-check logic rather than delegating to `leaveRequest.service.ts` (see Architecture above) — Zod now covers its shape validation, but this specific refactor is still open.
- No endpoint to create or roll over a user's `LeaveBalance` (viewing one is now supported, see Leave Balances above) — a request against a leave type with `drawsFromBalance: true` will still 400 with "Leave balance not found" until a balance row exists for that user/leave-type/year, which currently only happens via `prisma/seed.ts` or manual DB access (Prisma Studio, etc.).
- `LeaveType.requiresApproval` exists as a column and is seeded `true` for every current leave type, but no code path reads it yet — every request currently goes through manager approval regardless of this flag's value. It's schema groundwork for a future auto-approve path, not an enforced rule.
- No CI pipeline runs `npm test` automatically yet.
- See `README.md` for local setup, the full endpoint table, and documented POC-scope assumptions (balance-reset-per-year, weekday-only day counting, `usedDays` as a running total vs. computed live).
