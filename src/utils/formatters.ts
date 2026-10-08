// Helper utilities and formatters for comments, CSV, and sessions

export function formatCommentWithCashtag(comment: string, symbol: string): string {
  if (!symbol) return comment;
  const sym = symbol.trim().toUpperCase();
  const cashtag = `$${sym}`;
  
  // If the cashtag is already present as a distinct tag, keep as is
  if (comment.toUpperCase().includes(cashtag)) {
    return comment;
  }
  
  // If the symbol appears as a standalone word without $, replace the first occurrence
  const escapedSym = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordRegex = new RegExp(`\\b${escapedSym}\\b`, "i");
  if (wordRegex.test(comment)) {
    return comment.replace(wordRegex, cashtag);
  }
  
  // Otherwise, prepend the cashtag to ensure CoinMarketCap tags the token
  return `${cashtag} - ${comment}`;
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
