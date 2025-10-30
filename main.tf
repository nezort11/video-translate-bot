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
  entrypoint = "build/index.handler"
  service_account_id = var.service_account_id

  memory = 512 # required for voice downloading, translating and uploading
  # Sync value with EXECUTION_TIMEOUT environment variable
  execution_timeout = 1800
  concurrency = 5

  # Configure function when invoking asynchronously (with ?integration=async)
  async_invocation {
    retries_count = 0
    service_account_id = var.service_account_id
  }

# Error: Zip archive content size 43654324 exceeds the maximum size 3670016, use object storage to upload the content
#   content {
#     zip_filename = "video-translate-bot.zip"
#   }
  package {
    # Upload to bucket to avoid function installing dependencies restrictions
    # https://yandex.cloud/en/docs/functions/concepts/limits#functions-other-restrictions
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

resource "yandex_function" "ytdl-storage-cleanup" {
  name       = "ytdl-storage-cleanup"
  user_hash  = filebase64sha256("video-translate-bot.zip")
  runtime    = "nodejs18"
  entrypoint = "build/cleanup.handler"
  service_account_id = var.service_account_id

  memory = 128
  execution_timeout = 60

  package {
    bucket_name = yandex_storage_bucket.video-translate-bot-code.id
    object_name = "function.zip"
  }

  mounts {
    name = "env" # /function/storage/env
    mode = "ro"
    object_storage {
      bucket = yandex_storage_bucket.video-translate-bot-env.bucket
    }
  }

  environment = {
    CLEANUP_MINUTES      = "60"
    YTDL_STORAGE_BUCKET  = var.ytdl_storage_bucket_name
    S3_ENDPOINT          = "https://storage.yandexcloud.net"
    S3_REGION            = var.yc_zone
    S3_FORCE_PATH_STYLE  = "true"
  }
}

resource "yandex_function_trigger" "ytdl-storage-cleanup-hourly" {
  name        = "ytdl-storage-cleanup-hourly"
  description = "Run cleanup every hour"

  timer {
    # Every hour at minute 0
    cron_expression = "0 * * * ? *"
  }

  function {
    id = yandex_function.ytdl-storage-cleanup.id
    service_account_id = var.service_account_id
  }
}

resource "yandex_message_queue" "video-translate-bot-function-queue" {
  name   = "video-translate-bot-function-queue"
}

resource "yandex_function_trigger" "video-translate-bot-function-queue-trigger" {
  name                = "video-translate-bot-function-queue-trigger"
  description         = "Trigger for function on new messages in my-queue"

  message_queue {
    queue_id = yandex_message_queue.video-translate-bot-function-queue.arn
    service_account_id = var.service_account_id

    batch_cutoff = 0
    batch_size = 1
  }

  function {
    id = yandex_function.video-translate-bot-function.id
    service_account_id = var.service_account_id
    # Not supported for YMQ trigger
    # retry_attempts = 1
    # retry_interval = 100
  }
}

resource "yandex_api_gateway" "video-translate-bot-function-gateway" {
  name        = "video-translate-bot-function-gateway"
  description = "API Gateway for video-translate-bot-function"
  # execution timeout does not matter because of message queue
#   execution_timeout = "120"

  spec = <<EOF
openapi: 3.0.0
info:
  title: "Video Translate Bot Function API Gateway"
  version: "1.0.0"
paths:
  /webhook:
    post:
      x-yc-apigateway-integration:
        type: cloud_ymq
        action: SendMessage
        queue_url: "${yandex_message_queue.video-translate-bot-function-queue.id}"
        folder_id: "${var.yc_folder_id}"
        service_account_id: "${var.service_account_id}"
      responses:
        "200":
          description: "ok"
EOF
}

      # Invoking a cloud function using API Gateway extension DOES NOT SUPPORT ASYNCHRONOUS INVOKING
      # https://github.com/yandex-cloud/docs/issues/905#issuecomment-2671016960
      # https://yandex.cloud/en/docs/functions/concepts/function-invoke#extension

      # Function can be invoked asynchronously using https://<gateway-domain>/webhook?integration=async
      # https://yandex.cloud/ru/docs/functions/operations/function/function-invoke-async#invoke
    #   parameters:
    #     - name: integration
    #       in: query
    #       required: true
    #       schema:
    #         type: string
    #         enum: ["async"]

    #   x-yc-apigateway-integration:
    #     type: http
    #     url: "https://functions.yandexcloud.net/${yandex_function.video-translate-bot-function.id}"
    #     method: POST
    #     # headers:
    #     #   Authorization: Bearer ${var.yc_token}
    #     # query:
    #     #     integration: async
    #     # serviceAccountId: "${var.service_account_id}"

    #   x-yc-apigateway-integration:
    #     type: cloud_functions
    #     function_id: "${yandex_function.video-translate-bot-function.id}"
    #     tag: "$latest"
    #     payload_format_version: "1.0"
    #     service_account_id: "${var.service_account_id}"

    #   x-yc-apigateway-integration:
    #     type: cloud_ymq
    #     action: SendMessage
    #     queue_url: "${yandex_message_queue.video-translate-bot-function-queue.id}"
    #     folder_id: "${var.yc_folder_id}"
    #     service_account_id: "${var.service_account_id}"

    #   x-yc-apigateway-integration:
    #     type: http
    #     # don't append /webhook
    #     url: "https://functions.yandexcloud.net/${yandex_function.video-translate-bot-function.id}?integration=async"
    #     method: POST
