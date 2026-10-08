// Typed API client for CoinMarketCap Bot backend

export interface ApiStatusResponse {
  status: string;
  isPosting: boolean;
  isStopping?: boolean;
  isGenerating?: boolean;
  isContinuousLoopActive: boolean;
  nextCycleStartTime: number | null;
  continuousLoopIntervalMinutes: number;
  totalCoins: number;
  totalGenerated: number;
  totalSubmitted: number;
  totalSuccess: number;
  totalFailed: number;
  dailyPostCount?: number;
  dailyPostLimit?: number;
  lastPostDate?: string;
  successRate: string;
  currentCoin: string;
  runMode: string;
  activeProfileId?: string | null;
  activeProfileName?: string | null;
  coinsFetchedAt?: number | null;
  commentsGeneratedAt?: number | null;
  coinsFetchedTime?: string | null;
  commentsGeneratedTime?: string | null;
  apiKeys: {
    openai: boolean;
    gemini: boolean;
    cmc: boolean;
    openaiError?: string | null;
    geminiError?: string | null;
  };
  sessionStatus?: string;
}

export interface Profile {
  id: string;
  name: string;
  stateJson?: string;
  isActive?: boolean;
  email?: string;
  dailyPostLimit?: number;
  updatedAt?: string;
}

export const api = {
  async getStatus(): Promise<ApiStatusResponse> {
    const res = await fetch("/api/status");
    if (!res.ok) throw new Error(`Status error: ${res.status}`);
    return res.json();
  },

  async getProfiles(): Promise<{ success: boolean; profiles: Profile[] }> {
    const res = await fetch("/api/profiles");
    return res.json();
  },

  async activateProfile(id: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const res = await fetch("/api/activate-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    return res.json();
  },

  async saveProfile(profile: Partial<Profile>): Promise<{ success: boolean; profile?: Profile; error?: string }> {
    const res = await fetch("/api/save-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    return res.json();
  },

  async deleteProfile(id: string): Promise<{ success: boolean; error?: string }> {
    const res = await fetch("/api/delete-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    return res.json();
  },

  async clearSession(): Promise<{ success: boolean; error?: string }> {
    const res = await fetch("/api/clear-session", { method: "POST" });
    return res.json();
  },

  async updateProfileLimit(id: string, dailyPostLimit: number): Promise<{ success: boolean; profile?: Profile; dailyPostLimit?: number; error?: string }> {
    const res = await fetch("/api/update-profile-limit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, dailyPostLimit }),
    });
    return res.json();
  },

  async setContinuousLoop(active?: boolean, intervalMinutes?: number): Promise<any> {
    const res = await fetch("/api/set-continuous-loop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active, intervalMinutes }),
    });
    return res.json();
  },

  async retrySingle(symbol: string): Promise<any> {
    const res = await fetch("/api/retry-single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    return res.json();
  },

  async checkSystem(): Promise<any> {
    const res = await fetch("/api/check-system");
    return res.json();
  },
};
