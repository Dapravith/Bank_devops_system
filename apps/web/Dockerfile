# Build context: monorepo root.
# Builds the Next.js operations dashboard using `output: 'standalone'`.

###############################################################
# Stage 1: deps
###############################################################
FROM node:20-alpine AS deps

WORKDIR /app

COPY apps/web/package.json apps/web/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

###############################################################
# Stage 2: build
###############################################################
FROM node:20-alpine AS build

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY apps/web/package.json apps/web/tsconfig.json apps/web/next.config.js apps/web/next-env.d.ts apps/web/.eslintrc.json ./
COPY apps/web/app ./app
COPY apps/web/components ./components
COPY apps/web/lib ./lib
COPY apps/web/types ./types
COPY apps/web/public ./public

# Bake the public API base URL at build time. Production overrides this
# with --build-arg or by re-tagging.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

RUN npm run build

###############################################################
# Stage 3: runtime
###############################################################
FROM node:20-alpine AS runtime

WORKDIR /app

RUN apk add --no-cache tini

ENV NODE_ENV=production \
    PORT=8080 \
    NEXT_TELEMETRY_DISABLED=1

# Next.js standalone output produces server.js + minimal node_modules.
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

RUN chown -R node:node /app

USER node

EXPOSE 8080

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
