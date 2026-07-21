# AI Instructions & Developer Context - CoinMarketCap Bot

Please refer to the detailed context and architectural guide in `AGENTS.md`. 

### Key Rules & Developer Invariants:
1. **Never Leak Data**: If no session/account is active or logged in, return empty data sets `[]` across all `/output` file requests and CSV downloads.
2. **Handle API Quota/Leak Diagnostics**: Track `lastOpenAiError` and `lastGeminiError` on the server and pipe them to the `apiStatus` state in the React client.
3. **Keep Client & Server Sync'd**: Rely on Firestore-based bidirectional synchronizations for multi-profile safety.
4. **Build Verification**: Ensure both linter checks (`npm run lint`) and production builds (`npm run build`) are green before completing any changes.
