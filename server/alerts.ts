import { st } from "./state.ts";
import { getLocalBotSettings } from "./settings.ts";

export function escapeTelegramHtml(str: string): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const TELEGRAM_ALERT_COOLDOWN_MS = 20 * 60 * 1000;
const MAX_TELEGRAM_ALERTS_PER_HOUR = 6;

export async function sendTelegramAlert(
  title: string,
  message: string,
  type: "error" | "warning" | "success" | "info" = "info",
  categoryKey?: string,
  force: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const settings = getLocalBotSettings();
    if (!settings.telegramAlertsEnabled) {
      return { success: false, error: "Telegram alerts are disabled in settings." };
    }
    const token = (settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "").trim();
    const chatId = (settings.telegramChatId || process.env.TELEGRAM_CHAT_ID || "").trim();
    if (!token || !chatId) {
      return { success: false, error: "Missing Telegram Bot Token or Chat ID." };
    }

    const now = Date.now();

    if (!force) {
      if (categoryKey) {
        const lastSent = st.lastTelegramAlertTimes.get(categoryKey);
        if (lastSent && now - lastSent < TELEGRAM_ALERT_COOLDOWN_MS) {
          const remainingMins = Math.ceil((TELEGRAM_ALERT_COOLDOWN_MS - (now - lastSent)) / 60000);
          console.log(`[TELEGRAM] Throttled alert for '${categoryKey}'. Cooldown active for ${remainingMins}m to prevent Telegram spam.`);
          return { success: true };
        }
      }

      while (st.globalTelegramTimestamps.length > 0 && st.globalTelegramTimestamps[0] < now - 3600000) {
        st.globalTelegramTimestamps.shift();
      }
      if (st.globalTelegramTimestamps.length >= MAX_TELEGRAM_ALERTS_PER_HOUR) {
        console.warn(`[TELEGRAM] Throttled alert: Reached maximum emergency limit of ${MAX_TELEGRAM_ALERTS_PER_HOUR} alerts/hour.`);
        return { success: true };
      }
    }

    const icon = type === "error" ? "🚨" : type === "warning" ? "⚠️" : type === "success" ? "✅" : "ℹ️";
    const text = `${icon} <b>${escapeTelegramHtml(title)}</b>\n\n${escapeTelegramHtml(message)}\n\n🕒 <i>${new Date().toLocaleString()}</i>`;

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
    const data: any = await res.json();
    if (!data.ok) {
      console.error("[TELEGRAM] Error sending alert:", data.description);
      return { success: false, error: data.description };
    }

    if (categoryKey) {
      st.lastTelegramAlertTimes.set(categoryKey, now);
    }
    st.globalTelegramTimestamps.push(now);

    return { success: true };
  } catch (err) {
    console.error("[TELEGRAM] Network failure sending alert:", (err as Error).message);
    return false as any;
  }
}

