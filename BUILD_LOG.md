# Build log
## 2026-11-12 — Phase 1–3 start
- Reviewed supplied v0.3 materials (staging package, frontend upgrade, patch). The ChatGPT share link could not be read (no content returned).
- Owner approved the resource plan; chose public repo, simple login, wallets from recorded transactions only, optional barcodes with camera scanning.
- Created new private Drive structure (`ANE Staging`, `ANE Production`, each with Documents / Receipts / Expense attachments / Backups) and two empty spreadsheets (`ANE Staging DB`, `ANE Production DB`). IDs kept out of this repo.
- Initial commit: frontend → `docs/`, backend → `apps-script/`, tests → `tests/`. Removed the shop's real phone/email from default settings. All 16 supplied tests pass locally.
- Seed no longer invents exchange rates (new test). Added fake staging seed (`staging/SeedData.gs`) and `tools/bundle.sh`.
- Staging self-test on real Google Sheets FAILED: text `=1+1` was evaluated as a formula even in a text-formatted cell (owner report). Fixed in `Store.gs` with a zero-width-space guard for text starting with `= + - @` (new test `test_formula_guard.js`, simulated Sheets). Self-test in `Setup.gs` now uses the guard and also checks no formulas exist. **Needs re-run on real Sheets.**
