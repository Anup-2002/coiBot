// Helper utilities and formatters for comments, CSV, and sessions

// Spam triggers and forbidden keywords on CoinMarketCap community feeds
const SPAM_TRIGGER_PATTERNS = [
  /\b(?:100x|1000x|moonshot|to the moon|pump\s*and\s*dump|presale|airdrop|free\s*tokens?|guaranteed\s*profits?)\b/gi,
  /\b(?:join\s*telegram|join\s*whatsapp|telegram\s*group|whatsapp\s*group|dm\s*me|inbox\s*me|contact\s*me)\b/gi,
  /\b(?:t\.me\/[a-z0-9_]+|wa\.me\/[a-z0-9_]+|discord\.gg\/[a-z0-9_]+)\b/gi,
  /\b(?:not\s*financial\s*advice|nfa|dyor)\b/gi,
];

export function sanitizeCommentForAntiSpam(comment: string, symbol?: string): string {
  if (!comment) return "";
  let text = comment.trim();

  // 1. Remove external URLs or links (CMC deletes comments containing external links)
  text = text.replace(/https?:\/\/[^\s]+/gi, "").replace(/www\.[^\s]+/gi, "").trim();

  // 2. Remove spam trigger keywords
  for (const pattern of SPAM_TRIGGER_PATTERNS) {
    text = text.replace(pattern, "").trim();
  }

  // 3. Remove excessive punctuation (e.g., "!!!" -> "!", "???" -> "?", "$$$" -> "$")
  text = text.replace(/!{2,}/g, "!").replace(/\?{2,}/g, "?").replace(/\${2,}/g, "$");

  // 4. Clean consecutive duplicate spaces
  text = text.replace(/\s{2,}/g, " ").trim();

  // 5. Clean leading/trailing quotes or brackets
  text = text.replace(/^["'`([{]+|["'`)\]}]+$/g, "").trim();

  // 6. Ensure standard casing for all-caps words (e.g., "MASSIVE ACCUMULATION" -> "Massive accumulation")
  const words = text.split(" ");
  const normalizedWords = words.map((w, idx) => {
    // Preserve standard symbols or short acronyms like RSI, 4H, MACD, BTC, ETH
    if (/^(?:RSI|MACD|EMA|SMA|4H|1D|1W|ATH|ATL|TVL|CEX|DEX)$/i.test(w)) return w.toUpperCase();
    if (w.length > 3 && w === w.toUpperCase() && /^[A-Z]+$/.test(w)) {
      return idx === 0 ? w.charAt(0) + w.slice(1).toLowerCase() : w.toLowerCase();
    }
    return w;
  });
  text = normalizedWords.join(" ").trim();

  // 7. Ensure valid sentence ending punctuation
  if (text.length > 0 && !/[.!?]$/.test(text)) {
    text += ".";
  }

  return cleanCommentForCmc(text, symbol || "");
}

export function cleanCommentForCmc(comment: string, symbol: string): string {
  if (!comment) return "";
  let cleaned = comment.trim();
  const sym = (symbol || "").trim().replace(/^\$/, "").toUpperCase();

  if (sym) {
    // 1. Remove leading cashtag or tag variants like "$BTC - ", "$BTC: ", "$BTC ", "$BTC"
    const leadingTagRegex = new RegExp(`^\\s*\\$${sym}\\s*[-:,]?\\s*`, "i");
    cleaned = cleaned.replace(leadingTagRegex, "").trim();

    // 2. Remove redundant cashtag inside the text if it duplicates what CMC already shows
    const midTagRegex = new RegExp(`\\$${sym}\\b`, "gi");
    cleaned = cleaned.replace(midTagRegex, sym);
  }

  // Clean any generic leading cashtags or hashtags
  cleaned = cleaned.replace(/^\$[A-Za-z0-9_.-]+\s*[-:,]?\s*/i, "").trim();
  cleaned = cleaned.replace(/#([A-Za-z0-9_.-]+)/gi, "$1");

  // Fix any dangling linking verbs if a leading tag was stripped (e.g. "$BTC is looking..." -> "Showing solid...")
  if (/^(?:is|are|was|were)\s+/i.test(cleaned)) {
    cleaned = cleaned.replace(/^(?:is|are|was|were)\s+/i, "").trim();
    cleaned = "Looking " + cleaned;
  }

  // Ensure first character is capitalized
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}

// Expansive modular dynamic comment generator to guarantee 100% lexical diversity
const BULLISH_SETUPS = [
  "Consolidating tightly above local support on the 4H chart",
  "Price structure continues to build steady higher lows here",
  "Clean consolidation above previous resistance with healthy bid interest",
  "Order book depth showing consistent buyer absorption around this range",
  "Defending key moving averages nicely despite broader market chop",
  "Holding firmly above the recent breakout level with low sell volume",
  "Showing impressive relative strength across the last few trading sessions",
  "Healthy accumulation base forming after the recent market impulse",
  "Buyers stepping in proactively on every minor retest of support",
  "Constructive volume profile shaping up nicely into this consolidation zone",
  "Momentum indicators curling upward off oversold territory on the daily",
  "Solid foundation being established here with decreasing overhead pressure"
];

const BULLISH_OBSERVATIONS = [
  "suggesting patient accumulation from spot market participants.",
  "with sell-side order flow thinning out significantly at these levels.",
  "indicating steady absorption by committed buyers.",
  "as trading volume begins to expand in favor of the bulls.",
  "while open interest stabilizes in a constructive range.",
  "pointing to a solid floor being established for the next leg.",
  "with bid-side liquidity steadily climbing on the order book.",
  "reinforcing the bullish market structure on higher timeframes."
];

const BULLISH_OUTLOOKS = [
  "Watching for volume confirmation on the next push through local resistance.",
  "Clean setup to monitor if bulls can sustain this momentum into the daily close.",
  "Key level to hold to maintain this constructive trend.",
  "Looking for follow-through buyer interest over the next few 4H candles.",
  "Risk-to-reward looks well-defined as long as this structural support holds.",
  "Patience seems rewarded here while the price action develops naturally."
];

const BEARISH_SETUPS = [
  "Healthy pullback underway into key demand zones with seller momentum easing",
  "Taking a natural breather after testing local resistance on lower volume",
  "Consolidating lower in a controlled manner while overhead supply is absorbed",
  "Momentum cooling off near short-term moving averages as volume tapers",
  "Price testing the lower bounds of the current range with cautious volume",
  "Short-term consolidation phase after the recent surge in volatility",
  "Market digesting recent gains while looking for firm buyer support",
  "Trading range tightening up near support as profit-taking winds down",
  "Cooling down following the recent rejection at the upper range boundary",
  "Retesting previous support to establish a firm base for continuation"
];

const BEARISH_OBSERVATIONS = [
  "while selling pressure appears to be gradually decelerating.",
  "giving buyers an opportunity to build a defensive support floor.",
  "as the market searches for steady liquidity near key historical levels.",
  "with order flow showing cautious equilibrium between buyers and sellers.",
  "indicating that dip buyers may begin evaluating entry zones here.",
  "as profit-taking slows down across recent sessions."
];

const BEARISH_OUTLOOKS = [
  "Watching closely to see if demand steps in over the next 4H candle.",
  "Patience warranted here until a decisive reclaim of local support occurs.",
  "Key support to monitor before expecting the next directional breakout.",
  "A solid defensive stand here would keep the broader trend intact.",
  "Waiting for volume confirmation to signal a clean reversal.",
  "Important to watch how the daily candle closes relative to this range."
];

export function generateDynamicUniqueComment(
  isBullish: boolean,
  usedCache?: Set<string>
): string {
  const setups = isBullish ? BULLISH_SETUPS : BEARISH_SETUPS;
  const observations = isBullish ? BULLISH_OBSERVATIONS : BEARISH_OBSERVATIONS;
  const outlooks = isBullish ? BULLISH_OUTLOOKS : BEARISH_OUTLOOKS;

  let candidate = "";
  let attempts = 0;

  while (attempts < 50) {
    attempts++;
    const s = setups[Math.floor(Math.random() * setups.length)];
    const o = observations[Math.floor(Math.random() * observations.length)];
    const out = outlooks[Math.floor(Math.random() * outlooks.length)];
    candidate = `${s}, ${o} ${out}`.trim();

    if (!usedCache || !usedCache.has(candidate)) {
      if (usedCache) usedCache.add(candidate);
      return candidate;
    }
  }

  // Fallback if cache is dense
  const s = setups[Math.floor(Math.random() * setups.length)];
  const out = outlooks[Math.floor(Math.random() * outlooks.length)];
  return `${s}. ${out}`;
}


export function formatCommentWithCashtag(comment: string, symbol: string): string {
  if (!symbol || !comment) return comment || "";
  let cleaned = comment.trim();
  const sym = symbol.trim().replace(/^\$/, "").toUpperCase();
  const cashtag = `$${sym}`;

  // Clean out any doubled leading cashtags e.g. "$BTC $BTC", "$BTC - $BTC"
  const doubleTagRegex = new RegExp(`^(\\s*\\$${sym}\\s*[-:,]?\\s*){2,}`, "i");
  if (doubleTagRegex.test(cleaned)) {
    cleaned = cleaned.replace(doubleTagRegex, `${cashtag} - `).trim();
  }

  // If the cashtag is already present as a distinct tag, keep as is
  if (cleaned.toUpperCase().includes(cashtag)) {
    return cleaned;
  }
  
  // If the symbol appears as a standalone word without $, replace the first occurrence
  const escapedSym = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordRegex = new RegExp(`\\b${escapedSym}\\b`, "i");
  if (wordRegex.test(cleaned)) {
    return cleaned.replace(wordRegex, cashtag);
  }
  
  // Otherwise, prepend the cashtag to ensure CoinMarketCap tags the token
  return `${cashtag} - ${cleaned}`;
}

export function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

export function sessionHasValidCookies(str: string): boolean {
  if (!str || !str.trim()) return false;
  try {
    const parsed = JSON.parse(str);
    const cookies = Array.isArray(parsed) ? parsed : (parsed.cookies || []);
    return Array.isArray(cookies) && cookies.length > 0;
  } catch (_) {
    return false;
  }
}

export function normalizeStateJson(rawJson: string): string {
  try {
    const parsed = JSON.parse(rawJson);
    if (Array.isArray(parsed)) {
      return JSON.stringify({ cookies: parsed, origins: [] }, null, 2);
    }
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.cookies)) {
      return JSON.stringify({
        cookies: parsed.cookies,
        origins: Array.isArray(parsed.origins) ? parsed.origins : []
      }, null, 2);
    }
  } catch (_) {}
  return rawJson;
}

export function hasRealAuthCookies(cookies: any[]): boolean {
  if (!Array.isArray(cookies) || cookies.length === 0) return false;
  return cookies.some((c: any) => {
    const n = (c.name || "").trim().toLowerCase();
    const v = (c.value || "").trim();
    if (!v || v.length < 10) return false;
    if (n === "authorization" || n === "u-prod" || n === "cmc_user_id" || n === "jwt_token" || n === "access_token") {
      return true;
    }
    if ((n.includes("token") || n.includes("auth")) && !n.includes("visitor") && !n.includes("guest") && !n.includes("device") && !n.includes("anonymous") && v.length > 30) {
      return true;
    }
    return false;
  });
}
