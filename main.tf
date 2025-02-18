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

resource "yandex_storage_bucket" "video-translate-bot-env" {
  bucket    = "video-translate-bot-env"
  max_size  = 1073741824 # 1GB
}

resource "yandex_storage_bucket" "video-translate-bot-storage" {
  bucket    = "video-translate-bot-storage"
  max_size  = 5368709120 # 5GB
}

resource "yandex_storage_bucket" "video-translate-bot-code" {
  bucket    = "video-translate-bot-code"
  folder_id = var.yc_folder_id
  max_size  = 1073741824 # 1GB
}

# resource "null_resource" "upload_function" {
#   provisioner "local-exec" {
#     command = "npm run app:upload"
#   }

#   triggers = {
#     always_run = "${timestamp()}"  # Ensures the script runs on every apply
#   }
# }

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

resource "yandex_function" "video-translate-bot-function" {
  name       = "video-translate-bot-function"
  user_hash  = filebase64sha256("video-translate-bot.zip")
  runtime    = "nodejs18"
  entrypoint = "build/index.lambdaHandler"
  service_account_id = var.service_account_id

  memory = 128
  execution_timeout = 30

  async_invocation {
    retries_count = 1
  }

# Error: Zip archive content size 43654324 exceeds the maximum size 3670016, use object storage to upload the content
#   content {
#     zip_filename = "video-translate-bot.zip"
#   }
  package {
    bucket_name = yandex_storage_bucket.video-translate-bot-code.id
    object_name = "function.zip"
  }

  # https://yandex.cloud/ru/docs/functions/concepts/runtime/environment-variables#files
  # https://yandex.cloud/ru/docs/functions/concepts/mounting
  mounts {
    name = "env" # /function/storage/env
    mode = "ro"
    object_storage {
      bucket = yandex_storage_bucket.video-translate-bot-env.bucket
    }
  }
  mounts {
    name = "storage" # /function/storage/storage
    mode = "rw"
    object_storage {
      bucket = yandex_storage_bucket.video-translate-bot-storage.bucket
    }
  }
}

resource "yandex_api_gateway" "video-translate-bot-function-gateway" {
  name        = "video-translate-bot-function-gateway"
  description = "API Gateway for video-translate-bot-function"
  # execution timeout does not matter because cloud function is invoked asynchronously
#   execution_timeout = "300"

  spec = <<EOF
openapi: 3.0.0
info:
  title: "Video Translate Bot Function API Gateway"
  version: "1.0.0"
paths:
  /webhook:
    post:
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: "${yandex_function.video-translate-bot-function.id}"
        tag: "$latest"
        payload_format_version: "1.0"
        service_account_id: "${var.service_account_id}"
      responses:
        "200":
          description: "ok"
EOF
}
