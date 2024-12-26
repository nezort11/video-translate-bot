#!/usr/bin/env zsh

set -a
source .env
set +a

YANDEX_CLOUD_API_GATEWAY_URL_REGEX='https://.*apigw.yandexcloud.net/'

# Store the output of the "pnpm serverless info" command in a variable
SERVERLESS_FUNCTION_INFO=$(pnpm serverless:info 2>&1 > /dev/null)

# Use grep to extract the URL value
SERVERLESS_FUNCTION_API_GATEWAY_URL=$(echo $SERVERLESS_FUNCTION_INFO | grep -o $YANDEX_CLOUD_API_GATEWAY_URL_REGEX)

# Append "/webhook" to the URL value
BOT_WEBHOOK_URL="${SERVERLESS_FUNCTION_API_GATEWAY_URL}webhook"

echo "Setting bot webhook url to $BOT_WEBHOOK_URL..."

# https://core.telegram.org/bots/api#setwebhook
pnpm telegraf -m setWebhook -t $BOT_TOKEN -D "{ \"url\": \"$BOT_WEBHOOK_URL\" }"
