FROM node:18-bullseye

RUN apt update && apt install -y ffmpeg

RUN corepack enable && corepack prepare pnpm@8.3.1 --activate

WORKDIR /app

# Copy root monorepo files for better caching of dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches

# Copy all package.json files from the workspace to satisfy pnpm requirements
COPY packages/admin-api/package.json ./packages/admin-api/package.json
COPY packages/admin-dashboard/package.json ./packages/admin-dashboard/package.json
COPY packages/image-translate/package.json ./packages/image-translate/package.json
COPY packages/video-translate-app/package.json ./packages/video-translate-app/package.json
COPY packages/video-translate-bot/package.json ./packages/video-translate-bot/package.json
COPY packages/video-translate-server/package.json ./packages/video-translate-server/package.json
COPY packages/vtrans-service/package.json ./packages/vtrans-service/package.json

# Install dependencies for the bot and its dependencies in the workspace
RUN pnpm install --filter video-translate-bot...

# Copy all other source files
COPY . .

# Build the bot package
RUN pnpm --filter video-translate-bot build

# Run the bot from its package directory
WORKDIR /app/packages/video-translate-bot

# For running image beyond docker compose
CMD ["pnpm", "start"]
