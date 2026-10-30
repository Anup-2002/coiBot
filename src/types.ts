// Types matching backend server structures
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
  status: "success" | "captcha" | "expired" | "failed" | "retry" | "skipped";
  message: string;
  timestamp: string;
  createdAt?: number;
  sentiment?: "bullish" | "bearish" | "neutral";
  profileId?: string;
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
}

export interface Profile {
  id: string;
  name: string;
  stateJson: string;
  isActive: boolean;
  loginStatus?: string;
  dailyPostLimit?: number;
  proxy?: string;
  updatedAt: string;
}

export interface CustomSelectOption {
  value: string | number;
  label: string;
  badge?: string;
}

export type AppView = "dashboard" | "admin" | "scheduler" | "logs" | "health" | "guide";
export type AdminSubTab = "diagnostics" | "secrets" | "telegram" | "security";

