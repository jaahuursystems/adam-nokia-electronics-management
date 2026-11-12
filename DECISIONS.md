# Decisions
- D1 Public repo; no data/secrets in it. (owner)
- D2 Owner creates the two Apps Script projects; assistant prepares everything else. (owner)
- D3 Login stays username + password with one-time setup code; stronger hashing added invisibly; staff signed in for a full work day; any user or manager can log out; managers can revoke sessions. (owner)
- D4 Wallet (Zaad/eDahab) balances come only from recorded transactions for now. (owner)
- D5 Barcodes: optional field, camera + keyboard/USB scanning, unknown code offers "new product". (owner)
- D6 Two independent receivable ledgers (customer credit vs branch reconciliation) — never cross-reduced.
- D7 Exchange rates are never seeded; every transaction keeps the rate used.
- D8 GitHub Pages serves `docs/`; project records live at repo root.

## D-branch-direct-sale
Direct counter sales to a branch use the branch ledger (never ordinary credit). Business total = sum of invoiced branch balances + ordinary credit; sold-not-yet-invoiced and pending-with-branch values are shown as information only.
"Approved" grouping interpreted as credit-approved customers (technicians, repair shops) separated in the picker; Credit payment offered only to them.
