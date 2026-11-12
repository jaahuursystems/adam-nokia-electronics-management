# Adam Nokia Electronics Management System

Mobile-first PWA for a phone-parts wholesale/retail business in Hargeisa, Somaliland: POS, inventory, customer credit, four-branch collections and reconciliation, purchasing, finance and reports, with offline support.

**Stack:** GitHub Pages PWA (`docs/`) → Google Apps Script web app (`apps-script/`) → Google Sheets database → Google Drive (documents, receipts, backups). No paid services.

**Status:** under active development — *not yet a production release*. See `BUILD_LOG.md`, `IMPLEMENTATION_PLAN.md` and `KNOWN_LIMITATIONS.md`.

## Layout
| Path | Contents |
|---|---|
| `docs/` | The PWA served by GitHub Pages (`js/config.js` holds the API URL) |
| `apps-script/` | Backend source: `Code.gs` (web endpoint), `Engine.gs` (business rules), `Store.gs` (Sheets layer), `Setup.gs` (admin menu), `appsscript.json` |
| `tests/` | Node tests (`npm test`) |
| `*.md` | Project records |

## Rules for this public repository
No real business data, spreadsheet/folder IDs, passwords, setup codes or tokens are ever committed. Deployment values live in Apps Script *Script Properties* and in the private Drive.

## Run tests
`npm test` (Node 18+). Tests do not prove real Apps Script / Sheets behaviour — see `TEST_RESULTS.md`.
