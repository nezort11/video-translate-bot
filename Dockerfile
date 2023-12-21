FROM node:18-bullseye

RUN corepack enable && corepack prepare pnpm@8.6.9 --activate

# COPY ./ffmpeg-dist /ffmpeg-dist

WORKDIR /app

COPY ./package.json ./package.json
COPY ./pnpm-lock.yaml ./pnpm-lock.yaml
COPY ./patches ./patches

RUN pnpm install

COPY . .

# RUN pnpm config set unsafe-perm true

RUN pnpm build

# ENV PATH ./node_modules/.bin/:$PATH
# USER node

# RUN chown -Rh $user:$user /app

# For running image without docker compose
# CMD pnpm handler
