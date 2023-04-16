FROM node:18-bullseye

RUN corepack enable && corepack prepare yarn@stable --activate

COPY ./ffmpeg-dist /ffmpeg-dist

WORKDIR /app

COPY ./package.json ./package.json
COPY ./yarn.lock ./yarn.lock
COPY ./.yarnrc.yml ./.yarnrc.yml
COPY ./.yarn ./.yarn

RUN yarn

COPY . .

# RUN yarn config set unsafe-perm true

RUN yarn build

# ENV PATH ./node_modules/.bin/:$PATH
# USER node

RUN chown -Rh $user:$user /app

# For running image without docker compose
# CMD yarn handler
