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
    path = "/queue"
  }
}
