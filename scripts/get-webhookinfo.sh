#!/usr/bin/env zsh

set -a
source .env
set +a

echo "Getting webhook info..."

# https://core.telegram.org/bots/api#setwebhook
pnpm telegraf -m getWebhookInfo -t $BOT_TOKEN
