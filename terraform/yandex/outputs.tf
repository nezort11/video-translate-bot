output "video_translate_bot_code_bucket" {
  value = yandex_storage_bucket.video-translate-bot-code.id
}

output "video_translate_bot_gateway_domain" {
  value = yandex_api_gateway.video-translate-bot-function-gateway.domain
}
