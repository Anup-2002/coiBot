#!/usr/bin/env node
/**
 * Telegram Notification Utility for CoinMarketCap Trending Bot & Deployments
 * Usage:
 *   node scripts/telegram-notify.cjs "<Title>" "<Message>" [error|warning|success|info]
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const DEFAULT_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

function getCredentials() {
  let token = process.env.TELEGRAM_BOT_TOKEN;
  let chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    const possiblePaths = [
      path.join(__dirname, "..", "auth", "settings.json"),
      path.join(__dirname, "..", "output", "bot_settings.json"),
      path.join(process.cwd(), "auth", "settings.json"),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        try {
          const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
          if (!token && raw.telegramBotToken) token = raw.telegramBotToken;
          if (!chatId && raw.telegramChatId) chatId = raw.telegramChatId;
        } catch (_) {}
      }
    }
  }

  return {
    token: (token || DEFAULT_BOT_TOKEN).trim(),
    chatId: (chatId || DEFAULT_CHAT_ID).trim(),
  };
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendTelegramAlert(title, message, type = "info") {
  const { token, chatId } = getCredentials();
  if (!token || !chatId) {
    console.error("[TELEGRAM] Missing Bot Token or Chat ID.");
    return false;
  }

  const icon = type === "error" ? "🚨" : type === "warning" ? "⚠️" : type === "success" ? "✅" : "ℹ️";
  const text = `${icon} <b>${escapeHtml(title)}</b>\n\n${escapeHtml(message)}\n\n🕒 <i>${new Date().toLocaleString()}</i>`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("[TELEGRAM] Send error:", data.description);
      return false;
    }
    console.log("[TELEGRAM] Alert delivered successfully to chat", chatId);
    return true;
  } catch (err) {
    console.error("[TELEGRAM] Network failure:", err.message);
    return false;
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const title = args[0] || "System Notification";
  const message = args[1] || "Notification trigger";
  const type = args[2] || "info";

  sendTelegramAlert(title, message, type).then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { sendTelegramAlert, getCredentials, escapeHtml };
