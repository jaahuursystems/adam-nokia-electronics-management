# Implementation plan
1. **Repo + records** (done in part). 2. **Sample seed** (fake data only) + tests for separate ledgers. 3. **Apps Script staging project** (owner creates; I supply files + click list); run Sheets self-test on real service.
4. **Backend additions:** barcode field + lookup, cash closing, wallet balances from transactions, expense attachments, Drive PDF receipts/invoices, daily branch invoices, backup + tested restore, stronger password hashing (invisible to staff), full-day sessions + logout.
5. **Frontend:** simplest-possible POS, camera barcode scan, loading/offline/error states, outbox status.
6. **Testing:** accounting, security, integration against staging, mobile, offline.
7. **Staging deploy → owner testing → release report → production only on explicit approval.**
