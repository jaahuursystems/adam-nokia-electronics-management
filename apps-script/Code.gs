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
    var res = eng.dispatch({ action: req.action, token: typeof req.token === 'string' ? req.token : '', payload: (req.payload && typeof req.payload === 'object') ? req.payload : {}, client_txn_id: txn });
    if (!res.ok && res.error.code === 'INTERNAL') { console.error('Engine error: ' + res.error.message); res.error.message = 'Server error. Please try again.'; }
    if (dirty) Store.save(st.db, st.snap);     /* failed writes never set dirty, so a half-applied failed action is discarded, not saved */
    res.server_time = new Date().toISOString();
    return res;
  } finally { lock.releaseLock(); }
}
