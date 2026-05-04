# Cloud.ru (Standard/Evolution) S3 Configuration
# Using AWS provider with custom S3 endpoints

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region     = var.sber_region
  access_key = var.sber_access_key
  secret_key = var.sber_secret_key

  endpoints {
    s3 = "https://s3.cloud.ru"
  }

  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_region_validation      = true
  skip_metadata_api_check     = true
  s3_use_path_style           = true
}

# --- S3 Buckets ---

resource "aws_s3_bucket" "video-translate-bot-env" {
  bucket = "video-translate-bot-env"
}

resource "aws_s3_bucket" "video-translate-vtrans-service-env" {
  bucket = "video-translate-vtrans-service-env"
}

resource "aws_s3_bucket" "video-translate-admin-api-env" {
  bucket = "video-translate-admin-api-env"
}

resource "aws_s3_bucket" "video-translate-bot-storage" {
  bucket = "video-translate-bot-storage"
}

resource "aws_s3_bucket" "video-translate-bot-code" {
  bucket = "video-translate-bot-code"
}

resource "aws_s3_bucket" "video-translate-bot-deps" {
  bucket = "video-translate-bot-deps"
}

resource "aws_s3_bucket" "video-translate-ytdl-storage" {
  bucket = "video-translate-ytdl-storage"
}
