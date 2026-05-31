terraform {
  required_providers {
    yandex = {
      source  = "yandex-cloud/yandex"
      version = "0.138.0"
    }
  }
}

provider "yandex" {
  token     = var.yc_token
  cloud_id  = var.yc_cloud_id
  folder_id = var.yc_folder_id
  zone      = "ru-central1-a"
}

variable "yc_token" {
  type      = string
  sensitive = true
}

variable "yc_cloud_id" {
  type = string
}

variable "yc_folder_id" {
  type = string
}

# =============================================================================
# IAM & Service Account for S3
# =============================================================================

resource "yandex_iam_service_account" "storage-sa" {
  name        = "vtb-storage-sa"
  description = "Service account for video-translate-bot S3 storage"
}

resource "yandex_resourcemanager_folder_iam_member" "storage-sa-admin" {
  folder_id = var.yc_folder_id
  role      = "storage.admin"
  member    = "serviceAccount:${yandex_iam_service_account.storage-sa.id}"
}

resource "yandex_iam_service_account_static_access_key" "storage-static-key" {
  service_account_id = yandex_iam_service_account.storage-sa.id
  description        = "Static access key for S3"
}

# =============================================================================
# Object Storage (S3) Buckets
# =============================================================================

resource "yandex_storage_bucket" "env" {
  bucket    = "vtb-env-${var.yc_folder_id}"
  folder_id = var.yc_folder_id
  max_size  = 0
}

resource "yandex_storage_bucket" "vtrans-env" {
  bucket    = "vtb-vtrans-env-${var.yc_folder_id}"
  folder_id = var.yc_folder_id
  max_size  = 0
}

resource "yandex_storage_bucket" "admin-env" {
  bucket    = "vtb-admin-env-${var.yc_folder_id}"
  folder_id = var.yc_folder_id
  max_size  = 0
}

resource "yandex_storage_bucket" "storage" {
  bucket    = "vtb-storage-${var.yc_folder_id}"
  folder_id = var.yc_folder_id
  max_size  = 0
}

resource "yandex_storage_bucket" "code" {
  bucket    = "vtb-code-${var.yc_folder_id}"
  folder_id = var.yc_folder_id
  max_size  = 0
}

resource "yandex_storage_bucket" "ytdl-storage" {
  bucket    = "vtb-ytdl-storage-${var.yc_folder_id}"
  folder_id = var.yc_folder_id
  max_size  = 0
}

# =============================================================================
# Outputs
# =============================================================================

output "s3_access_key" {
  value = yandex_iam_service_account_static_access_key.storage-static-key.access_key
}

output "s3_secret_key" {
  value     = yandex_iam_service_account_static_access_key.storage-static-key.secret_key
  sensitive = true
}

output "bucket_names" {
  value = {
    env          = yandex_storage_bucket.env.bucket
    vtrans_env   = yandex_storage_bucket.vtrans-env.bucket
    admin_env    = yandex_storage_bucket.admin-env.bucket
    storage      = yandex_storage_bucket.storage.bucket
    code         = yandex_storage_bucket.code.bucket
    ytdl_storage = yandex_storage_bucket.ytdl-storage.bucket
  }
}
