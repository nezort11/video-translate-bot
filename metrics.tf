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
          query = "log_based_metric.translation_success_count{folder_id=\"${var.yc_folder_id}\"}"
        }
        target {
          query = "log_based_metric.translation_error_count{folder_id=\"${var.yc_folder_id}\"}"
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
          query = "log_based_metric.translation_duration_ms{folder_id=\"${var.yc_folder_id}\"}"
        }
      }
      visualization_settings {
        title = "Avg Translation Duration (ms)"
      }
    }
  }
}
