import OpenAI from "openai";
import { GoogleGenAI, Type } from "@google/genai";
import { type Coin, type GeneratedMessage } from "./config.ts";
import { st } from "./state.ts";
import { addLog } from "./logger.ts";
import { readJsonFile, writeJsonFile } from "./files.ts";
import { getLocalBotSettings, updateRealGenerateTime, saveBotProgress } from "./settings.ts";
import { sanitizeCommentForAntiSpam, generateDynamicUniqueComment } from "../src/utils/formatters.ts";

export function formatCommentWithCashtag(comment: string, symbol: string): string {
  if (!symbol || !comment) return comment || "";
  let cleaned = comment.trim();
  const sym = symbol.trim().replace(/^\$/, "").toUpperCase();
  const cashtag = `$${sym}`;

  // Clean out any doubled leading cashtags e.g. "$BTC $BTC", "$BTC - $BTC", "$BTC with $BTC"
  const doubleTagRegex = new RegExp(`^(\\s*\\$${sym}\\s*[-:,]?\\s*){2,}`, "i");
  if (doubleTagRegex.test(cleaned)) {
    cleaned = cleaned.replace(doubleTagRegex, `${cashtag} `).trim();
  }

  // If the cashtag is already present as a distinct tag, keep as is (no extra prefix)
  if (cleaned.toUpperCase().includes(cashtag)) {
    return cleaned;
  }
  
  // If the symbol appears as a standalone word without $, replace the first occurrence
  const escapedSym = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordRegex = new RegExp(`\\b${escapedSym}\\b`, "i");
  if (wordRegex.test(cleaned)) {
    return cleaned.replace(wordRegex, cashtag);
  }
  
  // Otherwise, prepend the cashtag naturally with a space
  return `${cashtag} ${cleaned}`;
}

export async function generateMessagesForCoins(coins: Coin[]): Promise<GeneratedMessage[]> {
  if (!coins || coins.length === 0) {
    return [];
  }

  const generatedMessages: GeneratedMessage[] = [];
  const getCoinKey = (c: { symbol: string; url?: string; name?: string }): string => {
    return (c.url || `${c.name || ''}_${c.symbol}`).trim().toLowerCase();
  };

  // Helper to check which coins are still missing generated comments (1-to-1 match for every coin)
  const getMissingCoins = (): Coin[] => {
    const existingKeys = new Set(generatedMessages.map(m => getCoinKey(m)));
    return coins.filter(c => !existingKeys.has(getCoinKey(c)));
  };

  // 1. Primary Model: OpenAI gpt-4o-mini
  if (process.env.OPENAI_API_KEY) {
    try {
      st.lastOpenAiError = null; // Reset previous error if we have a key and are trying again
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      addLog("info", "Initializing OpenAI SDK with gpt-4o-mini...");
      const openai = new OpenAI({
        apiKey: OPENAI_API_KEY,
      });

      const batchSize = 10;
      for (let i = 0; i < coins.length; i += batchSize) {
        if (!st.isGeneratingRunning) {
          addLog("warning", "Comment generation aborted by user.");
          break;
        }
        const chunk = coins.slice(i, i + batchSize);
        const schedPrefix = st.isSchedulerCycleRunning ? "[SCHEDULER] " : "";
        addLog("info", `${schedPrefix}Generating batch of comments ${Math.floor(i / batchSize) + 1}/${Math.ceil(coins.length / batchSize)} with gpt-4o-mini...`);

        const prompt = `
          Generate ONE unique, insightful, human-sounding crypto community comment for EACH of the following coins, AND classify the sentiment as either "bullish" or "bearish".

          CRITICAL Anti-Spam & Moderation Rules (Preventing Comment Removal & Account Bans):
          - ANTI-REMOVAL DIRECTIVE: CoinMarketCap automated moderation flags and removes repetitive comments, promotional hype, or generic bot spam. Write authentic, analytical commentary as an experienced crypto trader analyzing the chart and order book.
          - STRICTLY FORBIDDEN: NEVER use spam words like "100x", "moon", "pump", "dump", "presale", "airdrop", "telegram", "whatsapp", "dm me", or links.
          - DO NOT write any cashtag prefix like "$BTC", "$ETH", "$DGAI" or "#SYMBOL". CoinMarketCap already attaches and displays the official coin cashtag chip automatically on the comment. Writing "$SYMBOL" causes duplicate tags and glued text.
          - STRICTLY FORBIDDEN REPETITIVE PHRASES: Do NOT use phrases like "struggling to find its footing", "anyone else worried about this recent dip", "could this be the start of something bigger", "making small gains today", "is a bummer", "showing signs of weakness", "turnaround on the horizon".
          - Rotate dynamically across these 5 authentic trader archetypes:
            1. Technical & Price Structure (e.g. "Consolidating tightly above local support on the 4H chart. Clean retest here could trigger the next wave up.")
            2. Volume & Order Flow (e.g. "Noticeable uptick in buy-side volume over the past few hours. Bulls absorbing sell pressure nicely.")
            3. Relative Strength & Accumulation (e.g. "Showing solid relative strength while broader markets remain choppy. Steady accumulation taking place.")
            4. Community & Market Debate (e.g. "Testing the upper bounds of the range on expanding volume. Are you holding spot or scaling out here?")
            5. Short & Punchy Reaction (e.g. "Chart structure looking very constructive into the daily close. Watching key levels.")
          - 1 to 2 natural sentences. Varied lengths (some 10-14 words, some 16-24 words).
          - No emojis. No hashtags (#). No disclaimers ("not financial advice").
          - No two comments should share the same opening words or sentence structure!

          Provide the output as a valid JSON object matching this schema:
          {
            "messages": [
              {
                "symbol": "BTC",
                "sentiment": "bullish",
                "message": "Actual clean comment text here"
              }
            ]
          }

          Coins list:
          ${JSON.stringify(chunk.map(c => ({ name: c.name, symbol: c.symbol, price: c.price, change_24h: c.change_24h, rank: c.cmc_rank })))}
        `;

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.85,
          max_tokens: 4000,
        });

        const rawText = response.choices[0].message.content || "{}";
        const parsed = JSON.parse(rawText.trim());
        if (parsed.messages && Array.isArray(parsed.messages)) {
          parsed.messages.forEach((msg: any, msgIdx: number) => {
            const matchCoin = chunk.find(c => c.symbol.toLowerCase() === msg.symbol?.toLowerCase() && !generatedMessages.some(m => getCoinKey(m) === getCoinKey(c))) || (chunk[msgIdx] && !generatedMessages.some(m => getCoinKey(m) === getCoinKey(chunk[msgIdx])) ? chunk[msgIdx] : null);
            if (matchCoin && !generatedMessages.some(m => getCoinKey(m) === getCoinKey(matchCoin))) {
              const formattedComment = sanitizeCommentForAntiSpam(msg.message, matchCoin.symbol);
              generatedMessages.push({
                name: matchCoin.name,
                symbol: matchCoin.symbol,
                url: matchCoin.url,
                message: formattedComment,
                sentiment: msg.sentiment === "bearish" ? "bearish" : "bullish",
              });
            }
          });
        }
      }
    } catch (apiError) {
      const errMsg = (apiError as Error).message;
      addLog("error", `OpenAI API Call failed: ${errMsg}.`);
      st.lastOpenAiError = errMsg;
    }
  }

  // 2. Fallback Model: Gemini gemini-2.5-flash (Send ONLY missing coins - Item 6)
  const missingForGemini = getMissingCoins();
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (missingForGemini.length > 0 && geminiKey) {
    try {
      st.lastGeminiError = null; // Reset previous error if we have a key and are trying again
      addLog("info", `Using Gemini API (gemini-2.5-flash) to generate ${missingForGemini.length} missing comments...`);
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'custom-comment-generator',
          }
        }
      });

      const batchSize = 10;
      for (let i = 0; i < missingForGemini.length; i += batchSize) {
        if (!st.isGeneratingRunning) {
          addLog("warning", "Comment generation aborted by user.");
          break;
        }
        const chunk = missingForGemini.slice(i, i + batchSize);
        addLog("info", `Generating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(missingForGemini.length / batchSize)} with gemini-2.5-flash (${chunk.length} coins)...`);

        const prompt = `
          Generate ONE unique, insightful, human-sounding crypto community comment for EACH of the following coins, AND classify the sentiment as either "bullish" or "bearish".

          CRITICAL Anti-Spam & Moderation Rules (Preventing Comment Removal & Account Bans):
          - ANTI-REMOVAL DIRECTIVE: CoinMarketCap automated moderation flags and removes repetitive comments, promotional hype, or generic bot spam. Write authentic, analytical commentary as an experienced crypto trader analyzing the chart and order book.
          - STRICTLY FORBIDDEN: NEVER use spam words like "100x", "moon", "pump", "dump", "presale", "airdrop", "telegram", "whatsapp", "dm me", or links.
          - DO NOT write any cashtag prefix like "$BTC", "$ETH", "$DGAI" or "#SYMBOL". CoinMarketCap already attaches and displays the official coin cashtag chip automatically on the comment. Writing "$SYMBOL" causes duplicate tags and glued text.
          - STRICTLY FORBIDDEN REPETITIVE PHRASES: Do NOT use phrases like "struggling to find its footing", "anyone else worried about this recent dip", "could this be the start of something bigger", "making small gains today", "is a bummer", "showing signs of weakness", "turnaround on the horizon".
          - Rotate dynamically across these 5 authentic trader archetypes:
            1. Technical & Price Structure (e.g. "Consolidating tightly above local support on the 4H chart. Clean retest here could trigger the next wave up.")
            2. Volume & Order Flow (e.g. "Noticeable uptick in buy-side volume over the past few hours. Bulls absorbing sell pressure nicely.")
            3. Relative Strength & Accumulation (e.g. "Showing solid relative strength while broader markets remain choppy. Steady accumulation taking place.")
            4. Community & Market Debate (e.g. "Testing the upper bounds of the range on expanding volume. Are you holding spot or scaling out here?")
            5. Short & Punchy Reaction (e.g. "Chart structure looking very constructive into the daily close. Watching key levels.")
          - 1 to 2 natural sentences. Varied lengths (some 10-14 words, some 16-24 words).
          - No emojis. No hashtags (#). No disclaimers ("not financial advice").
          - No two comments should share the same opening words or sentence structure!

          Provide the output as a valid JSON object matching this schema:
          {
            "messages": [
              {
                "symbol": "BTC",
                "sentiment": "bullish",
                "message": "Actual clean comment text here"
              }
            ]
          }

          Coins list:
          ${JSON.stringify(chunk.map(c => ({ name: c.name, symbol: c.symbol, price: c.price, change_24h: c.change_24h, rank: c.cmc_rank })))}
        `;

        // Retry Gemini up to 3 times with exponential backoff on 503 or 429 (Item 7)
        let response: any = null;
        for (let gAttempt = 1; gAttempt <= 3; gAttempt++) {
          try {
            response = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: prompt,
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    messages: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          symbol: { type: Type.STRING },
                          sentiment: { type: Type.STRING },
                          message: { type: Type.STRING }
                        },
                        required: ["symbol", "sentiment", "message"]
                      }
                    }
                  },
                  required: ["messages"]
                }
              }
            });
            break; // Succeeded!
          } catch (gErr) {
            const errStr = (gErr as Error).message || "";
            if ((errStr.includes("503") || errStr.includes("429") || errStr.toLowerCase().includes("high demand") || errStr.includes("ResourceExhausted") || errStr.includes("Unavailable")) && gAttempt < 3) {
              addLog("warning", `Gemini returned high-demand or rate-limit status (${errStr}). Retrying batch in ${gAttempt * 2}s (Attempt ${gAttempt + 1}/3)...`);
              await new Promise(resolve => setTimeout(resolve, gAttempt * 2000));
            } else {
              throw gErr;
            }
          }
        }

        if (response) {
          const rawText = response.text || "{}";
          const parsed = JSON.parse(rawText.trim());
          if (parsed.messages && Array.isArray(parsed.messages)) {
            parsed.messages.forEach((msg: any, msgIdx: number) => {
              const matchCoin = chunk.find(c => c.symbol.toLowerCase() === msg.symbol?.toLowerCase() && !generatedMessages.some(m => getCoinKey(m) === getCoinKey(c))) || (chunk[msgIdx] && !generatedMessages.some(m => getCoinKey(m) === getCoinKey(chunk[msgIdx])) ? chunk[msgIdx] : null);
              if (matchCoin && !generatedMessages.some(m => getCoinKey(m) === getCoinKey(matchCoin))) {
                const formattedComment = sanitizeCommentForAntiSpam(msg.message, matchCoin.symbol);
                generatedMessages.push({
                  name: matchCoin.name,
                  symbol: matchCoin.symbol,
                  url: matchCoin.url,
                  message: formattedComment,
                  sentiment: msg.sentiment === "bearish" ? "bearish" : "bullish",
                });
              }
            });
          }
        }
      }
    } catch (geminiError) {
      const errMsg = (geminiError as Error).message;
      addLog("error", `Gemini API Call failed: ${errMsg}.`);
      st.lastGeminiError = errMsg;
    }
  }

  // 3. Fill ANY remaining missing coins using high-diversity dynamic anti-spam generator (Item 6)
  const remainingMissing = getMissingCoins();
  if (remainingMissing.length > 0) {
    addLog("warning", `Filling ${remainingMissing.length} remaining comments using dynamic anti-spam generator (100% lexical diversity)...`);
    
    const usedCommentsCache = new Set<string>(generatedMessages.map(m => m.message));

    remainingMissing.forEach((coin) => {
      const isBullish = coin.change_24h >= 0;
      const rawComment = generateDynamicUniqueComment(isBullish, usedCommentsCache);
      const sanitized = sanitizeCommentForAntiSpam(rawComment, coin.symbol);
      usedCommentsCache.add(sanitized);

      generatedMessages.push({
        name: coin.name,
        symbol: coin.symbol,
        url: coin.url,
        message: sanitized,
        sentiment: isBullish ? "bullish" : "bearish",
      });
    });
  }

  return generatedMessages;
}

export async function executeGenerateMessages(coinsInput?: Coin[]): Promise<number> {
  let coins = coinsInput || readJsonFile<Coin[]>(st.LAST_TRENDING_FILE, []);
  if (coins.length === 0) {
    throw new Error("No trending coins found in output/last_trending.json. Please fetch trending coins first.");
  }
  const settings = getLocalBotSettings();
  const targetCount = typeof settings.targetCoinsCount === "number" ? settings.targetCoinsCount : 0;
  if (targetCount > 0 && coins.length > targetCount) {
    addLog("info", `[TARGET CAP] Limiting comment generation to top ${targetCount} coins as specified by targetCoinsCount setting.`);
    coins = coins.slice(0, targetCount);
  }
  const generatedMessages = await generateMessagesForCoins(coins);
  await writeJsonFile(st.GENERATED_MESSAGES_FILE, generatedMessages);
  saveBotProgress({ next_index: 0 });
  updateRealGenerateTime();
  return generatedMessages.length;
}
