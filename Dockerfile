ARG INSTALLER=pnpm

FROM node:24-alpine AS base

# Install dependencies only when needed
FROM base AS deps
ARG INSTALLER

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
# pnpm-workspace.yaml carries the overrides (typescript/astro pins) and
# allowBuilds, so it must be present for the frozen install to resolve
# exactly like local/CI. pnpm is pinned to the exact version in
# package.json (packageManager: pnpm@12.19.0) — never `latest`.
COPY package.json pnpm-workspace.yaml yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
  if [ "${INSTALLER}" == "yarn" ]; then yarn --frozen-lockfile; \
  elif [ "${INSTALLER}" == "npm" ]; then npm ci; \
  elif [ "${INSTALLER}" == "pnpm" ]; then corepack enable && corepack prepare pnpm@12.19.0 --activate && pnpm i --frozen-lockfile; \
  else echo "Valid installer not set." && exit 1; \
  fi


# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# RUN chmod u+x ./installer && ./installer
ARG INSTALLER
# The builder stage is a fresh image: pnpm activated in the deps stage
# does not carry over, so re-enable corepack + the exact pinned pnpm
# here before running the build.
RUN \
  if [ "${INSTALLER}" == "yarn" ]; then yarn build; \
  elif [ "${INSTALLER}" == "npm" ]; then npm run build; \
  elif [ "${INSTALLER}" == "pnpm" ]; then corepack enable && corepack prepare pnpm@12.19.0 --activate && pnpm run build; \
  else echo "Valid installer not set." && exit 1; \
  fi

# Production image, copy all the files and run nginx
FROM nginx:alpine AS runner
COPY ./config/nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/dist /usr/share/nginx/html

WORKDIR /usr/share/nginx/html
