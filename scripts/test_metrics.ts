import { MetricsService } from "../src/services/metrics";
import { execSync } from "child_process";
import * as dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../env/.env") });

const folderId = process.env.YC_FOLDER_ID || "b1gjh7irh9poadr6llcg";

async function runTest() {
  console.log("Starting metrics e2e test...");
  console.log("Folder ID:", folderId);

  let token = process.env.YC_IAM_TOKEN;
  if (!token) {
    try {
      console.log("Getting IAM token from yc cli...");
      token = execSync("yc iam create-token").toString().trim();
    } catch (error) {
      console.error(
        "Failed to get IAM token from yc cli. Please set YC_IAM_TOKEN env var."
      );
      process.exit(1);
    }
  }

  const metrics = new MetricsService(token);

  console.log("\n1. Testing Success Metric (Type: video, Mode: enhanced)...");
  await metrics.writeSuccess({ type: "video", mode: "enhanced" });

  console.log("\n2. Testing Success Metric (Type: voice, Mode: regular)...");
  await metrics.writeSuccess({ type: "voice", mode: "regular" });

  console.log(
    "\n3. Testing Error Metric (Type: audio, Error: TranslateException)..."
  );
  await metrics.writeError({ type: "audio", error: "TranslateException" });

  console.log(
    "\n4. Testing Duration Metric (Type: video, Duration: 1500ms)..."
  );
  await metrics.writeDuration(1500, { type: "video", mode: "regular" });

  console.log(
    "\nTest completed. Check Yandex Monitoring dashboard if possible."
  );
}

runTest().catch(console.error);
