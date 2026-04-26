FROM node:18-bullseye AS builder

RUN corepack enable && corepack prepare pnpm@8.3.1 --activate

WORKDIR /app

# Copy root monorepo files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/vtrans-service/package.json ./packages/vtrans-service/package.json

# Install dependencies
RUN pnpm install --filter vtrans-service...

# Copy source
COPY packages/vtrans-service ./packages/vtrans-service

# Build
RUN pnpm --filter vtrans-service build

# Deploy to a self-contained directory
RUN pnpm --filter vtrans-service --prod deploy /app-deployed

FROM node:18-bullseye-slim

WORKDIR /app

# Copy the deployed self-contained package
COPY --from=builder /app-deployed ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Use node to run the build
CMD ["node", "build/dev.js"]
