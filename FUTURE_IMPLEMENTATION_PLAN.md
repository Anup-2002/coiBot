# Spike Signal & Multi-Account Image Posting - Future Implementation Plan

**Status**: Future Architecture Roadmap (Deferred until current version stabilization is complete)  
**Target Promotion**: **Spike Signal** (`spikesignal.com` / signal analytics platform)  
**Primary Integration Platform**: CoinMarketCap Community Automated Posting Engine  
**Author**: AI Studio Engineering Team  

---

## 🎯 1. Executive Summary & Project Vision

The primary goal of this future expansion is to transform the CoinMarketCap bot into an organic, visual-driven promotion engine for **Spike Signal**. 

Rather than posting generic text comments, the bot will:
1. Fetch trending coins from CoinMarketCap.
2. Retrieve corresponding **Spike Signal chart snapshots or signal JSON data** from an Amazon S3 bucket (or Signal API).
3. Generate **high-conviction, context-aware analysis** that correlates the trending coin's market price with the Spike Signal indicator.
4. Upload the visual chart image alongside the AI commentary directly to CoinMarketCap Community.
5. Distribute posts across multiple authenticated accounts safely without triggering spam filters or multiplying OpenAI API bills.

---

## 🧠 2. Core Strategic Pillars

### Pillar A: Zero-Waste AI Generation (Single-Call Multi-Variant)
* **The Cost Problem**: If 5 accounts post on 30 coins with separate AI calls, that requires 150 LLM calls per cycle, rapidly hitting quota limits and incurring high bills.
* **The Solution**: 
  - **1 Single LLM Request** per batch of 10 coins.
  - The prompt provides the coin metrics and Spike Signal indicator summary (e.g. *RSI divergence, liquidity spike, volume breakout*).
  - The model returns **3 to 5 distinct perspective variants** in one structured JSON response:
    - *Variant 1 (Technical Breakout)*: Focuses on support/resistance and Spike Signal trend lines.
    - *Variant 2 (Momentum & Volume)*: Highlights order flow and sudden volume surges.
    - *Variant 3 (Community Trader)*: Casual tone reacting to the chart pattern.
  - **Cost Impact**: Virtually zero additional cost (adds ~30 output tokens per coin, costing less than $0.00002 per coin on `gpt-4o-mini`).

### Pillar B: S3 Image Pipeline & Local Storage Bounds
* **Storage Footprint**:
  - Image size: ~150 KB to 400 KB per chart snapshot.
  - 20 images max cache: `20 × 300 KB ≈ 6 MB` total disk footprint.
* **Auto-Purge & Retention Policy**:
  - Downloaded S3 assets are saved in a temporary scratchpad: `/output/scratch/signals/`.
  - An automated cleanup routine keeps a rolling window of the latest 20 images.
  - Images older than 2 hours or from previous posting runs are automatically unlinked (`fs.unlinkSync`) so container and EC2 disk usage never accumulates.

### Pillar C: CoinMarketCap Image Posting Engine (Puppeteer Workflow)
* CoinMarketCap's post editor features an image upload input (`input[type="file"]` or dropzone).
* **Automated Upload Sequence**:
  1. Puppeteer navigates to the trending coin's community page.
  2. Types the generated Spike Signal commentary (incorporating the `$CASHTAG`).
  3. Locates the image upload trigger and attaches the local image file via `elementHandle.uploadFile(imagePath)`.
  4. Waits for the thumbnail upload preview confirmation.
  5. Clicks **Post** with human-like click delay.

### Pillar D: Multi-Account 24/7 Staggered Waterfall
* **Anti-Bot Lag Schedule**:
  - Account 1 posts Coin 1 + Chart Image at `T = 0s`.
  - Randomized cooldown: **45s to 90s** (mimicking real trader behavior).
  - Account 2 posts Coin 2 or Coin 1 Variant B at `T = 60s`.
  - Staggered timing prevents concurrent browser RAM overload and ensures zero IP/account spam penalties.

---

## 🏗️ 3. End-to-End Execution Sequence (Future Architecture)

```
[ CoinMarketCap Trending Leaderboard ]
                   │
                   ▼ (Every 1-2 hours)
        [ 1. Fetch Trending Coins ]
                   │
                   ▼
  [ 2. Query S3 Bucket / Signal API ]
   - Match coin symbol ($BTC, $SOL, etc.)
   - Download chart snapshot or render JSON to image
   - Store in /output/scratch/ (bounded 20 files max)
                   │
                   ▼
[ 3. Single-Call AI Commentary Generation ]
   - Passes coin market data + Spike Signal metrics
   - Returns 3-5 distinct trader perspectives
   - Organic mention of Spike Signal chart insights
                   │
                   ▼
  [ 4. Multi-Account Staggered Posting ]
   - Account 1: Posts Variant A + Chart Image
   - Wait 45-75s human-like jitter
   - Account 2: Posts Variant B + Chart Image
   - Verify upload success & log to results.json
                   │
                   ▼
   [ 5. Scratchpad Storage Auto-Purge ]
   - Cleans up temporary image files
   - Updates Firestore cloud telemetry
```

---

## 📋 4. Implementation Phasing & Roadmap

### Phase 1: Current Core Stabilization (IN PROGRESS / ACTIVE)
- [x] Firestore multi-profile session isolation.
- [x] Data leakage prevention (empty payload guards for unauthenticated profiles).
- [x] Real event timestamps (`coinsFetchedAt`, `commentsGeneratedAt`).
- [x] Memory & EC2 footprint optimization (bounded caches, zero runaway leaks).
- [ ] Thorough end-to-end continuous loop testing on single profile before adding complexity.

### Phase 2: Spike Signal & S3 Asset Integration (DEFERRED - FUTURE)
- [ ] Configure AWS S3 Client SDK (`@aws-sdk/client-s3`) using environment credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`).
- [ ] Build S3 image fetcher with fallback logic (if chart image doesn't exist for low-cap coin, post high-impact text-only).
- [ ] Implement scratchpad image cache with strict 20-file cap and automatic FIFO cleanup.

### Phase 3: Puppeteer Image Attachment Engine (DEFERRED - FUTURE)
- [ ] Inspect and map CoinMarketCap community image upload DOM selectors.
- [ ] Implement `fileChooser` / `uploadFile` handling in `server.ts`.
- [ ] Add visual upload verification (ensure image preview attaches before submit).

### Phase 4: Multi-Account Rotation & Promotion Tuning (DEFERRED - FUTURE)
- [ ] Implement Single-Call Multi-Variant generation in `executeGenerateMessages()`.
- [ ] Implement Interleaved Multi-Account rotation with randomized 45–90s delays.
- [ ] Add Spike Signal engagement telemetry (tracking clicks and community upvotes).

---

## 💡 5. Analysis: Why Stabilizing First is the Right Decision

1. **Rock-Solid Foundation**: By keeping the bot 100% stable with session handling, accurate timestamps, and zero data leakage, any future feature (like S3 images or multi-account rotation) plugs in cleanly without breaking existing functionality.
2. **Predictable Resource Costs**: Image manipulation and multi-account Chromium instances consume more RAM and CPU. Having our memory baseline locked down first guarantees the server will never crash when running 24/7 on AWS EC2 or Cloud Run.
3. **High Conversion for Spike Signal**: Spike Signal will benefit tremendously from charts. Crypto traders on CoinMarketCap ignore pure text spam, but pay close attention to high-resolution technical charts and indicators showing clear entry/exit signals.
