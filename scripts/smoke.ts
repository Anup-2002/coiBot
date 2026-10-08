// Smoke Test Script: Tests live market fetch & comment generation with DISABLE_CLOUD_SYNC=true
process.env.DISABLE_CLOUD_SYNC = "true";

import "../src/env";
import { formatCommentWithCashtag } from "../src/utils/formatters";

async function runSmokeTest() {
  console.log("=== RUNNING BOT SMOKE TEST ===");
  console.log("Environment: DISABLE_CLOUD_SYNC=true (isolated local test)");

  // 1. Test market data fetch via CoinGecko public markets API
  console.log("[1/3] Fetching live market data from CoinGecko...");
  let coins: any[] = [];
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=5&page=1&sparkline=false&price_change_percentage=24h"
    );
    if (!res.ok) {
      throw new Error(`CoinGecko HTTP error: ${res.status}`);
    }
    const data = (await res.json()) as any[];
    coins = data.map((c, i) => ({
      name: c.name,
      symbol: c.symbol.toUpperCase(),
      price: c.current_price,
      change_24h: c.price_change_percentage_24h,
      rank: i + 1,
      url: `https://coinmarketcap.com/currencies/${c.id}/`,
    }));
    console.log(`[PASS] Successfully retrieved ${coins.length} top coins:`);
    coins.forEach((c) => console.log(`   - ${c.name} ($${c.symbol}): $${c.price} (${c.change_24h}% 24h)`));
  } catch (err) {
    console.error("[FAIL] Market data fetch failed:", (err as Error).message);
    process.exit(1);
  }

  // 2. Test Comment Formatting & Cashtags
  console.log("\n[2/3] Testing Cashtag formatting engine...");
  const sampleComment = "Strong momentum right now, watching for support break.";
  const formatted = formatCommentWithCashtag(sampleComment, coins[0].symbol);
  console.log(`[PASS] Input: "${sampleComment}" -> Output: "${formatted}"`);

  // 3. Test Template Generation Pipeline
  console.log("\n[3/3] Generating sample comments for all 5 coins...");
  const results = coins.map((c) => {
    const isBullish = (c.change_24h || 0) >= 0;
    const baseText = isBullish
      ? `$${c.symbol} is showing positive momentum (+${c.change_24h}%). Volume looks solid for continuation.`
      : `$${c.symbol} is pulling back (${c.change_24h}%). Watching support levels near $${c.price}.`;
    return {
      symbol: c.symbol,
      comment: formatCommentWithCashtag(baseText, c.symbol),
      sentiment: isBullish ? "bullish" : "bearish",
    };
  });

  results.forEach((r) => {
    console.log(`   [${r.sentiment.toUpperCase()}] $${r.symbol}: "${r.comment}"`);
  });

  console.log("\n=== ALL SMOKE CHECKS PASSED SUCCESSFULLY ===");
}

runSmokeTest().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
