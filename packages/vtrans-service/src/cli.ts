import { translateVideo, TranslateInProgressException } from "./vtrans";
import { YANDEX_OAUTH_ACCESS_TOKEN } from "./env";

async function translateWithPolling(
  url: string,
  options: {
    useLivelyVoice?: boolean;
    sourceLanguage?: string;
    targetLanguage?: string;
  }
) {
  console.log(`\n🚀 Starting translation for: ${url}`);
  if (options.useLivelyVoice) {
    if (YANDEX_OAUTH_ACCESS_TOKEN) {
      console.log("🔑 Using OAuth Access Token for Live Translation");
    } else {
      console.log(
        "⚠️  Warning: YANDEX_OAUTH_ACCESS_TOKEN is missing. Live translation might fail with status 7 (UNAUTHORIZED)."
      );
    }
  }

  let firstRequest = true;
  let attempt = 1;

  while (true) {
    try {
      const res = await translateVideo(url, {
        firstRequest,
        useLivelyVoice: options.useLivelyVoice,
        sourceLanguage: options.sourceLanguage,
        targetLanguage: options.targetLanguage,
      });

      console.log("\n✅ SUCCESS!");
      console.log(JSON.stringify(res, null, 2));
      return res;
    } catch (err: any) {
      if (err instanceof TranslateInProgressException) {
        const remainingTime = err.data?.remainingTime || 10;
        process.stdout.write(
          `\r⏳ Attempt ${attempt}: In progress... Waiting ${remainingTime}s   `
        );

        await new Promise((resolve) =>
          setTimeout(resolve, remainingTime * 1000)
        );
        firstRequest = false;
        attempt++;
      } else {
        console.error(`\n❌ ERROR: ${err.message}`);
        if (err.data) {
          console.error("DATA:", JSON.stringify(err.data, null, 2));
        }
        process.exit(1);
      }
    }
  }
}

function printUsage() {
  console.log(`
Usage:
  npx tsx src/cli.ts <url> [options]

Options:
  --live              Use Neural/Live voices (default: true)
  --regular           Force regular voices
  --source <lang>     Source language (e.g., en, de, fr)
  --target <lang>     Target language (e.g., ru, en)
  --help              Show this help

Example:
  npx tsx src/cli.ts https://www.youtube.com/watch?v=... --live --source en --target ru
  `);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const url = args[0];
  const useLivelyVoice = !args.includes("--regular");

  let sourceLanguage: string | undefined;
  let targetLanguage: string | undefined;

  const sourceIdx = args.indexOf("--source");
  if (sourceIdx !== -1 && args[sourceIdx + 1]) {
    sourceLanguage = args[sourceIdx + 1];
  }

  const targetIdx = args.indexOf("--target");
  if (targetIdx !== -1 && args[targetIdx + 1]) {
    targetLanguage = args[targetIdx + 1];
  }

  await translateWithPolling(url, {
    useLivelyVoice,
    sourceLanguage,
    targetLanguage,
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
