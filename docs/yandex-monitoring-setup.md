# Yandex Monitoring Dashboard Configuration

This guide explains how to configure a monitoring dashboard in Yandex Cloud using the structured JSON logs implemented in `video-translate-bot` and `youtube-downloader`.

## 1. Create Log-based Metrics

In the Yandex Cloud Console, navigate to **Cloud Logging** -> **Log-based Metrics** and create the following metrics:

### Translation Success Count

- **Name**: `translation_success_count`
- **Filter**: `json_payload.event="translation_attempt_success"`
- **Metric type**: `Counter`

### Translation Error Count

- **Name**: `translation_error_count`
- **Filter**: `json_payload.event="translation_attempt_error"`
- **Metric type**: `Counter`

### Translation Duration (Distribution)

- **Name**: `translation_duration_ms`
- **Filter**: `json_payload.event="translation_attempt_success"`
- **Metric type**: `Distribution`
- **Value extraction**: `json_payload.duration_ms`

### Download Success Count

- **Name**: `download_success_count`
- **Filter**: `json_payload.event="download_success"`
- **Metric type**: `Counter`

---

## 2. Configure Yandex Monitoring Dashboard

Navigate to **Monitoring** -> **Dashboards** and create a new dashboard. Add the following widgets:

### Overview: Success vs Errors (Line Chart)

- **Queries**:
  - `success`: `log_based_metric.translation_success_count{service="video-translate-bot"}`
  - `errors`: `log_based_metric.translation_error_count{service="video-translate-bot"}`

### Translation Performance (Heatmap or Line Chart)

- **Metric**: `log_based_metric.translation_duration_ms`
- **Aggregation**: `avg` or `p95`

### Download Throughput

- **Metric**: `log_based_metric.download_success_count{service="youtube-downloader"}`

---

## 3. Example Log Queries (for Filtering)

You can use these filters in the **Log Explorer** to debug specific issues:

### Find all failed translations

```json
json_payload.event="translation_attempt_error"
```

### Trace a specific video URL

```json
json_payload.url="https://www.youtube.com/watch?v=..."
```

### View performance of Enhanced Mode only

```json
json_payload.event="translation_attempt_success" AND json_payload.mode="enhanced"
```

---

## 4. Automation (Optional)

You can also export these metrics via Terraform using the `yandex_logging_metric` resource:

```hcl
resource "yandex_logging_metric" "translation_success" {
  name        = "translation-success"
  folder_id   = var.folder_id
  log_group_id = yandex_logging_group.my_group.id
  filter      = "json_payload.event=\"translation_attempt_success\""
}
```
