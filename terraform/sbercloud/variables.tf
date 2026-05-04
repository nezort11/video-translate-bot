# --- SberCloud Variables ---

variable "sber_access_key" {
  description = "SberCloud Access Key"
  type        = string
  sensitive   = true
}

variable "sber_secret_key" {
  description = "SberCloud Secret Key"
  type        = string
  sensitive   = true
}

variable "sber_region" {
  description = "SberCloud Region"
  type        = string
  default     = "ru-moscow-1"
}
