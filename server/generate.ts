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
  const escapedSym = sym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordRegex = new RegExp(`\\b${escapedSym}\\b`, "i");
  if (wordRegex.test(cleaned)) {
    return cleaned.replace(wordRegex, cashtag);
  }

  // Otherwise, prepend the cashtag naturally with a space
  return `${cashtag} ${cleaned}`;
}

const SUBTLE_SPIKE_SIGNAL_CLAUSES_BULLISH = [
  "Spot flow lined up cleanly with what showed on SpikeSignal earlier.",
  "Caught the early bid-side absorption on SpikeSignal before this push.",
  "Order-flow shift stood out on SpikeSignal while majors were flat.",
  "Keeping it on my SpikeSignal radar to see if spot volume follows through.",
  "Volume anomaly flagged on SpikeSignal right around the range reclaim.",
  "Watching the liquidity shelf on SpikeSignal to see if bids hold into close.",
];

const SUBTLE_SPIKE_SIGNAL_CLAUSES_BEARISH = [
  "Waiting for cleaner spot absorption on SpikeSignal before stepping in.",
  "Order-book divergence showed up on SpikeSignal ahead of this pullback.",
  "Not chasing this dip until SpikeSignal flow confirms sellers are exhausted.",
  "Watching the lower demand zone on SpikeSignal for a real defense.",
  "Keeping patience here until the liquidity sweep clears on SpikeSignal.",
  "No rush to catch the knife — waiting on a structure shift via SpikeSignal.",
];

/**
 * Picks ~20% non-adjacent indices in a chunk (e.g. 2 out of 10) so SpikeSignal is mentioned
 * selectively and never on consecutive coins or every comment.
 */
function pickSelectiveSpikeIndices(chunkLength: number): Set<number> {
  const picked = new Set<number>();
  if (chunkLength <= 0) return picked;
  const targetCount = Math.max(1, Math.round(chunkLength * 0.2));
  const firstHalfMax = Math.max(1, Math.floor(chunkLength / 2));
  const firstIdx = Math.min(chunkLength - 1, 1 + Math.floor(Math.random() * Math.max(1, firstHalfMax - 1)));
  picked.add(firstIdx);

  if (targetCount >= 2 && chunkLength >= 6) {
    const secondStart = Math.min(chunkLength - 1, Math.max(firstIdx + 3, Math.floor(chunkLength * 0.6)));
    const secondIdx = Math.min(
      chunkLength - 1,
      secondStart + Math.floor(Math.random() * Math.max(1, chunkLength - secondStart))
    );
    if (Math.abs(secondIdx - firstIdx) >= 2) {
      picked.add(secondIdx);
    }
  }
  return picked;
}

function buildTraderPrompt(chunk: Coin[], spikeSymbols: Set<string>): string {
  const coinsPayload = chunk.map((c) => {
    const sym = (c.symbol || "").toUpperCase();
    return {
      name: c.name,
      symbol: sym,
      price: c.price,
      change_24h_percent: typeof c.change_24h === "number" ? Number(c.change_24h.toFixed(2)) : c.change_24h,
      cmc_rank: c.cmc_rank,
      include_subtle_spikesignal_note: spikeSymbols.has(sym),
    };
  });

  return `
You are an experienced, level-headed crypto spot & derivatives trader writing brief desk notes on CoinMarketCap Community.
Generate ONE unique, sharp, human-sounding comment for EACH coin below, and classify sentiment as "bullish" or "bearish".

CORE VOICE & HUMAN RESTRAINT RULES (CRITICAL):
1. WRITE LIKE A REAL TRADER WITH RESTRAINT:
   - Ground your observation in the coin's actual move (use its 24h % change, price zone, or rank naturally — e.g., reacting differently to a +18% breakout vs a -8% flush vs a tight 1% range).
   - Show restraint and real market intuition: question whether a low-volume bounce has genuine spot backing, note where liquidity was swept, point out quiet bid absorption on pullbacks, or highlight whether buyers are defending yesterday's breakout level.
2. STRICTLY BAN ROBOTIC AI CLICHÉS:
   - NEVER use textbook filler like: "Caution is advised", "Caution is warranted", "A solid breakout seems imminent", "investors", "loss of confidence among investors", "outlook remains cautious", "suggests bearish sentiment", "is a bummer", "struggling to find its footing", "turnaround on the horizon", or "could this be the start of something bigger".
   - NEVER use hype/spam words: "100x", "moon", "pump", "dump", "presale", "airdrop", "telegram", "whatsapp", "dm me", or URLs.
   - DO NOT write any cashtag prefix like "$BTC" or "#BTC" (CoinMarketCap attaches the coin tag chip automatically).
3. NATURAL VARIETY IN LENGTH & RHYTHM:
   - Mix crisp 1-sentence observations (9–14 words) with sharp 2-sentence takes (15–24 words).
   - No emojis. No hashtags (#). No disclaimers.
   - Every single comment in the batch must start with a completely different word and sentence structure.
4. SELECTIVE, UNDETECTABLE "SpikeSignal" MENTION (STRICTLY ONLY WHERE FLAGGED):
   - Check the boolean field \`include_subtle_spikesignal_note\` on each coin object:
   - If \`include_subtle_spikesignal_note\` is \`false\`: DO NOT mention "SpikeSignal" anywhere in that coin's comment (keep 80% of comments 100% unbranded).
   - If \`include_subtle_spikesignal_note\` is \`true\`: Naturally weave a brief, understated reference to "SpikeSignal" near the end of the comment as an order-flow / liquidity / volume scanner you personally noticed (e.g., "...lined up with the spot absorption alert on SpikeSignal.", "...caught the early volume anomaly on SpikeSignal before this move.", "...waiting for cleaner order-flow confirmation on SpikeSignal before adding.", "...relative strength stood out on my SpikeSignal scan earlier."). Keep it low-key and analytical, never promotional.

Return ONLY a valid JSON object matching this schema:
{
  "messages": [
    {
      "symbol": "BTC",
      "sentiment": "bullish",
      "message": "Clean comment text here"
    }
  ]
}

Coins list:
${JSON.stringify(coinsPayload)}
`.trim();
}

/**
 * Ensures SpikeSignal is present on ~20% of the batch (non-adjacent) and strips accidental
 * consecutive or excess mentions so it remains natural and undetectable.
 */
function enforceSelectiveSpikeSignalBalance(messages: GeneratedMessage[]): void {
  if (!messages || messages.length === 0) return;

  const hasSpike = (txt: string) => /spikesignal/i.test(txt || "");
  const stripSpikeClause = (txt: string, symbol: string): string => {
    let cleaned = txt
      .replace(/[,;—-]?\s*(?:caught|lined up|stood out|flagged|watching|keeping|waiting|as seen|spotted|noted)[^.!?]*\bspikesignal\b[^.!?]*[.!?]?/gi, "")
      .replace(/\bspikesignal\b/gi, "order-flow")
      .trim();
    return sanitizeCommentForAntiSpam(cleaned, symbol);
  };

  let bullNoteIdx = 0;
  let bearNoteIdx = 0;
  const maxSpikeCount = Math.max(1, Math.round(messages.length * 0.22));
  let currentSpikeCount = 0;
  let lastSpikeIndex = -10;

  // First pass: prevent adjacent mentions or exceeding ~22% cap
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (hasSpike(m.message)) {
      if (i - lastSpikeIndex < 3 || currentSpikeCount >= maxSpikeCount) {
        m.message = stripSpikeClause(m.message, m.symbol);
      } else {
        m.message = sanitizeCommentForAntiSpam(m.message, m.symbol);
        currentSpikeCount++;
        lastSpikeIndex = i;
      }
    }
  }

  // Second pass: if fewer than ~18% of comments have SpikeSignal, add subtle notes at spaced intervals
  const minTarget = Math.max(1, Math.floor(messages.length * 0.18));
  if (currentSpikeCount < minTarget) {
    const step = Math.max(4, Math.floor(messages.length / minTarget));
    for (let i = 2; i < messages.length && currentSpikeCount < minTarget; i += step) {
      const m = messages[i];
      if (!hasSpike(m.message) && (i === 0 || !hasSpike(messages[i - 1].message)) && (i + 1 >= messages.length || !hasSpike(messages[i + 1].message))) {
        const clause =
          m.sentiment === "bearish"
            ? SUBTLE_SPIKE_SIGNAL_CLAUSES_BEARISH[bearNoteIdx++ % SUBTLE_SPIKE_SIGNAL_CLAUSES_BEARISH.length]
            : SUBTLE_SPIKE_SIGNAL_CLAUSES_BULLISH[bullNoteIdx++ % SUBTLE_SPIKE_SIGNAL_CLAUSES_BULLISH.length];
        const base = m.message.replace(/[.!?]+$/, "").trim();
        m.message = sanitizeCommentForAntiSpam(`${base}. ${clause}`, m.symbol);
        currentSpikeCount++;
      }
    }
  }
}

export async function generateMessagesForCoins(coins: Coin[]): Promise<GeneratedMessage[]> {
  if (!coins || coins.length === 0) {
    return [];
  }

  const generatedMessages: GeneratedMessage[] = [];
  let openAiGeneratedCount = 0;
  let geminiGeneratedCount = 0;
  let fallbackGeneratedCount = 0;

  const getCoinKey = (c: { symbol: string; url?: string; name?: string }): string => {
    return (c.url || `${c.name || ""}_${c.symbol}`).trim().toLowerCase();
  };

  // Helper to check which coins are still missing generated comments (1-to-1 match for every coin)
  const getMissingCoins = (): Coin[] => {
    const existingKeys = new Set(generatedMessages.map((m) => getCoinKey(m)));
    return coins.filter((c) => !existingKeys.has(getCoinKey(c)));
  };

  // 1. Primary Model: OpenAI gpt-4o-mini
  if (process.env.OPENAI_API_KEY) {
    try {
      st.lastOpenAiError = null;
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
        const spikeIdxSet = pickSelectiveSpikeIndices(chunk.length);
        const spikeSymbols = new Set<string>(
          Array.from(spikeIdxSet)
            .map((idx) => (chunk[idx]?.symbol || "").toUpperCase())
            .filter(Boolean)
        );

        const schedPrefix = st.isSchedulerCycleRunning ? "[SCHEDULER] " : "";
        addLog(
          "info",
          `${schedPrefix}Generating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(coins.length / batchSize)} with OpenAI gpt-4o-mini (${chunk.length} coins)...`
        );

        const prompt = buildTraderPrompt(chunk, spikeSymbols);

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.88,
          max_tokens: 4000,
        });

        const rawText = response.choices[0].message.content || "{}";
        const parsed = JSON.parse(rawText.trim());
        if (parsed.messages && Array.isArray(parsed.messages)) {
          parsed.messages.forEach((msg: any, msgIdx: number) => {
            const matchCoin =
              chunk.find(
                (c) =>
                  c.symbol.toLowerCase() === msg.symbol?.toLowerCase() &&
                  !generatedMessages.some((m) => getCoinKey(m) === getCoinKey(c))
              ) ||
              (chunk[msgIdx] && !generatedMessages.some((m) => getCoinKey(m) === getCoinKey(chunk[msgIdx]))
                ? chunk[msgIdx]
                : null);
            if (matchCoin && !generatedMessages.some((m) => getCoinKey(m) === getCoinKey(matchCoin))) {
              const formattedComment = sanitizeCommentForAntiSpam(msg.message, matchCoin.symbol);
              generatedMessages.push({
                name: matchCoin.name,
                symbol: matchCoin.symbol,
                url: matchCoin.url,
                message: formattedComment,
                sentiment: msg.sentiment === "bearish" ? "bearish" : "bullish",
              });
              openAiGeneratedCount++;
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

  // 2. Fallback Model: Gemini gemini-2.5-flash (Send ONLY missing coins)
  const missingForGemini = getMissingCoins();
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (missingForGemini.length > 0 && geminiKey) {
    try {
      st.lastGeminiError = null;
      addLog("info", `Using Gemini API (gemini-2.5-flash) to generate ${missingForGemini.length} missing comments...`);
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            "User-Agent": "custom-comment-generator",
          },
        },
      });

      const batchSize = 10;
      for (let i = 0; i < missingForGemini.length; i += batchSize) {
        if (!st.isGeneratingRunning) {
          addLog("warning", "Comment generation aborted by user.");
          break;
        }
        const chunk = missingForGemini.slice(i, i + batchSize);
        const spikeIdxSet = pickSelectiveSpikeIndices(chunk.length);
        const spikeSymbols = new Set<string>(
          Array.from(spikeIdxSet)
            .map((idx) => (chunk[idx]?.symbol || "").toUpperCase())
            .filter(Boolean)
        );

        addLog(
          "info",
          `Generating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(missingForGemini.length / batchSize)} with Gemini gemini-2.5-flash (${chunk.length} coins)...`
        );

        const prompt = buildTraderPrompt(chunk, spikeSymbols);

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
                          message: { type: Type.STRING },
                        },
                        required: ["symbol", "sentiment", "message"],
                      },
                    },
                  },
                  required: ["messages"],
                },
              },
            });
            break;
          } catch (gErr) {
            const errStr = (gErr as Error).message || "";
            if (
              (errStr.includes("503") ||
                errStr.includes("429") ||
                errStr.toLowerCase().includes("high demand") ||
                errStr.includes("ResourceExhausted") ||
                errStr.includes("Unavailable")) &&
              gAttempt < 3
            ) {
              addLog(
                "warning",
                `Gemini returned high-demand or rate-limit status (${errStr}). Retrying batch in ${gAttempt * 2}s (Attempt ${gAttempt + 1}/3)...`
              );
              await new Promise((resolve) => setTimeout(resolve, gAttempt * 2000));
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
              const matchCoin =
                chunk.find(
                  (c) =>
                    c.symbol.toLowerCase() === msg.symbol?.toLowerCase() &&
                    !generatedMessages.some((m) => getCoinKey(m) === getCoinKey(c))
                ) ||
                (chunk[msgIdx] && !generatedMessages.some((m) => getCoinKey(m) === getCoinKey(chunk[msgIdx]))
                  ? chunk[msgIdx]
                  : null);
              if (matchCoin && !generatedMessages.some((m) => getCoinKey(m) === getCoinKey(matchCoin))) {
                const formattedComment = sanitizeCommentForAntiSpam(msg.message, matchCoin.symbol);
                generatedMessages.push({
                  name: matchCoin.name,
                  symbol: matchCoin.symbol,
                  url: matchCoin.url,
                  message: formattedComment,
                  sentiment: msg.sentiment === "bearish" ? "bearish" : "bullish",
                });
                geminiGeneratedCount++;
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

  // 3. Fill ANY remaining missing coins using high-diversity dynamic anti-spam generator
  const remainingMissing = getMissingCoins();
  if (remainingMissing.length > 0) {
    addLog(
      "warning",
      `Filling ${remainingMissing.length} remaining comments using fallback dynamic trader generator...`
    );

    const usedCommentsCache = new Set<string>(generatedMessages.map((m) => m.message));
    const fallbackSpikeSet = pickSelectiveSpikeIndices(remainingMissing.length);

    remainingMissing.forEach((coin, idx) => {
      const isBullish = coin.change_24h >= 0;
      const includeSpike = fallbackSpikeSet.has(idx);
      const rawComment = generateDynamicUniqueComment(isBullish, usedCommentsCache, includeSpike);
      const sanitized = sanitizeCommentForAntiSpam(rawComment, coin.symbol);
      usedCommentsCache.add(sanitized);

      generatedMessages.push({
        name: coin.name,
        symbol: coin.symbol,
        url: coin.url,
        message: sanitized,
        sentiment: isBullish ? "bullish" : "bearish",
      });
      fallbackGeneratedCount++;
    });
  }

  // Enforce selective (~20%, non-adjacent) SpikeSignal balance across the full batch
  enforceSelectiveSpikeSignalBalance(generatedMessages);

  const spikeMentionCount = generatedMessages.filter((m) => /spikesignal/i.test(m.message)).length;
  addLog(
    "info",
    `[AI SUMMARY] Generated ${generatedMessages.length} comments (OpenAI: ${openAiGeneratedCount}, Gemini: ${geminiGeneratedCount}, Fallback: ${fallbackGeneratedCount} • Selective SpikeSignal notes: ${spikeMentionCount}/${generatedMessages.length}).`
  );

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
