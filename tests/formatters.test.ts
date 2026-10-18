import { describe, it, expect } from "vitest";
import {
  cleanCommentForCmc,
  formatCommentWithCashtag,
  escapeCsvField,
  sessionHasValidCookies,
  normalizeStateJson,
  hasRealAuthCookies,
} from "../src/utils/formatters";

describe("Formatters and Session Helpers", () => {
  it("cleans comment for CoinMarketCap to prevent duplicate tags and glued words", () => {
    // Strips leading cashtag
    expect(cleanCommentForCmc("$DGAI Seeing $DGAI struggle in this market", "DGAI")).toBe("Seeing DGAI struggle in this market");
    // Strips glued cashtag with hyphen or colon
    expect(cleanCommentForCmc("$ELGATO - Wow, momentum is impressive!", "ELGATO")).toBe("Wow, momentum is impressive!");
    // Strips mid-comment cashtags
    expect(cleanCommentForCmc("Accumulation looking steady for $SOL here", "SOL")).toBe("Accumulation looking steady for SOL here");
    // Capitalizes first letter
    expect(cleanCommentForCmc("solid volume expansion", "BTC")).toBe("Solid volume expansion");
  });

  it("formats comment with cashtag correctly", () => {
    // Already has cashtag
    expect(formatCommentWithCashtag("Bullish on $BTC today", "BTC")).toBe("Bullish on $BTC today");
    // Standalone symbol replacement
    expect(formatCommentWithCashtag("Strong momentum on BTC right now", "BTC")).toBe("Strong momentum on $BTC right now");
    // Prepending cashtag if absent
    expect(formatCommentWithCashtag("Looking very strong today", "SOL")).toBe("$SOL - Looking very strong today");
  });

  it("escapes CSV fields according to RFC 4180", () => {
    expect(escapeCsvField('Bitcoin "King"')).toBe('"Bitcoin ""King"""');
    expect(escapeCsvField('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
    expect(escapeCsvField('Simple')).toBe('"Simple"');
    expect(escapeCsvField(null)).toBe('""');
    expect(escapeCsvField(42)).toBe('"42"');
  });

  it("validates session cookies accurately", () => {
    expect(sessionHasValidCookies("")).toBe(false);
    expect(sessionHasValidCookies("{}")).toBe(false);
    expect(sessionHasValidCookies('{"cookies":[]}')).toBe(false);
    expect(sessionHasValidCookies('{"cookies":[{"name":"test","value":"123"}]}')).toBe(true);
    expect(sessionHasValidCookies('[{"name":"test","value":"123"}]')).toBe(true);
  });

  it("normalizes stateJson format", () => {
    const rawArray = JSON.stringify([{ name: "session", value: "abc" }]);
    const normalized = normalizeStateJson(rawArray);
    const parsed = JSON.parse(normalized);
    expect(parsed).toHaveProperty("cookies");
    expect(parsed).toHaveProperty("origins");
    expect(parsed.cookies.length).toBe(1);
  });

  it("identifies real auth cookies vs guest/visitor tokens", () => {
    expect(hasRealAuthCookies([])).toBe(false);
    // Guest/visitor cookies should be rejected
    expect(hasRealAuthCookies([
      { name: "visitor_token", value: "12345678901234567890123456789012345" },
      { name: "device_auth", value: "12345678901234567890123456789012345" }
    ])).toBe(false);
    // Real Authorization cookie
    expect(hasRealAuthCookies([
      { name: "Authorization", value: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" }
    ])).toBe(true);
  });
});
