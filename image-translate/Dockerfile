FROM node:18-bullseye

RUN apt update && apt install chromium -y
RUN corepack enable && corepack prepare pnpm@8.6.9 --activate

WORKDIR /app

COPY ./package.json ./package.json
COPY ./pnpm-lock.yaml ./pnpm-lock.yaml

RUN pnpm install

COPY . .

RUN pnpm build
