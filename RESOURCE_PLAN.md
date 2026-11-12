# Resource plan (approved by owner 2026-11-12)
| Resource | Staging | Production |
|---|---|---|
| GitHub | this repo, `staging` branch → Pages preview | `main` → Pages |
| Spreadsheet | `ANE Staging DB` (fake data) | `ANE Production DB` (empty until owner enters real data) |
| Apps Script | `ANE API Staging` | `ANE API Production` |
| Drive | `ANE Staging/{Documents,Receipts,Expense attachments,Backups}` | `ANE Production/{…}` |
No resource is shared between environments. IDs/URLs are stored privately, never in this repo. Created so far: GitHub repo (by owner), Drive folders and both spreadsheets. Pending: both Apps Script projects.
