# ytdl service

## Install

```sh
# AWS Lambda expects a npm node_modules structure
# pnpm install --shamefully-hoist # doesn't work because of pnpm workspaces
npm install
```

## Setup

```sh
serverless

pnpm app:deploy
```
