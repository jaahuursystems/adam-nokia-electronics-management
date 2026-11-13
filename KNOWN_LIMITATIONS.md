# Known limitations (current)
Staging Apps Script project exists; speed improvements measured only on a fake sheet (real latency unverified). Missing: barcodes, cash closing, wallet balances, expense attachments, Drive PDFs/daily branch invoices, tested backup restore, camera scanning. Password hashing is weak. Not tested on real phones. The offline queue has only been unit-tested.

- Somali screen text is a built-in starting dictionary translated by the assistant, not a professional translation. Phrases not in the dictionary (and product/customer names) stay in English. Managers can correct wording in Settings → Language.
- Reset cannot reach phones that still hold unsynced transactions; the reset screen blocks only on the device being used. Sync all devices first.
- Reset does not delete Drive files already created (none are generated yet).
