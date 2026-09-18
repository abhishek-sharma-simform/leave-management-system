# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A leave management system API (Express + Prisma + PostgreSQL). Employees submit leave requests against a leave balance; managers approve/reject them. Currently implemented: auth, health, and read-only leave types (`GET /api/v1/leave-types`). Leave request/balance/decision endpoints are not yet built (schema for them already exists, see below).

## Commands

```bash
npm run dev                    # start dev server (nodemon, restarts on change)
npm run build                  # type-check only (tsc, noEmit: true — no JS is emitted)
npm start                      # run dist/server.js (requires a real build step first — see Known gaps)

npx prisma migrate dev         # create/apply a migration from schema.prisma changes
npx prisma generate            # regenerate the Prisma client into generated/prisma
node prisma/seed.ts            # seed manager@gmail.com / employee@gmail.com (see seed.ts for passwords)
```

There is no test suite yet (`npm test` is a placeholder).

## Runtime model — read this first

- `"type": "module"` in package.json + Node's native TypeScript stripping. There is **no transpiler** (no ts-node, no tsx) — `node src/server.ts` runs directly.
- Because of this, **every relative import must include the `.ts` extension** (e.g. `import app from "./app.ts"`), and type-only imports from CommonJS packages (like `express`) **must** use `import type { ... }`, not `import { ... }`. A plain `import { Request } from "express"` will crash at runtime with "Named export not found" because Node's stripper only erases imports explicitly marked `import type`; it can't tell a type-only symbol apart from a value otherwise. Missing a `.ts` extension crashes with `ERR_MODULE_NOT_FOUND` instead.
  These two mistakes have already caused crashes twice across separate files (`middleware/auth.middleware.ts`, `middleware/role.middleware.ts`, and the entire `leave-type` route/controller/service trio) — when adding or reviewing **any** new file that imports from `express` or from another local file, check both rules before running. Quick sanity check for missing `.ts` extensions: `grep -rn 'from "\.\.\?/' src --include=*.ts | grep -v '\.ts"'`.
- `tsconfig.json` has `noEmit: true` — `tsc` is used for type-checking only, not building. `npm run build` / `npm start` currently don't produce a working `dist/`; treat this repo as dev-mode (`npm run dev`) only until a real build step is added.
- The Prisma client is generated to `generated/prisma` (not `node_modules/@prisma/client`) and imported from there, e.g. `import { PrismaClient } from "../../generated/prisma/client.ts"`. Re-run `npx prisma generate` after any schema change.

## Architecture

Request flow: `server.ts` → `app.ts` → `routes/index.ts` (mounted at `/api/v1`) → per-feature router → middleware chain → controller → service → Prisma.

- **routes/** wire URLs to controllers and declare the middleware chain per route (e.g. `authMiddleware` then `requireRole("MANAGER")` for protected routes). Keep route files thin — no logic beyond wiring.
- **controllers/** parse/validate `req`, call a service, and shape the HTTP response. No Prisma calls or business logic here.
- **services/** hold business logic and are the only layer that talks to Prisma (`config/prisma.ts`). Errors are thrown as plain `Error`s and caught by the calling controller.
- **middleware/auth.middleware.ts** verifies the JWT and attaches `req.user = { id, role }`. **middleware/role.middleware.ts**'s `requireRole(role)` must run after `authMiddleware` and checks `req.user.role` against the Prisma `Role` enum value. `types/express.d.ts` augments Express's `Request.user` type globally — update it if the JWT payload shape changes.
- **config/env.ts** loads and validates env vars — `DATABASE_URL` is validated at startup; `JWT_SECRET` currently is not (see Known gaps).
- **config/prisma.ts** builds the Prisma client using the `@prisma/adapter-pg` driver adapter over `pg`, not the default connector — this is required by the Prisma 7 setup in this project.
- `notFoundHandler` and `errorHandler` are mounted last, in that order, in `app.ts`. Any new router must be mounted in `routes/index.ts` *before* these two.
- `leave-type.routes.ts` / `.controller.ts` / `.service.ts` is the simplest example of the full route→controller→service→Prisma pattern (a single read-only `findMany`) — use it as the template for new resources rather than `auth`, which is a special case.

## Auth

JWT-based. `POST /api/v1/auth/login` verifies bcrypt password hash, signs a 1-day JWT containing `{ userId, role }`. Protected routes use `authMiddleware` (verifies token, sets `req.user`) followed by `requireRole("MANAGER" | "EMPLOYEE")` where role-gating is needed. `Role` enum lives in `prisma/schema.prisma` (`EMPLOYEE`, `MANAGER`) — keep `requireRole` call sites and JWT payload roles in sync with it.

## Known gaps (worth checking before assuming otherwise)

- `JWT_SECRET` is read via `process.env.JWT_SECRET!` directly in `auth.service.ts` and `auth.middleware.ts` instead of being validated/exported from `config/env.ts` like `DATABASE_URL` is.
- No input validation library (zod, etc.) yet — controllers only check for field presence, not shape.
- No rate limiting on `/auth/login`.
- `npm run build` / `npm start` don't currently produce a runnable `dist/` (tsc has `noEmit: true`).
