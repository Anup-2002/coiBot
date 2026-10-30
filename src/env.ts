import dotenv from "dotenv";

// Preserve explicit CLI/PM2 environment overrides before loading .env
const preservedEnv: Record<string, string | undefined> = {};
for (const key of [
  "PORT",
  "NODE_ENV",
  "DISABLE_CLOUD_SYNC",
  "DISABLE_FIREBASE",
  "PLAYWRIGHT_BROWSERS_PATH",
  "VITEST",
  "BOT_OUTPUT_DIR",
  "BOT_AUTH_DIR",
]) {
  if (process.env[key] !== undefined) {
    preservedEnv[key] = process.env[key];
  }
}

dotenv.config({ override: true });

for (const [key, val] of Object.entries(preservedEnv)) {
  if (val !== undefined) {
    process.env[key] = val;
  }
}
