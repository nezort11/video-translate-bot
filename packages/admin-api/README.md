# Admin API

Express backend for the Admin Dashboard, deployed to Yandex Cloud Functions.

## Setup

1. Install dependencies:
```bash
cd packages/admin-api
pnpm install
```

2. Create `.env` file with the following variables:
```bash
PORT=3001
NODE_ENV=development

# Auth - comma-separated Telegram user IDs
ADMIN_IDS=123456789,987654321
JWT_SECRET=your-jwt-secret-change-in-production

# Telegram Bot Token (for initData verification)
BOT_TOKEN_PROD=your-bot-token

# YDB Configuration
YDB_ENDPOINT=grpcs://ydb.serverless.yandexcloud.net:2135
YDB_DATABASE=/ru-central1/your-database-path
```

## Environment on Yandex Cloud Functions

- Env variables are loaded from the mounted `env` bucket (`video-translate-bot-env`) and **not** injected via Terraform.
- Copy your `.env` (and `sakey.json`) into the bucket path used by the function mounts.
- Keep the same keys as the local `.env` (`ADMIN_IDS`, `JWT_SECRET`, `BOT_TOKEN_PROD`, `YDB_ENDPOINT`, `YDB_DATABASE`, etc.).

## Development

```bash
pnpm dev
```

The server will start at http://localhost:3001

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/telegram-init` | Authenticate with Telegram initData |
| GET | `/api/metrics/overview` | Get overview metrics |
| GET | `/api/metrics/new-users` | Get daily new users |
| GET | `/api/metrics/active` | Get active users by period |
| GET | `/api/metrics/dau-history` | Get DAU time series |
| GET | `/api/users` | Get paginated user list |

## Deployment

Build and deploy to Yandex Cloud Functions:

```bash
# From project root
pnpm admin-api:cicd
```

This will:
1. Build the TypeScript code
2. Package the function
3. Upload to S3 bucket
4. Deploy via Terraform

Note: Terraform no longer manages admin API env variables; keep them in the mounted `env` bucket.

