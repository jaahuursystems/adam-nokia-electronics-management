/* Adam Nokia Electronics SMS — web API (Google Apps Script).
   Deploy: Execute as "Me", access "Anyone". The URL is therefore PUBLIC; security comes from per-user session tokens and
   server-side permission checks inside Engine.gs on every call — never from keeping the URL secret. */

var API_VERSION = '0.3.1-integration-candidate';

/* Engine asks for random bytes here. Utilities.getUuid() is backed by Java SecureRandom. */
function ANE_RANDOM_HEX(n) { var s = ''; while (s.length < n * 2) s += Utilities.getUuid().replace(/-/g, ''); return s.slice(0, n * 2); }

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fail_(code, msg) { return { ok: false, data: null, error: { code: code, message: msg } }; }

/* Health check only. Returns nothing about the business. */
function doGet(e) { return json_({ ok: true, data: { app: 'ane-sms-api', version: API_VERSION } }); }

function doPost(e) {
  var res;
  try {
    var raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 200000) return json_(fail_('BAD_REQUEST', 'Invalid request'));
    var req; try { req = JSON.parse(raw); } catch (x) { return json_(fail_('BAD_REQUEST', 'Invalid JSON')); }
    if (!req || typeof req.action !== 'string' || req.action.length > 60) return json_(fail_('BAD_REQUEST', 'Invalid request'));
    res = handle_(req);
  } catch (ex) {
    console.error('API error: ' + (ex && ex.message));      /* never log tokens, passwords or request bodies */
    res = fail_('INTERNAL', 'Server error. Please try again.');
  }
  return json_(res);
}

/* Every request (reads included) runs under the script lock so nobody reads half-written data and two phones can never interleave stock/financial writes. */
function handle_(req) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return fail_('LOCKED_RETRY', 'The system is busy. Please try again in a moment.');
  try {
    Store.ensureExistingSchema();
    var st = Store.load();
    var beforeMigration = JSON.stringify({ meta: st.db.meta, settings: st.db.settings, roles: st.db.roles, branches: st.db.branches, suppliers: st.db.suppliers, pos: st.db.pos, poItems: st.db.poItems, receipts: st.db.receipts, expenses: st.db.expenses, reconPeriods: st.db.reconPeriods, reconRevs: st.db.reconRevs });
    ANE.migrate(st.db); /* additive, id-preserving migration; no inventory/customer/sale rows are recreated */
    var dirty = beforeMigration !== JSON.stringify({ meta: st.db.meta, settings: st.db.settings, roles: st.db.roles, branches: st.db.branches, suppliers: st.db.suppliers, pos: st.db.pos, poItems: st.db.poItems, receipts: st.db.receipts, expenses: st.db.expenses, reconPeriods: st.db.reconPeriods, reconRevs: st.db.reconRevs });
    var eng = new ANE.Engine(st.db, { onChange: function () { dirty = true; } });
    var txn = typeof req.client_txn_id === 'string' && /^[A-Za-z0-9_.:-]{6,80}$/.test(req.client_txn_id) ? req.client_txn_id : undefined;
    var token = typeof req.token === 'string' ? req.token : '', res;
    if (req.action === 'batch') {
      /* Several READ actions answered from one database load (one round trip instead of many). Writes are refused here. */
      var list = (req.payload && req.payload.requests) || [], out = [];
      if (!Array.isArray(list) || list.length > 20) return fail_('BAD_REQUEST', 'Invalid batch');
      for (var bi = 0; bi < list.length; bi++) {
        var q = list[bi] || {};
        if (typeof q.action !== 'string' || eng.isWrite(q.action)) { out.push({ ok: false, error: { code: 'BAD_REQUEST', message: 'Only read actions may be batched' } }); continue; }
        out.push(eng.dispatch({ action: q.action, token: token, payload: (q.payload && typeof q.payload === 'object') ? q.payload : {} }));
      }
      res = { ok: true, data: out };
    } else {
      res = eng.dispatch({ action: req.action, token: token, payload: (req.payload && typeof req.payload === 'object') ? req.payload : {}, client_txn_id: txn });
      /* Return fresh data with the answer so the app does not need a second request. */
      if (res.ok && !res.duplicate && (req.action === 'auth.login' || req.action === 'auth.setup' || eng.isWrite(req.action))) {
        var tk = (res.data && res.data.token) || token, snap = eng.dispatch({ action: 'data.snapshot', token: tk, payload: {} });
        if (snap.ok) { if (req.action === 'auth.login' || req.action === 'auth.setup') res.data.snapshot = snap.data; else res.snapshot = snap.data; }
      }
    }
    if (!res.ok && res.error.code === 'INTERNAL') { console.error('Engine error: ' + res.error.message); res.error.message = 'Server error. Please try again.'; }
    /* A reset first makes a private copy of the whole database; if the copy fails, nothing is deleted. */
    if (req.action === 'system.reset' && res.ok && !res.duplicate) {
      try { preResetBackup(); } catch (bx) { console.error('Pre-reset backup failed: ' + (bx && bx.message)); return fail_('BACKUP_FAILED', 'Could not make the safety backup, so nothing was deleted. Please try again.'); }
    }
    if (dirty) Store.save(st.db, st.snap);     /* failed writes never set dirty, so a half-applied failed action is discarded, not saved */
    res.server_time = new Date().toISOString();
    return res;
  } finally { lock.releaseLock(); }
}
