import axios from "axios";
import { YC_FOLDER_ID } from "../env";
import { logger } from "../logger";

const MONITORING_API_URL =
  "https://monitoring.api.cloud.yandex.net/monitoring/v2/data/write";

export class MetricsService {
  private token: string;
  private folderId: string;

  constructor(token: string, folderId: string = YC_FOLDER_ID!) {
    this.token = token;
    this.folderId = folderId;
  }

  private async writeMetric(
    name: string,
    value: number,
    labels: Record<string, string> = {}
  ) {
    if (!this.token) {
      logger.warn("Skipping metric write: No IAM token available");
      return;
    }

    try {
      await axios.post(
        MONITORING_API_URL,
        {
          metrics: [
            {
              name,
              labels,
              value,
            },
          ],
        },
        {
          params: {
            folderId: this.folderId,
            service: "custom", // Important: designates this as a custom metric
          },
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (error: any) {
      logger.error(
        { err: error },
        `Failed to write metric ${name}: ${error.message}`
      );
    }
  }

  async writeSuccess(labels: Record<string, string> = {}) {
    console.log("Writing success metric:", labels);
    await this.writeMetric("translation_success_count", 1, labels);
    console.log("Success metric written");
  }

  async writeError(labels: Record<string, string> = {}) {
    console.log("Writing error metric:", labels);
    await this.writeMetric("translation_error_count", 1, labels);
    console.log("Error metric written");
  }

  async writeDuration(durationMs: number, labels: Record<string, string> = {}) {
    await this.writeMetric("translation_duration_ms", durationMs, labels);
  }
}

// Singleton instance holder (to be initialized per request if needed, or globally if token allows)
// Since token is per-request context in Functions, we might need to instantiate this per request or update the token.
// For simplicity in this functional setup, we will likely instantiate it in the handler.
