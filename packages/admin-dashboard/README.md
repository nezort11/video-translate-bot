# Admin Dashboard

Telegram Mini App frontend for the Admin Dashboard, built with Next.js and deployed to Vercel.

## Setup

1. Install dependencies:

```bash
cd packages/admin-dashboard
pnpm install
```

2. Create `.env.local` file:

```bash
# Backend API URL
NEXT_PUBLIC_API_BASE=http://localhost:3001
```

## Development

```bash
pnpm dev
```

The app will start at http://localhost:3002

## Features

- **Overview Dashboard**: KPI cards showing Total Users, DAU, WAU, MAU, New Users, Messages
- **DAU Chart**: Line chart showing daily active users over time
- **New Users Chart**: Bar chart showing new user signups per day
- **Users Page**: Paginated list of users with first seen, last seen, and message count

## Tech Stack

- Next.js 14 (App Router)
- Tailwind CSS
- Recharts for charts
- Telegram Mini Apps SDK
- JWT authentication

## Deployment

Deploy to Vercel:

```bash
# From project root
pnpm admin-dashboard:deploy
```

Set the following environment variable in Vercel:

- `NEXT_PUBLIC_API_BASE`: Your admin API gateway URL

## Telegram Mini App Setup

1. Create a Mini App in BotFather
2. Set the Web App URL to your Vercel deployment
3. Add an `/admin` command that opens the Mini App
4. Add admin user IDs to `ADMIN_IDS` env var on the backend
