resource "yandex_logging_group" "video_translate_bot_logs" {
  name        = "video-translate-bot-logs"
  description = "Log group for video-translate-bot structured metrics"
  folder_id   = var.yc_folder_id
  retention_period = "720h" # 30 days
}

# Note: Log-based metrics (translation_success, translation_error, etc.)
# must be created manually in the Yandex Cloud Console -> Logging -> Log-based metrics
# following the documentation in docs/yandex-monitoring-setup.md
# as they are not currently supported by the Terraform provider.

resource "yandex_monitoring_dashboard" "bot_dashboard" {
  name        = "video-translate-bot-monitoring"
  title       = "Video Translate Bot Performance"
  description = "Monitoring dashboard for translation and download metrics"
  folder_id   = var.yc_folder_id

  widgets {
    position {
      x = 0
      y = 0
      w = 24
      h = 8
    }
    chart {
      chart_id = "translation_stats"
      queries {
        # Using folder_id directly to capture metrics once they are created
        target {
          query = "translation_success_count{folder_id=\"${var.yc_folder_id}\", service=\"custom\"}"
          text_mode = true
        }
        target {
          query = "translation_error_count{folder_id=\"${var.yc_folder_id}\", service=\"custom\"}"
          text_mode = true
        }
      }
      visualization_settings {
        title = "Translations (Success vs Error)"
      }
    }
  }

  widgets {
    position {
      x = 0
      y = 8
      w = 24
      h = 8
    }
    chart {
      chart_id = "duration_stats"
      queries {
        target {
          query = "translation_duration_ms{folder_id=\"${var.yc_folder_id}\", service=\"custom\"}"
          text_mode = true
        }
      }
      visualization_settings {
        title = "Translation Duration"
      }
    }
  }

  widgets {
    position {
      x = 0
      y = 16
      w = 8
      h = 8
    }
    chart {
      chart_id = "invocations"
      queries {
        target {
          query = "functions.invocations_count{service_account_id=\"${var.service_account_id}\"}"
        }
        target {
          query = "functions.errors_count{service_account_id=\"${var.service_account_id}\"}"
        }
      }
      visualization_settings {
        title = "Invocations & Errors"
      }
    }
  }

  widgets {
    position {
      x = 8
      y = 16
      w = 8
      h = 8
    }
    chart {
      chart_id = "cpu_usage"
      queries {
        target {
          query = "functions.cpu_usage{service_account_id=\"${var.service_account_id}\"}"
        }
      }
      visualization_settings {
        title = "CPU Usage (%)"
      }
    }
  }

  widgets {
    position {
      x = 16
      y = 16
      w = 8
      h = 8
    }
    chart {
      chart_id = "ram_usage"
      queries {
        target {
          query = "functions.ram_usage{service_account_id=\"${var.service_account_id}\"}"
        }
      }
      visualization_settings {
        title = "RAM Usage (MB)"
      }
    }
  }
}
