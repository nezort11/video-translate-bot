variable "yc_token" {
  description = "Yandex Cloud IAM Token"
  type        = string
  sensitive   = true
}

variable "ymq_access_key" {
  description = "Yandex Cloud Message Queue service access ke"
  type        = string
}
variable "ymq_secret_key" {
  description = "Yandex Cloud Message Queue service secret key"
  type        = string
  sensitive   = true
}

variable "yc_cloud_id" {
  description = "Yandex Cloud ID"
  type        = string
}

variable "yc_folder_id" {
  description = "Yandex Folder ID"
  type        = string
}

variable "yc_zone" {
  description = "Yandex Cloud Default Zone"
  type        = string
  default     = "ru-central1-a"
}

variable "service_account_id" {
  description = "Service Account ID"
  type        = string
}

variable "container_id" {
  description = "Serverless Container ID"
  type        = string
}

variable "ytdl_storage_bucket_name" {
  description = "Bucket name used by YTDL service for temporary storage"
  type        = string
}
