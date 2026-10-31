# AI Instructions & Developer Context - CoinMarketCap Bot

Please refer to the detailed context, directory map, and architectural guide in `PROJECT_STRUCTURE.md`, `AGENTS.md`, and `AI_CONTEXT.md`.

### Key Rules & Developer Invariants:
1. **Never Leak Data**: If no session/account is active or logged in, return empty data sets `[]` across all `/output` file requests and CSV downloads.
2. **Handle API Quota/Leak Diagnostics**: Track `lastOpenAiError` and `lastGeminiError` on the server and pipe them to the `apiStatus` state in the React client.
3. **Keep Client & Server Sync'd**: Rely on Firestore-based bidirectional synchronizations for multi-profile safety.
4. **Build Verification**: Ensure both linter checks (`npm run lint`) and production builds (`npm run build`) are green before completing any changes.
5. **Read & Maintain `AI_CONTEXT.md`**: Always read `AI_CONTEXT.md` at the start of every session and update it after every significant change.
6. **Always Keep Local Run (`http://localhost:3000`) Alive & Provide Simple Browser Shortcut**: Because Antigravity crashes or restarts stop background tasks, ALWAYS check if `http://localhost:3000` is running at the start of work and after completing any build/change. If it is stopped, immediately start `npm run dev` (`IsDaemon: true`) with the real `.env` so the user can always view the live result at `http://localhost:3000`. Whenever reporting the local server to the user, always include the **Simple Browser** shortcut (`Ctrl + Shift + B` via `.vscode/tasks.json`) and the clickable IDE command links: `[Open localhost:3000 in Simple Browser](command:simpleBrowser.show?%5B%22http%3A%2F%2Flocalhost%3A3000%2F%22%5D)` / `[Open Side-by-Side](command:simpleBrowser.api.open?%5B%22http%3A%2F%2Flocalhost%3A3000%2F%22%2C%7B%22viewColumn%22%3A-2%7D%5D)`.
