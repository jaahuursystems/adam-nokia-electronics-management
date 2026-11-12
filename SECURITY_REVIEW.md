# Security review (initial, from reading supplied code)
- Web app runs as owner and is callable by anyone; safety rests on per-request token + permission checks in the engine. Tokens stored hashed server-side.
- Passwords: salted SHA-256 × 1000 — weak; to be strengthened (more rounds + server-side secret) without changing the login experience.
- Lockout after 5 failures; setup codes single-use, 72 h.
- Manifest requests full Drive scope — to be narrowed.
- Whole DB read on every request under a global script lock: safe for consistency, performance to be measured.
- Never commit IDs, codes, tokens, real data. Real Apps Script behaviour is untested.
