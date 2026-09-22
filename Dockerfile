# This project runs TypeScript directly via Node's native TypeScript stripping
# (see CLAUDE.md / README "Runtime model") — there is no build step that produces
# a dist/ folder (tsc has noEmit: true), so this image runs `node src/server.ts`
# against source, the same way `npm start`/`npm run dev` do locally.
FROM node:22-bookworm-slim

WORKDIR /app

# bcrypt has native bindings; prebuilt binaries are reliably available for
# glibc/Debian but this toolchain guarantees a from-source build still works
# if no matching prebuild is found.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# Generate the Prisma client before copying the rest of the source, so
# unrelated source edits don't invalidate this layer's cache. This is a
# schema-only operation and does not need a reachable database.
COPY prisma ./prisma
COPY prisma7.config.ts ./prisma7.config.ts
RUN npx prisma generate

COPY . .

ENV NODE_ENV=production

EXPOSE 5000

CMD ["node", "src/server.ts"]
