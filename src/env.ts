import dotenv from "dotenv";

// Preserve explicit test/runtime overrides before loading .env (let .env PORT win in production)
const preservedEnv: Record<string, string | undefined> = {};
for (const key of [
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

// Default server timezone to IST (Asia/Kolkata) so EC2 server timestamps match local operator clock
if (!process.env.TZ) {
  process.env.TZ = "Asia/Kolkata";
}
