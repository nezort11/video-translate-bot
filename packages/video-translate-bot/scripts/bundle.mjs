#!/usr/bin/env node
/**
 * esbuild bundle script for video-translate-bot
 *
 * Bundles all TypeScript source + dependencies into a single JS file per entry point.
 * This avoids the pnpm/node_modules symlink issues with Yandex Cloud Functions.
 *
 * Native .node addons that cannot be bundled:
 *   - bufferutil  (optional WebSocket perf addon — falls back gracefully)
 *   - utf-8-validate (optional WebSocket perf addon — falls back gracefully)
 *   - fsevents    (macOS only, not present on Linux)
 */

import * as esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

// Entry points that map to Yandex Cloud Function handlers
const entryPoints = {
  "build/index": path.join(rootDir, "src/index.ts"),
  "build/cleanup": path.join(rootDir, "src/cleanup.ts"),
  "build/report": path.join(rootDir, "src/report.ts"),
};

// Resolve i18next-fs-backend CJS path to avoid its ESM top-level await.
// The package has both /esm/ (with top-level await) and /cjs/ (clean CommonJS).
const i18nextFsBackendCjs = path.dirname(
  require.resolve("i18next-fs-backend/package.json")
) + "/cjs/index.js";

const bufferutilFallback = require.resolve("bufferutil/fallback.js");
const utf8ValidateFallback = require.resolve("utf-8-validate/fallback.js");

/** @type {import('esbuild').BuildOptions} */
const commonOptions = {
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",

  // Alias native modules to their JS fallbacks where possible.
  // This avoids "module not found" errors in the single-file bundle.
  alias: {
    "i18next-fs-backend": i18nextFsBackendCjs,
    bufferutil: bufferutilFallback,
    "utf-8-validate": utf8ValidateFallback,
  },

  // External: packages that cannot be bundled and don't have JS fallbacks.
  external: [
    // fsevents is macOS only and not present on Linux
    "fsevents",
  ],

  logLevel: "info",
};

async function build() {
  console.log("🔨 Building bundles with esbuild...\n");
  console.log("  i18next-fs-backend CJS:", i18nextFsBackendCjs, "\n");

  await Promise.all(
    Object.entries(entryPoints).map(([outfile, entryPoint]) =>
      esbuild
        .build({
          ...commonOptions,
          entryPoints: [entryPoint],
          outfile: path.join(rootDir, `${outfile}.js`),
        })
        .then(() => {
          console.log(`✅ ${outfile}.js`);
        })
        .catch((err) => {
          console.error(`❌ Failed to build ${outfile}:`, err.message);
          process.exit(1);
        })
    )
  );

  console.log("\n✅ All bundles built successfully!");
}

build();
