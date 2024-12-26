#!/usr/bin/env zsh

set -a
source .env
set +a

echo "Deleting webhook..."

@# https://core.telegram.org/bots/api#deletewebhook
pnpm telegraf -m deleteWebhook -t $BOT_TOKEN_PROD
