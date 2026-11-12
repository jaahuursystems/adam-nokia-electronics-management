# Test results
| Date | Suite | Result | Notes |
|---|---|---|---|
| 2026-11-12 | `npm test` (engine/accounting 9, offline queue 4, migration 3, rates-not-seeded 1, formula-guard 1, server speed path 2) | 20/20 pass, Node 22, local only | Not run against real Apps Script/Sheets, browsers or phones |
| 2026-11-12 | Setup menu 4 "Sheets round-trip" on real Sheets (owner ran it) | **FAIL** (formula evaluated) | Fix committed; awaiting re-run |
Nothing else has been run yet; no other claim of testing is made.
| 2026-11-12 | `npm run e2e` (headless Chromium, 390×800, real Code.gs/Engine.gs on a FAKE sheet, 2.5 s artificial latency per request) | pass | Account setup = 1 request, button busy at 250 ms; tab switches 11–37 ms; one save = 1 request, 3.4 s total incl. 2.5 s fake latency. Not real Google, not a real phone. |
| 2026-11-12 | `npm run e2e:flows` (headless Chromium 390×800, real Code.gs/Engine.gs on a FAKE sheet, 0 ms and 1.2 s latency) | pass | Sign-in/setup, 13 screens, POS sale (stock -1), sale listed, new customer created, instant busy state, no JS errors. Not real Google/phone; branch collection, purchasing, expenses forms only opened, not submitted. |
| 2026-11-12 | Call-count test (old vs new Store.gs) | 188 → 59 → 1 Google calls per read | Fake sheet counting service calls; real latency per call unknown |
