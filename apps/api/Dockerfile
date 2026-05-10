###############################################################
# Stage 1: deps
###############################################################
FROM node:20-alpine AS deps

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

###############################################################
# Stage 2: build
###############################################################
FROM node:20-alpine AS build

WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate
RUN npm run build

###############################################################
# Stage 3: prod-deps
###############################################################
FROM node:20-alpine AS prod-deps

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY prisma ./prisma
RUN npx prisma generate

###############################################################
# Stage 4: runtime
###############################################################
FROM node:20-alpine AS runtime

WORKDIR /app

RUN apk add --no-cache openssl tini

ENV NODE_ENV=production \
    PORT=3000

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY package.json ./

RUN chown -R node:node /app

USER node

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
