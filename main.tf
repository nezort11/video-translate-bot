# https://registry.terraform.io/providers/yandex-cloud/yandex/latest/docs
terraform {
  required_providers {
    yandex = {
      source = "yandex-cloud/yandex"
      version = "0.138.0"
    }
  }
}

provider "yandex" {
  token     = var.yc_token
  cloud_id  = var.yc_cloud_id
  folder_id = var.yc_folder_id
  zone      = var.yc_zone  # "ru-central1-a"
  ymq_access_key = var.ymq_access_key
  ymq_secret_key = var.ymq_secret_key
}

resource "yandex_message_queue" "video-translate-bot-queue" {
  name   = "video-translate-bot-queue"
}

resource "yandex_function_trigger" "video-translate-bot-queue-trigger" {
  name                = "video-translate-bot-queue-trigger"
  description         = "Trigger for container on new messages in my-queue"

  message_queue {
    queue_id = yandex_message_queue.video-translate-bot-queue.arn
    service_account_id = var.service_account_id

    batch_cutoff = 0
    batch_size = 1
  }

  container {
    id = var.container_id
    service_account_id = var.service_account_id
    path = "/queue/callback"
  }
}

resource "yandex_api_gateway" "video-translate-bot-queue-gateway" {
  name        = "video-translate-bot-queue-gateway"
  description = "API Gateway that receives Telegram updates and pushes them to Yandex Message Queue."

  spec = <<EOF
openapi: 3.0.0
info:
  title: "Video Translate Bot Queue API Gateway"
  version: "1.0.0"
paths:
  /callback:
    post:
      x-yc-apigateway-integration:
        type: cloud_ymq
        action: SendMessage
        queue_url: "${yandex_message_queue.video-translate-bot-queue.id}"
        folder_id: "${var.yc_folder_id}"
        service_account_id: "${var.service_account_id}"
      responses:
        "200":
          description: "OK"
EOF
}
