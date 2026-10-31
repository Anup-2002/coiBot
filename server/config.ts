import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { execSync } from "child_process";
import express from "express";
import dotenv from "dotenv";
import { createRequire } from "module";

export const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "50mb" }));
export { fs, path, os, crypto, execSync, express };

export const isTestEnv = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);

if (!isTestEnv) {
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
} else {
  dotenv.config();
}

// Auto-detect production mode if running from bundled dist/server.cjs or process.env.NODE_ENV is not explicitly set
const isCjs = typeof __filename !== "undefined";
const isBundled = isCjs && (__filename.endsWith("server.cjs") || __filename.includes("dist"));
if (!isTestEnv && (isBundled || !process.env.NODE_ENV)) {
  const hasSrcDir = fs.existsSync(path.join(process.cwd(), "src"));
  if (isBundled || !hasSrcDir) {
    process.env.NODE_ENV = "production";
  } else if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = "development";
  }
}
if (!isTestEnv) {
  console.log(`[SERVER] Detected environment: NODE_ENV=${process.env.NODE_ENV}`);
}

// Auto-detect where Playwright browser is actually installed on disk (user home cache, project local cache, EC2/Docker caches, or custom env)
function resolvePlaywrightBrowsersPath(): string {
  const candidates: string[] = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    candidates.push(path.resolve(process.env.PLAYWRIGHT_BROWSERS_PATH));
  }
  candidates.push(path.join(os.homedir(), ".cache", "ms-playwright"));
  candidates.push(path.join(process.cwd(), ".cache", "ms-playwright"));
  candidates.push("/home/cmcbot/.cache/ms-playwright");
  candidates.push("/home/ubuntu/.cache/ms-playwright");
  candidates.push("/root/.cache/ms-playwright");
  candidates.push("/ms-playwright");

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const items = fs.readdirSync(c);
        if (items.some(f => f.startsWith("chromium") || f.startsWith("chrome") || f.startsWith("firefox"))) {
          return c;
        }
      } catch (_) {}
    }
  }

  const homeCache = path.join(os.homedir(), ".cache", "ms-playwright");
  if (fs.existsSync(homeCache)) return homeCache;
  return path.join(process.cwd(), ".cache", "ms-playwright");
}

process.env.PLAYWRIGHT_BROWSERS_PATH = resolvePlaywrightBrowsersPath();
if (!isTestEnv) {
  console.log(`[PLAYWRIGHT] Auto-detected PLAYWRIGHT_BROWSERS_PATH to: ${process.env.PLAYWRIGHT_BROWSERS_PATH}`);
}

// Bridge symlink: If browser exists in home cache but project .cache doesn't have it, create symlink
if (!isTestEnv) {
  try {
    const projectCache = path.join(process.cwd(), ".cache", "ms-playwright");
    const homeCache = path.join(os.homedir(), ".cache", "ms-playwright");
    if (fs.existsSync(homeCache) && !fs.existsSync(projectCache)) {
      const parentDir = path.dirname(projectCache);
      if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
      fs.symlinkSync(homeCache, projectCache, "dir");
      console.log(`[PLAYWRIGHT] Linked ${projectCache} -> ${homeCache}`);
    }
  } catch (_) {}
}

export const customRequire = typeof require !== "undefined" ? require : createRequire(typeof process !== "undefined" && process.cwd ? "file://" + process.cwd() + "/server.js" : "file:///app/server.js");
export const { chromium } = customRequire("playwright") as typeof import("playwright");

export const PORT = Number(process.env.PORT) || 3000;

function resolveInitialDir(folderName: string, fallbackTmpName: string, envOverride?: string): string {
  if (envOverride) {
    const customDir = path.resolve(envOverride);
    fs.mkdirSync(customDir, { recursive: true });
    return customDir;
  }
  if (isTestEnv) {
    const testDir = path.join(os.tmpdir(), `coibot-test-${folderName}-${process.pid}`);
    fs.mkdirSync(testDir, { recursive: true });
    return testDir;
  }
  const preferred = path.join(process.cwd(), folderName);
  try {
    fs.mkdirSync(preferred, { recursive: true });
    const testFile = path.join(preferred, ".write-test");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    return preferred;
  } catch (_) {
    fs.mkdirSync(fallbackTmpName, { recursive: true });
    return fallbackTmpName;
  }
}

export const initialOutputDir = resolveInitialDir("output", "/tmp/bot-output", process.env.BOT_OUTPUT_DIR);
export const initialAuthDir = resolveInitialDir("auth", "/tmp/bot-auth", process.env.BOT_AUTH_DIR);
export const OUTPUT_DIR = initialOutputDir;

export const isOpenAiConfigured = !!process.env.OPENAI_API_KEY;
export const isCmcConfigured = !!process.env.CMC_API_KEY;

export interface ProfileTimestamps {
  coinsFetchedAt: number | null;
  coinsFetchedTime: string | null;
  commentsGeneratedAt: number | null;
  commentsGeneratedTime: string | null;
}

export interface BotProgressData {
  next_index: number;
  daily_post_count?: number;
  last_post_date?: string;
  daily_post_limit?: number;
  updated_at?: string;
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
  profileId?: string | null;
}

export interface Coin {
  name: string;
  symbol: string;
  price: number;
  change_1h?: number;
  change_24h: number;
  change_7d?: number;
  market_cap: number;
  volume_24h: number;
  cmc_rank?: number;
  slug: string;
  url: string;
}

export interface GeneratedMessage {
  name: string;
  symbol: string;
  url: string;
  message: string;
  sentiment?: "bullish" | "bearish" | "neutral";
}

export interface PostResult {
  name: string;
  symbol: string;
  url: string;
  postUrl?: string;
  coinUrl?: string;
  profileUrl?: string;
  cmcUsername?: string;
  cmcNickname?: string;
  status: "success" | "captcha" | "expired" | "failed" | "retry" | "skipped";
  message: string;
  timestamp: string;
  createdAt?: number;
  sentiment?: "bullish" | "bearish" | "neutral";
  profileId?: string;
}

export type SystemProcessType =
  | "none"
  | "single_posting"
  | "scheduler_cycle"
  | "continuous_loop"
  | "fetching_coins"
  | "generating_comments"
  | "refresh_fresh"
  | "retry_single"
  | "authenticating"
  | "checking_login"
  | "clearing_storage"
  | "switching_profile";

export interface LoginSession {
  browser: any;
  context: any;
  page: any;
  email: string;
}
